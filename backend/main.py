from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import models as schemas
from database import get_db, init_db, Player, Game, GamePlayer, Round
import os

app = FastAPI(title="Parvis API")

# CORS
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

# ============================================================================
# PLAYERS
# ============================================================================

@app.get("/players", response_model=List[schemas.Player])
def get_players(db: Session = Depends(get_db)):
    players = db.query(Player).all()
    # Add parent_ids and last_game_date to response
    result = []
    for player in players:
        player_dict = {
            "id": player.id,
            "alias": player.alias,
            "first_name": player.first_name,
            "middle_name": player.middle_name,
            "last_name": player.last_name,
            "birthdate": player.birthdate,
            "registration_date": player.registration_date,
            "last_game_date": player.last_game_date,
            "parent_ids": [p.id for p in player.parents]
        }
        result.append(player_dict)
    return result

@app.get("/players/{player_id}", response_model=schemas.Player)
def get_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player

@app.get("/players/{player_id}/family")
def get_player_family(player_id: int, db: Session = Depends(get_db)):
    """Get player with parent and child relationships"""
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    return {
        "id": player.id,
        "alias": player.alias,
        "parent_ids": [p.id for p in player.parents],
        "child_ids": [c.id for c in player.children]
    }

@app.put("/players/{player_id}", response_model=schemas.Player)
def update_player(player_id: int, player: schemas.PlayerCreate, db: Session = Depends(get_db)):
    """Update existing player"""
    db_player = db.query(Player).filter(Player.id == player_id).first()
    if not db_player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    # Check if new alias conflicts with another player
    if player.alias != db_player.alias:
        existing = db.query(Player).filter(Player.alias == player.alias).first()
        if existing:
            raise HTTPException(status_code=400, detail="Alias already exists")
    
    # Update basic fields
    for key, value in player.dict(exclude={'parent_ids'}).items():
        setattr(db_player, key, value)
    
    # Update parent relationships
    db_player.parents.clear()
    if player.parent_ids:
        for parent_id in player.parent_ids:
            parent = db.query(Player).filter(Player.id == parent_id).first()
            if parent:
                db_player.parents.append(parent)
    
    db.commit()
    db.refresh(db_player)
    return db_player

@app.post("/players", response_model=schemas.Player)
def create_player(player: schemas.PlayerCreate, db: Session = Depends(get_db)):
    # Check if alias exists
    existing = db.query(Player).filter(Player.alias == player.alias).first()
    if existing:
        raise HTTPException(status_code=400, detail="Alias already exists")
    
    # Create player without parents first
    player_data = player.dict(exclude={'parent_ids'})
    db_player = Player(**player_data)
    db.add(db_player)
    db.flush()  # Get the ID without committing
    
    # Add parent relationships
    if player.parent_ids:
        for parent_id in player.parent_ids:
            parent = db.query(Player).filter(Player.id == parent_id).first()
            if parent:
                db_player.parents.append(parent)
    
    db.commit()
    db.refresh(db_player)
    return db_player

