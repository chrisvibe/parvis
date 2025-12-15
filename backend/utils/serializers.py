"""
Serialization utilities for converting database models to API response models.
"""

from database import Player as DBPlayer
from models import PlayerWithRelations


def player_to_dict_with_relations(player: DBPlayer) -> dict:
    """
    Convert a Player database model to a dictionary with parent relationships.
    
    This helper consolidates the logic for serializing players with their
    parent_ids, avoiding manual dictionary construction in route handlers.
    
    Args:
        player: The Player database model instance
        
    Returns:
        Dictionary with all player fields plus parent_ids list
    """
    return {
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
