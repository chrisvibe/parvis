from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List
from datetime import date, datetime
import re

# Deliberately permissive: one @, no spaces, a dot in the domain. Enough to catch
# typos without pulling in the email-validator dependency that pydantic's
# EmailStr needs.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

class PlayerBase(BaseModel):
    alias: str
    # Optional here so responses can still serialize players registered before
    # email became mandatory. PlayerCreate makes it required on the way IN.
    email: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    birthdate: Optional[date] = None
    # The three relationships the UI offers. `child_ids` is the inverse of
    # `parent_ids` rather than a store of its own — sending it is a way of
    # saying "make me the parent of these" without having to edit them one by
    # one. `partner_ids` is symmetric: setting it on either side is enough.
    parent_ids: Optional[List[int]] = []
    child_ids: Optional[List[int]] = []
    partner_ids: Optional[List[int]] = []

class PlayerCreate(PlayerBase):
    """Write model for create/update — email is required."""
    email: str

    # None and [] mean different things on the way IN, which is why these are
    # re-declared here with a different default from PlayerBase. A list replaces
    # that relationship entirely, so [] clears it; omitting the field leaves it
    # untouched. With [] as the default instead, a client that sent only
    # parent_ids would silently disown the player's children.
    parent_ids: Optional[List[int]] = None
    child_ids: Optional[List[int]] = None
    partner_ids: Optional[List[int]] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        email = (value or "").strip()
        if not email:
            raise ValueError("Email is required")
        if not EMAIL_PATTERN.match(email):
            raise ValueError("Email must look like name@example.com")
        return email

class Player(PlayerBase):
    id: int
    registration_date: date

    model_config = ConfigDict(from_attributes=True)

class PlayerWithRelations(BaseModel):
    """Player model with parent relationships included."""
    id: int
    alias: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    birthdate: Optional[date] = None
    registration_date: date
    last_game_date: Optional[datetime] = None
    parent_ids: List[int] = []
    child_ids: List[int] = []
    partner_ids: List[int] = []
    # How many finished games this player has taken part in. Carried on the
    # roster so the family tree can show it on hover without asking for every
    # player's statistics one at a time.
    games_played: int = 0

    model_config = ConfigDict(from_attributes=True)

# A game is an ordinary one unless it is said to be the yearly tournament.
# Anything else is stored as given rather than rejected, so a new kind of game
# does not need a backend change to be recorded — only the tournament matters
# to the hall of fame.
GAME_TYPE_STANDARD = "standard"
GAME_TYPE_TOURNAMENT = "tournament"

class GameCreate(BaseModel):
    player_ids: List[int]
    total_rounds: int
    game_type: Optional[str] = GAME_TYPE_STANDARD
    notes: Optional[str] = None
    location: Optional[str] = None
    # Defaults to now when omitted. Overridable at creation, and editable
    # afterwards through the metadata endpoint, because a game recorded the
    # morning after should count for the night it was played — and because the
    # tournament year is read off this field.
    date: Optional[datetime] = None

class Game(BaseModel):
    id: int
    game_type: str
    date: datetime
    notes: Optional[str]
    location: Optional[str]
    total_rounds: int
    current_round: int
    is_active: bool
    is_valid: bool
    # Set only on a game read in from a transcribed score sheet, and only when
    # the checks found something. One doubt per line; the game screen shows them
    # over the matrix until somebody clears them.
    import_warnings: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RoundCreate(BaseModel):
    bets: List[dict]  # [{"player_id": 1, "bet": 5, "success": true}, ...]

class Round(BaseModel):
    id: int
    game_id: int
    round_number: int
    player_id: int
    bet: int
    success: bool
    score: int
    
    model_config = ConfigDict(from_attributes=True)

class PlayerOrder(BaseModel):
    """A game's players in the order they sit. Must be the whole roster."""
    player_ids: List[int]

class GameStats(BaseModel):
    game_id: int
    player_id: int
    player_alias: str
    # Where this player sits, counting from zero. The list is already returned
    # in seat order, so nothing has to sort by it; it is here so a client can
    # tell that it holds a complete, deliberate seating rather than a guess.
    seat: int = 0
    total_score: int
    rounds_played: int
    successful_bets: int
    failed_bets: int
    average_bet: float
    # Same definition as PlayerStats.win_rate, so a player's per-game figures
    # and their lifetime figures are directly comparable.
    win_rate: float = 0.0

class PlayerStats(BaseModel):
    player_id: int
    player_alias: str
    games_played: int
    total_rounds: int
    total_score: int
    successful_bets: int
    failed_bets: int
    average_bet: float
    win_rate: float

class HallOfFameRecord(BaseModel):
    """One "best ever" line."""
    key: str
    label: str
    # Absent when nothing qualifies yet — a fresh database has no record
    # holders, and an empty row says so rather than inventing a zero.
    player_id: Optional[int] = None
    player_alias: Optional[str] = None
    value: Optional[float] = None
    display: str
    detail: Optional[str] = None

class TournamentWinner(BaseModel):
    year: int
    player_alias: str
    player_id: Optional[int] = None
    score: Optional[int] = None
    game_id: Optional[int] = None
    # True for years recorded by hand because they predate the app. Shown
    # differently so nobody mistakes a typed-in name for a computed result.
    is_historical: bool = False

class HallOfFame(BaseModel):
    album_url: Optional[str] = None
    tournament_winners: List[TournamentWinner] = []
    records: List[HallOfFameRecord] = []
