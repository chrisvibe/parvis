"""
Game service layer for Parvis.

Encapsulates game-related business logic, making it easier to:
- Test business logic independently
- Reuse logic across endpoints
- Manage transactions consistently
"""

from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List, Optional

from database import Game, GamePlayer, Player, Round
from models import GameCreate, GameStats
from utils import (
    get_game_or_404,
    calculate_score,
    validate_positive_int,
    aggregate_rounds,
    rounds_in_game
)
from constants import DEFAULT_GAME_TYPE


class GameService:
    """Service for game-related operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_game(self, game_data: GameCreate) -> Game:
        """
        Create a new game with specified players.
        
        Args:
            game_data: Game creation data including player IDs and settings
            
        Returns:
            Created Game instance
        """
        # Create game
        game = Game(
            total_rounds=game_data.total_rounds,
            game_type=game_data.game_type or DEFAULT_GAME_TYPE,
            notes=game_data.notes,
            location=game_data.location,
            date=datetime.utcnow()
        )
        self.db.add(game)
        self.db.commit()
        self.db.refresh(game)
        
        # Add players and update their last_game_date
        for player_id in game_data.player_ids:
            self._add_player_to_game(game.id, player_id, game.date)
        
        self.db.commit()
        self.db.refresh(game)
        return game
    
    def _add_player_to_game(self, game_id: int, player_id: int, game_date: datetime) -> None:
        """Helper to add a player to a game and update their last_game_date."""
        game_player = GamePlayer(game_id=game_id, player_id=player_id)
        self.db.add(game_player)
        
        # Update player's last_game_date
        player = self.db.query(Player).filter(Player.id == player_id).first()
        if player:
            player.last_game_date = game_date
    
    def finish_game(self, game_id: int) -> Game:
        """
        Mark a game as finished (valid and inactive).
        
        Args:
            game_id: ID of the game to finish
            
        Returns:
            Updated Game instance
        """
        game = get_game_or_404(game_id, self.db)
        game.is_active = False
        game.is_valid = True
        self.db.commit()
        return game
    
    def cancel_game(self, game_id: int) -> Game:
        """
        Cancel a game (invalid and inactive).
        
        Args:
            game_id: ID of the game to cancel
            
        Returns:
            Updated Game instance
        """
        game = get_game_or_404(game_id, self.db)
        game.is_active = False
        game.is_valid = False
        self.db.commit()
        return game
    
    def delete_game(self, game_id: int) -> None:
        """
        Permanently delete a game and all its rounds.
        
        Args:
            game_id: ID of the game to delete
        """
        game = get_game_or_404(game_id, self.db)
        
        # Delete all rounds first (due to foreign key)
        self.db.query(Round).filter(Round.game_id == game_id).delete()
        
        # Delete game players
        self.db.query(GamePlayer).filter(GamePlayer.game_id == game_id).delete()
        
        # Delete game
        self.db.delete(game)
        self.db.commit()
    
    def reactivate_game(self, game_id: int) -> Game:
        """
        Reactivate a finished/cancelled game for editing.
        
        Args:
            game_id: ID of the game to reactivate
            
        Returns:
            Updated Game instance
        """
        game = get_game_or_404(game_id, self.db)
        game.is_active = True
        game.is_valid = False  # Mark as invalid since we're editing
        self.db.commit()
        return game
    
    def update_metadata(
        self,
        game_id: int,
        notes: Optional[str] = None,
        location: Optional[str] = None
    ) -> Game:
        """
        Update game metadata (notes and location).
        
        Args:
            game_id: ID of the game to update
            notes: New notes (or None to keep current)
            location: New location (or None to keep current)
            
        Returns:
            Updated Game instance
        """
        game = get_game_or_404(game_id, self.db)
        
        if notes is not None:
            game.notes = notes if notes else None
        if location is not None:
            game.location = location if location else None
        
        self.db.commit()
        self.db.refresh(game)
        return game
    
    def adjust_rounds(self, game_id: int, new_total: int) -> dict:
        """
        Adjust the total number of rounds in a game.
        
        Sets current_round to the last round that has ANY data.
        
        Args:
            game_id: ID of the game to adjust
            new_total: New total number of rounds
            
        Returns:
            Dictionary with message, new_total, and current_round
        """
        game = get_game_or_404(game_id, self.db)
        validate_positive_int(new_total, "Total rounds")
        
        # Update total
        game.total_rounds = new_total
        
        # Set current_round to last round with ANY data
        game.current_round = self._find_last_populated_round(game_id, new_total)
        
        self.db.commit()
        return {
            "message": f"Total rounds adjusted to {new_total}",
            "new_total": new_total,
            "current_round": game.current_round
        }
    
    def _find_last_populated_round(self, game_id: int, max_rounds: int) -> int:
        """
        Find the last round that has ANY data in it.
        
        This is like: last_row = np.where(~np.isnan(matrix).all(axis=1))[0].max()
        
        Args:
            game_id: ID of the game
            max_rounds: Maximum round to check (total_rounds)
            
        Returns:
            Last round number with data, or 1 if no data exists
        """
        highest_round_with_data = self.db.query(func.max(Round.round_number))\
            .filter(Round.game_id == game_id, Round.round_number <= max_rounds)\
            .scalar()
        
        return highest_round_with_data if highest_round_with_data else 1
    
    def increment_current_round(self, game_id: int) -> dict:
        """
        Increment current_round by 1.
        
        Called by "Next Round" button.
        
        Args:
            game_id: ID of the game
            
        Returns:
            Dictionary with updated current_round
        """
        game = get_game_or_404(game_id, self.db)
        
        if game.current_round < game.total_rounds:
            game.current_round += 1
        
        self.db.commit()
        return {"current_round": game.current_round}
    
    def get_game_stats(self, game_id: int) -> List[GameStats]:
        """
        Get statistics for all players in a game.

        Uses the same aggregation as the lifetime figures (utils/stats.py), so
        summing these rows over a player's finished games reproduces their
        lifetime totals exactly. Reported for the game whatever its state — this
        is the live scoreboard.

        Args:
            game_id: ID of the game

        Returns:
            List of GameStats for each player
        """
        get_game_or_404(game_id, self.db)

        # One query for the whole game, then split per player in Python: a
        # game has a handful of players, and this keeps the round-filtering
        # rules in exactly one place.
        rounds_by_player = {}
        for r in rounds_in_game(self.db, game_id).all():
            rounds_by_player.setdefault(r.player_id, []).append(r)

        game_players = self.db.query(GamePlayer)\
            .filter(GamePlayer.game_id == game_id).all()

        result = []
        for gp in game_players:
            player = self.db.query(Player)\
                .filter(Player.id == gp.player_id).first()
            if not player:
                continue

            totals = aggregate_rounds(rounds_by_player.get(gp.player_id, []))

            result.append(GameStats(
                game_id=game_id,
                player_id=player.id,
                player_alias=player.alias,
                total_score=totals.total_score,
                rounds_played=totals.rounds_played,
                successful_bets=totals.successful_bets,
                failed_bets=totals.failed_bets,
                average_bet=totals.average_bet,
                win_rate=totals.win_rate
            ))

        return result
