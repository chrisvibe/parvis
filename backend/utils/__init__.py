"""
Utilities package for Parvis backend.

This package contains reusable utilities for:
- Scoring calculations
- Input validation
- Database queries
- Model serialization
"""

from .scoring import calculate_score
from .validators import validate_bet, validate_positive_int
from .db_helpers import get_game_or_404, get_player_or_404, get_round_or_404, get_player_by_alias
from .serializers import player_to_dict_with_relations

__all__ = [
    'calculate_score',
    'validate_bet',
    'validate_positive_int',
    'get_game_or_404',
    'get_player_or_404',
    'get_round_or_404',
    'get_player_by_alias',
    'player_to_dict_with_relations',
]