@app.delete("/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    db.delete(player)
    db.commit()
    return {"message": "Player deleted"}

# ============================================================================
# GAMES
# ============================================================================

@app.get("/games", response_model=List[schemas.Game])
def get_games(active_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(Game)
    if active_only:
        query = query.filter(Game.is_active == True)
    return query.order_by(Game.date.desc()).all()

@app.get("/games/{game_id}", response_model=schemas.Game)
def get_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game

@app.post("/games", response_model=schemas.Game)
def create_game(game_data: schemas.GameCreate, db: Session = Depends(get_db)):
    from datetime import datetime
    
    # Create game
    game = Game(
        total_rounds=game_data.total_rounds,
        game_type=game_data.game_type,
        notes=game_data.notes,
        location=game_data.location,
        date=datetime.utcnow()
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    
    # Add players and update their last_game_date
    for player_id in game_data.player_ids:
        game_player = GamePlayer(game_id=game.id, player_id=player_id)
        db.add(game_player)
        
        # Update player's last_game_date
        player = db.query(Player).filter(Player.id == player_id).first()
        if player:
            player.last_game_date = game.date
    
    db.commit()
    db.refresh(game)
    return game

@app.post("/games/{game_id}/finish")
def finish_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game.is_active = False
    game.is_valid = True  # Mark as valid/completed
    db.commit()
    return {"message": "Game finished successfully"}

@app.post("/games/{game_id}/cancel")
def cancel_game(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game.is_active = False
    game.is_valid = False  # Mark as cancelled/invalid
    db.commit()
    return {"message": "Game cancelled"}

@app.post("/games/{game_id}/adjust-rounds")
def adjust_rounds(game_id: int, new_total: int = Query(...), db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if new_total < 1:
        raise HTTPException(status_code=400, detail="Total rounds must be at least 1")
    
    game.total_rounds = new_total
    
    # Get number of players in game
    player_count = db.query(GamePlayer).filter(GamePlayer.game_id == game_id).count()
    
    # Find the highest round that has complete data (all players have entries)
    highest_complete_round = 0
    for round_num in range(1, new_total + 1):
        rounds_count = db.query(Round).filter(
            Round.game_id == game_id,
            Round.round_number == round_num
        ).count()
        
        if rounds_count == player_count:
            highest_complete_round = round_num
        else:
            break  # Stop at first incomplete round
    
    # Set current_round to the next round after the highest complete round
    # But cap at new_total
    game.current_round = min(highest_complete_round + 1, new_total)
    
    db.commit()
    return {"message": f"Total rounds adjusted to {new_total}", "new_total": new_total}

# ============================================================================
# ROUNDS
# ============================================================================

@app.post("/games/{game_id}/rounds", response_model=List[schemas.Round])
def add_round(game_id: int, round_data: schemas.RoundCreate, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    if not game.is_active:
        raise HTTPException(status_code=400, detail="Game is not active")
    
    # Increment round number
    game.current_round += 1
    round_number = game.current_round
    
    # Create rounds for each player
    created_rounds = []
    for bet_data in round_data.bets:
        score = (10 + bet_data["bet"]) if bet_data["success"] else 0
        
        round_entry = Round(
            game_id=game_id,
            round_number=round_number,
            player_id=bet_data["player_id"],
            bet=bet_data["bet"],
            success=bet_data["success"],
            score=score
        )
        db.add(round_entry)
        created_rounds.append(round_entry)
    
    db.commit()
    
    # Refresh all rounds
    for r in created_rounds:
        db.refresh(r)
    
    return created_rounds

@app.put("/games/{game_id}/rounds/{round_id}", response_model=schemas.Round)
def update_round(game_id: int, round_id: int, bet: int, success: bool, db: Session = Depends(get_db)):
    """Update an existing round"""
    round_entry = db.query(Round).filter(Round.id == round_id, Round.game_id == game_id).first()
    if not round_entry:
        raise HTTPException(status_code=404, detail="Round not found")
    
    round_entry.bet = bet
    round_entry.success = success
    round_entry.score = (10 + bet) if success else 0
    
    db.commit()
    db.refresh(round_entry)
    return round_entry

@app.post("/games/{game_id}/rounds/upsert")
def upsert_round(
    game_id: int,
    round_number: int = Query(...),
    player_id: int = Query(...), 
    bet: int = Query(...),
    success: bool = Query(...),
    db: Session = Depends(get_db)
):
    """Create or update a single round entry"""
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Validate bet range: 0 to current_round
    if bet < 0 or bet > round_number:
        raise HTTPException(status_code=400, detail=f"Bet must be between 0 and {round_number}")
    
    # Find existing round
    round_entry = db.query(Round).filter(
        Round.game_id == game_id,
        Round.round_number == round_number,
        Round.player_id == player_id
    ).first()
    
    score = (10 + bet) if success else 0
    
    if round_entry:
        # Update existing
        round_entry.bet = bet
        round_entry.success = success
        round_entry.score = score
    else:
        # Create new
        round_entry = Round(
            game_id=game_id,
            round_number=round_number,
            player_id=player_id,
            bet=bet,
            success=success,
            score=score
        )
        db.add(round_entry)
        
        # Update game's current_round if necessary
        if round_number > game.current_round:
            game.current_round = round_number
    
    db.commit()
    db.refresh(round_entry)
    
    return {
        "id": round_entry.id,
        "game_id": round_entry.game_id,
        "round_number": round_entry.round_number,
        "player_id": round_entry.player_id,
        "bet": round_entry.bet,
        "success": round_entry.success,
        "score": round_entry.score
    }

@app.get("/games/{game_id}/rounds", response_model=List[schemas.Round])
def get_game_rounds(game_id: int, db: Session = Depends(get_db)):
    return db.query(Round).filter(Round.game_id == game_id).order_by(Round.round_number, Round.player_id).all()

# ============================================================================
# STATS
# ============================================================================

@app.get("/games/{game_id}/stats", response_model=List[schemas.GameStats])
def get_game_stats(game_id: int, db: Session = Depends(get_db)):
    # Get game to check total_rounds
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Get all players in the game
    game_players = db.query(GamePlayer).filter(GamePlayer.game_id == game_id).all()
    
    result = []
    for gp in game_players:
        # Get player info
        player = db.query(Player).filter(Player.id == gp.player_id).first()
        if not player:
            continue
            
        # Get stats from rounds (ONLY within game.total_rounds)
        rounds = db.query(Round).filter(
            Round.game_id == game_id,
            Round.player_id == gp.player_id,
            Round.round_number <= game.total_rounds  # Filter by adjusted total
        ).all()
        
        total_score = sum(r.score or 0 for r in rounds)
        rounds_played = len(rounds)
        successful_bets = sum(1 for r in rounds if r.success)
        failed_bets = rounds_played - successful_bets
        average_bet = sum(r.bet for r in rounds) / rounds_played if rounds_played > 0 else 0.0
        
        result.append(schemas.GameStats(
            game_id=game_id,
            player_id=player.id,
            player_alias=player.alias,
            total_score=total_score,
            rounds_played=rounds_played,
            successful_bets=successful_bets,
            failed_bets=failed_bets,
            average_bet=average_bet
        ))
    
    return result

@app.get("/players/{player_id}/stats", response_model=schemas.PlayerStats)
def get_player_stats(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    stats = db.query(
        func.count(func.distinct(Round.game_id)).label('games_played'),
        func.count(Round.id).label('total_rounds'),
        func.sum(Round.score).label('total_score'),
        func.sum(func.cast(Round.success, Integer)).label('successful_bets'),
        func.avg(Round.bet).label('average_bet')
    ).filter(Round.player_id == player_id).first()
    
    total_rounds = stats.total_rounds or 0
    successful_bets = stats.successful_bets or 0
    failed_bets = total_rounds - successful_bets
    win_rate = (successful_bets / total_rounds * 100) if total_rounds > 0 else 0.0
    
    return schemas.PlayerStats(
        player_id=player_id,
        player_alias=player.alias,
        games_played=stats.games_played or 0,
        total_rounds=total_rounds,
        total_score=stats.total_score or 0,
        successful_bets=successful_bets,
        failed_bets=failed_bets,
        average_bet=float(stats.average_bet) if stats.average_bet else 0.0,
        win_rate=win_rate
    )

@app.get("/players/{player_id}/bet-distribution")
def get_player_bet_distribution(player_id: int, db: Session = Depends(get_db)):
    """Get histogram data of player's bets"""
    bets = db.query(
        Round.bet,
        func.count(Round.id).label('count')
    ).filter(Round.player_id == player_id).group_by(Round.bet).order_by(Round.bet).all()
    
    return [{"bet": b.bet, "count": b.count} for b in bets]

@app.get("/health")
def health():
    return {"status": "healthy"}

# Add this import at the top
from sqlalchemy import Integer
