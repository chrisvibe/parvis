"""
Database helper utilities for common query patterns.

These helpers reduce code duplication and ensure consistent error handling
across the API.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session
from database import Game, Player, Round
from typing import Optional


def get_game_or_404(game_id: int, db: Session) -> Game:
    """
    Fetch a game by ID or raise 404 if not found.
    
    Args:
        game_id: The ID of the game to fetch
        db: Database session
        
    Returns:
        The Game object
        
    Raises:
        HTTPException: 404 if game not found
    """
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


def get_player_or_404(player_id: int, db: Session) -> Player:
    """
    Fetch a player by ID or raise 404 if not found.
    
    Args:
        player_id: The ID of the player to fetch
        db: Database session
        
    Returns:
        The Player object
        
    Raises:
        HTTPException: 404 if player not found
    """
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


def get_round_or_404(round_id: int, game_id: int, db: Session) -> Round:
    """
    Fetch a round by ID and game ID, or raise 404 if not found.
    
    Args:
        round_id: The ID of the round to fetch
        game_id: The game ID to verify the round belongs to
        db: Database session
        
    Returns:
        The Round object
        
    Raises:
        HTTPException: 404 if round not found in specified game
    """
    round_entry = db.query(Round).filter(
        Round.id == round_id,
        Round.game_id == game_id
    ).first()
    if not round_entry:
        raise HTTPException(status_code=404, detail="Round not found")
    return round_entry


def get_player_by_alias(alias: str, db: Session) -> Optional[Player]:
    """
    Fetch a player by alias.
    
    Args:
        alias: The alias to search for
        db: Database session
        
    Returns:
        The Player object or None if not found
    """
    return db.query(Player).filter(Player.alias == alias).first()
