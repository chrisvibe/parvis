from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

class PlayerBase(BaseModel):
    alias: str
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    birthdate: Optional[date] = None
    parent_ids: Optional[List[int]] = []

class PlayerCreate(PlayerBase):
    pass

class Player(PlayerBase):
    id: int
    registration_date: date
    
    class Config:
        from_attributes = True

class GameCreate(BaseModel):
    player_ids: List[int]
    total_rounds: int
    game_type: Optional[str] = "standard"
    notes: Optional[str] = None
    location: Optional[str] = None

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
    
    class Config:
        from_attributes = True

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
    
    class Config:
        from_attributes = True

class GameStats(BaseModel):
    game_id: int
    player_id: int
    player_alias: str
    total_score: int
    rounds_played: int
    successful_bets: int
    failed_bets: int
    average_bet: float

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
