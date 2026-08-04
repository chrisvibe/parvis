from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os

# Local imports
import models as schemas
from database import get_db, init_db, Game
from services import GameService, HallOfFameService, PlayerService, RoundService
from auth import (
    ADMIN_PASSWORD_HEADER,
    PASSWORD_HEADER,
    check_request,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup and shutdown.

    A lifespan handler rather than @app.on_event, which is deprecated and warns
    on every boot. Nothing needs doing on the way down, so the half after the
    yield is empty on purpose.
    """
    init_db()
    yield


app = FastAPI(title="Parvis API", lifespan=lifespan)

# CORS
#
# allow_credentials is off deliberately. Combined with an "*" origin — which is
# what CORS_ORIGINS is set to in practice — it is invalid per the CORS spec and
# browsers reject the pair outright, so the permissive setting bought nothing
# and would have failed at the worst moment. Nothing here needs it either: the
# site and admin passwords travel as request headers, not cookies, and headers
# are unaffected by this flag. If cookie or Basic auth is ever introduced, this
# has to become an explicit origin list rather than being switched back on.
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def password_gate(request: Request, call_next):
    """
    Enforce the optional site and admin passwords.

    A middleware rather than per-route dependencies so that everything is
    covered by default — including /docs and /openapi.json — and so that
    forgetting to decorate a new endpoint cannot silently open a hole.
    """
    rejection = check_request(
        request.method,
        request.url.path,
        request.headers.get(PASSWORD_HEADER),
        request.headers.get(ADMIN_PASSWORD_HEADER),
    )
    if rejection:
        status_code, detail = rejection
        return JSONResponse(status_code=status_code, content={"detail": detail})
    return await call_next(request)

# ============================================================================
# AUTH
# ============================================================================

@app.get("/auth/check")
def auth_check():
    """
    Validate a password. Reaching this handler at all means the gate accepted
    the request, so the login form only has to look at the status code.
    """
    return {"status": "ok"}

# ============================================================================
# PLAYERS
# ============================================================================

@app.get("/players", response_model=List[schemas.PlayerWithRelations])
def get_players(db: Session = Depends(get_db)):
    """Get all players with their parent relationships."""
    service = PlayerService(db)
    return service.get_all_players()


@app.get("/players/{player_id}", response_model=schemas.Player)
def get_player(player_id: int, db: Session = Depends(get_db)):
    """Get a specific player by ID."""
    service = PlayerService(db)
    return service.get_player(player_id)


@app.get("/players/{player_id}/family")
def get_player_family(player_id: int, db: Session = Depends(get_db)):
    """Get player with parent and child relationships."""
    service = PlayerService(db)
    return service.get_player_family(player_id)


@app.put("/players/{player_id}", response_model=schemas.Player)
def update_player(player_id: int, player: schemas.PlayerCreate, db: Session = Depends(get_db)):
    """Update an existing player."""
    service = PlayerService(db)
    return service.update_player(player_id, player)


@app.post("/players", response_model=schemas.Player)
def create_player(player: schemas.PlayerCreate, db: Session = Depends(get_db)):
    """Create a new player."""
    service = PlayerService(db)
    return service.create_player(player)


@app.delete("/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(get_db)):
    """Delete a player."""
    service = PlayerService(db)
    service.delete_player(player_id)
    return {"message": "Player deleted"}

# ============================================================================
# GAMES
# ============================================================================

@app.get("/games", response_model=List[schemas.Game])
def get_games(active_only: bool = False, db: Session = Depends(get_db)):
    """Get all games, optionally filtering to active games only."""
    query = db.query(Game)
    if active_only:
        query = query.filter(Game.is_active == True)
    return query.order_by(Game.date.desc()).all()


@app.get("/games/{game_id}", response_model=schemas.Game)
def get_game(game_id: int, db: Session = Depends(get_db)):
    """Get a specific game by ID."""
    from utils import get_game_or_404
    return get_game_or_404(game_id, db)


@app.post("/games", response_model=schemas.Game)
def create_game(game_data: schemas.GameCreate, db: Session = Depends(get_db)):
    """Create a new game with specified players."""
    service = GameService(db)
    return service.create_game(game_data)


@app.post("/games/{game_id}/finish")
def finish_game(game_id: int, db: Session = Depends(get_db)):
    """Mark a game as finished."""
    service = GameService(db)
    service.finish_game(game_id)
    return {"message": "Game finished successfully"}


@app.post("/games/{game_id}/cancel")
def cancel_game(game_id: int, db: Session = Depends(get_db)):
    """Cancel a game (marks as invalid)."""
    service = GameService(db)
    service.cancel_game(game_id)
    return {"message": "Game cancelled"}


@app.delete("/games/{game_id}")
def delete_game(game_id: int, db: Session = Depends(get_db)):
    """Permanently delete a game and all its data."""
    service = GameService(db)
    service.delete_game(game_id)
    return {"message": "Game deleted permanently"}


@app.post("/games/{game_id}/reactivate")
def reactivate_game(game_id: int, db: Session = Depends(get_db)):
    """Reactivate a finished/cancelled game for editing."""
    service = GameService(db)
    game = service.reactivate_game(game_id)
    return {"message": "Game reactivated for editing", "game_id": game.id}


@app.put("/games/{game_id}/metadata")
def update_game_metadata(
    game_id: int,
    notes: str = Query(None),
    location: str = Query(None),
    game_type: str = Query(None),
    date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db)
):
    """Update game notes, location, type and date."""
    service = GameService(db)
    game = service.update_metadata(game_id, notes, location, game_type, date)
    return {"message": "Game metadata updated", "game": game}


@app.put("/games/{game_id}/player-order")
def set_player_order(
    game_id: int,
    order: schemas.PlayerOrder,
    db: Session = Depends(get_db)
):
    """Reseat a game's players. The body must list exactly this game's roster."""
    service = GameService(db)
    player_ids = service.set_player_order(game_id, order.player_ids)
    return {"message": "Player order updated", "player_ids": player_ids}


@app.post("/games/{game_id}/adjust-rounds")
def adjust_rounds(game_id: int, new_total: int = Query(...), db: Session = Depends(get_db)):
    """Adjust the total number of rounds in a game."""
    service = GameService(db)
    return service.adjust_rounds(game_id, new_total)


@app.post("/games/{game_id}/increment-round")
def increment_current_round(game_id: int, db: Session = Depends(get_db)):
    """Increment current_round by 1 (called by Next Round button)."""
    service = GameService(db)
    return service.increment_current_round(game_id)

# ============================================================================
# ROUNDS
# ============================================================================

@app.post("/games/{game_id}/rounds", response_model=List[schemas.Round])
def add_round(game_id: int, round_data: schemas.RoundCreate, db: Session = Depends(get_db)):
    """Add a new round with bets for all players."""
    service = RoundService(db)
    return service.add_round(game_id, round_data)


@app.put("/games/{game_id}/rounds/{round_id}", response_model=schemas.Round)
def update_round(game_id: int, round_id: int, bet: int, success: bool, db: Session = Depends(get_db)):
    """Update an existing round."""
    service = RoundService(db)
    return service.update_round(game_id, round_id, bet, success)


@app.post("/games/{game_id}/rounds/upsert")
def upsert_round(
    game_id: int,
    round_number: int = Query(...),
    player_id: int = Query(...), 
    bet: int = Query(...),
    success: bool = Query(...),
    db: Session = Depends(get_db)
):
    """Create or update a single round entry."""
    service = RoundService(db)
    return service.upsert_round(game_id, round_number, player_id, bet, success)


@app.get("/games/{game_id}/rounds", response_model=List[schemas.Round])
def get_game_rounds(game_id: int, db: Session = Depends(get_db)):
    """Get all rounds for a game."""
    service = RoundService(db)
    return service.get_game_rounds(game_id)

# ============================================================================
# STATS
# ============================================================================

@app.get("/games/{game_id}/stats", response_model=List[schemas.GameStats])
def get_game_stats(game_id: int, db: Session = Depends(get_db)):
    """Get statistics for all players in a game."""
    service = GameService(db)
    return service.get_game_stats(game_id)


@app.get("/players/{player_id}/stats", response_model=schemas.PlayerStats)
def get_player_stats(player_id: int, db: Session = Depends(get_db)):
    """Get comprehensive statistics for a player across all games."""
    service = PlayerService(db)
    return service.get_player_stats(player_id)


@app.get("/players/{player_id}/bet-distribution")
def get_player_bet_distribution(player_id: int, db: Session = Depends(get_db)):
    """Get histogram data of player's bets."""
    service = PlayerService(db)
    return service.get_bet_distribution(player_id)


@app.get("/hall-of-fame", response_model=schemas.HallOfFame)
def get_hall_of_fame(db: Session = Depends(get_db)):
    """Yearly tournament winners and the all-time records."""
    service = HallOfFameService(db)
    return service.get_hall_of_fame()


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy"}
