"""
Round service layer for Parvis.

Handles round creation, updates, and validation.
"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Dict
from fastapi import HTTPException

from database import Round, Game
from models import RoundCreate
from utils import (
    get_game_or_404,
    get_round_or_404,
    calculate_score,
    validate_bet
)


class RoundService:
    """Service for round-related operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def add_round(self, game_id: int, round_data: RoundCreate) -> List[Round]:
        """
        Add a new round with bets for all players.
        
        Args:
            game_id: ID of the game
            round_data: Round data with bets for each player
            
        Returns:
            List of created Round instances
            
        Raises:
            HTTPException: If game is not active
        """
        game = get_game_or_404(game_id, self.db)
        
        if not game.is_active:
            raise HTTPException(status_code=400, detail="Game is not active")
        
        # Increment round number
        game.current_round += 1
        round_number = game.current_round
        
        # Create rounds for each player
        created_rounds = []
        for bet_data in round_data.bets:
            score = calculate_score(bet_data["bet"], bet_data["success"])
            
            round_entry = Round(
                game_id=game_id,
                round_number=round_number,
                player_id=bet_data["player_id"],
                bet=bet_data["bet"],
                success=bet_data["success"],
                score=score
            )
            self.db.add(round_entry)
            created_rounds.append(round_entry)
        
        self.db.commit()
        
        # Refresh all rounds
        for r in created_rounds:
            self.db.refresh(r)
        
        return created_rounds
    
    def update_round(self, game_id: int, round_id: int, bet: int, success: bool) -> Round:
        """
        Update an existing round.
        
        Args:
            game_id: ID of the game
            round_id: ID of the round to update
            bet: New bet amount
            success: New success status
            
        Returns:
            Updated Round instance
        """
        round_entry = get_round_or_404(round_id, game_id, self.db)
        
        round_entry.bet = bet
        round_entry.success = success
        round_entry.score = calculate_score(bet, success)
        
        self.db.commit()
        self.db.refresh(round_entry)
        return round_entry
    
    def upsert_round(
        self,
        game_id: int,
        round_number: int,
        player_id: int,
        bet: int,
        success: bool
    ) -> Dict:
        """
        Create or update a single round entry.
        
        Args:
            game_id: ID of the game
            round_number: Round number
            player_id: ID of the player
            bet: Bet amount
            success: Whether the bet was successful
            
        Two people editing the same game matrix can reach the lookup below at
        the same time, both see no row, and both insert. The unique index on
        (game_id, round_number, player_id) is what stops that ending in two rows
        whose scores are both counted; this method's job is to lose that race
        gracefully rather than 500. On collision it re-reads the row the other
        writer committed and applies the update to it, so the last write wins —
        the same outcome as if the two edits had arrived in sequence.

        Returns:
            Dictionary with round data
        """
        get_game_or_404(game_id, self.db)

        # Validate bet range
        validate_bet(bet, round_number)

        score = calculate_score(bet, success)

        def existing():
            return self.db.query(Round).filter(
                Round.game_id == game_id,
                Round.round_number == round_number,
                Round.player_id == player_id
            ).first()

        round_entry = existing()

        if round_entry:
            round_entry.bet = bet
            round_entry.success = success
            round_entry.score = score
            self.db.commit()
        else:
            round_entry = Round(
                game_id=game_id,
                round_number=round_number,
                player_id=player_id,
                bet=bet,
                success=success,
                score=score
            )
            self.db.add(round_entry)
            try:
                self.db.commit()
            except IntegrityError:
                # Someone else inserted this cell between our lookup and our
                # commit. Their row is the one that exists; update it.
                self.db.rollback()
                round_entry = existing()
                if round_entry is None:
                    # Not the duplicate-key case after all — a genuine
                    # constraint failure the caller should hear about.
                    raise
                round_entry.bet = bet
                round_entry.success = success
                round_entry.score = score
                self.db.commit()

        self.db.refresh(round_entry)

        return {
            "id": round_entry.id,
            "game_id": round_entry.game_id,
            "round_number": round_entry.round_number,
            "player_id": round_entry.player_id,
            "bet": round_entry.bet,
            "success": round_entry.success,
            "score": round_entry.score
        }
    
    def get_game_rounds(self, game_id: int) -> List[Round]:
        """
        Get all rounds for a game.
        
        Args:
            game_id: ID of the game
            
        Returns:
            List of Round instances ordered by round_number and player_id
        """
        return self.db.query(Round)\
            .filter(Round.game_id == game_id)\
            .order_by(Round.round_number, Round.player_id)\
            .all()
