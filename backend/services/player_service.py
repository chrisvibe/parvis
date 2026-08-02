"""
Player service layer for Parvis.

Handles player creation, updates, and statistics.
"""

from sqlalchemy.orm import Session
from typing import List, Dict
from fastapi import HTTPException

from database import Player
from models import PlayerCreate, PlayerStats
from utils import (
    get_player_or_404,
    get_player_by_alias,
    player_to_dict_with_relations,
    aggregate_rounds,
    bet_histogram,
    games_finished,
    lifetime_rounds
)


class PlayerService:
    """Service for player-related operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_all_players(self) -> List[Dict]:
        """
        Get all players with their parent relationships.
        
        Returns:
            List of player dictionaries with parent_ids
        """
        players = self.db.query(Player).all()
        return [player_to_dict_with_relations(p) for p in players]
    
    def get_player(self, player_id: int) -> Player:
        """
        Get a specific player by ID.
        
        Args:
            player_id: ID of the player
            
        Returns:
            Player instance
        """
        return get_player_or_404(player_id, self.db)
    
    def create_player(self, player_data: PlayerCreate) -> Player:
        """
        Create a new player.
        
        Args:
            player_data: Player creation data
            
        Returns:
            Created Player instance
            
        Raises:
            HTTPException: If alias already exists
        """
        # Check if alias exists
        existing = get_player_by_alias(player_data.alias, self.db)
        if existing:
            raise HTTPException(status_code=400, detail="Alias already exists")
        
        # Create player without parents first
        player_dict = player_data.dict(exclude={'parent_ids'})
        db_player = Player(**player_dict)
        self.db.add(db_player)
        self.db.flush()  # Get the ID without committing
        
        # Add parent relationships
        if player_data.parent_ids:
            for parent_id in player_data.parent_ids:
                parent = self.db.query(Player)\
                    .filter(Player.id == parent_id).first()
                if parent:
                    db_player.parents.append(parent)
        
        self.db.commit()
        self.db.refresh(db_player)
        return db_player
    
    def update_player(self, player_id: int, player_data: PlayerCreate) -> Player:
        """
        Update an existing player.
        
        Args:
            player_id: ID of the player to update
            player_data: New player data
            
        Returns:
            Updated Player instance
            
        Raises:
            HTTPException: If new alias conflicts with another player
        """
        db_player = get_player_or_404(player_id, self.db)
        
        # Check if new alias conflicts with another player
        if player_data.alias != db_player.alias:
            existing = get_player_by_alias(player_data.alias, self.db)
            if existing:
                raise HTTPException(status_code=400, detail="Alias already exists")
        
        # Update basic fields
        for key, value in player_data.dict(exclude={'parent_ids'}).items():
            setattr(db_player, key, value)
        
        # Update parent relationships
        db_player.parents.clear()
        if player_data.parent_ids:
            for parent_id in player_data.parent_ids:
                parent = self.db.query(Player)\
                    .filter(Player.id == parent_id).first()
                if parent:
                    db_player.parents.append(parent)
        
        self.db.commit()
        self.db.refresh(db_player)
        return db_player
    
    def delete_player(self, player_id: int) -> None:
        """
        Delete a player.
        
        Args:
            player_id: ID of the player to delete
        """
        player = get_player_or_404(player_id, self.db)
        self.db.delete(player)
        self.db.commit()
    
    def get_player_family(self, player_id: int) -> Dict:
        """
        Get player with parent and child relationships.
        
        Args:
            player_id: ID of the player
            
        Returns:
            Dictionary with player family structure
        """
        player = get_player_or_404(player_id, self.db)
        
        return {
            "id": player.id,
            "alias": player.alias,
            "parent_ids": [p.id for p in player.parents],
            "child_ids": [c.id for c in player.children]
        }
    
    def get_player_stats(self, player_id: int) -> PlayerStats:
        """
        Get lifetime statistics for a player across their finished games.

        Counts finished games only, and only rounds within each game's declared
        length — see utils/stats.py for the rules. These totals are the sum of
        the player's per-game figures, so the two pages agree.

        Args:
            player_id: ID of the player

        Returns:
            PlayerStats with aggregated statistics
        """
        player = get_player_or_404(player_id, self.db)

        totals = aggregate_rounds(lifetime_rounds(self.db, player_id).all())

        return PlayerStats(
            player_id=player_id,
            player_alias=player.alias,
            games_played=games_finished(self.db, player_id),
            total_rounds=totals.rounds_played,
            total_score=totals.total_score,
            successful_bets=totals.successful_bets,
            failed_bets=totals.failed_bets,
            average_bet=totals.average_bet,
            win_rate=totals.win_rate
        )

    def get_bet_distribution(self, player_id: int) -> List[Dict]:
        """
        Get histogram data of player's bets.

        Drawn from the same rounds as get_player_stats, so the histogram adds
        up to the player's total_rounds.

        Args:
            player_id: ID of the player

        Returns:
            List of dictionaries with bet amounts and counts
        """
        return bet_histogram(lifetime_rounds(self.db, player_id).all())
