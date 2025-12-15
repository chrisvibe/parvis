"""
Scoring utilities for Parvis betting game.

This module centralizes all score calculation logic to ensure consistency
across the application.
"""

from constants import SUCCESSFUL_BET_BASE_SCORE


def calculate_score(bet: int, success: bool) -> int:
    """
    Calculate the score for a round based on bet amount and success status.
    
    Scoring rules:
    - Successful bet: BASE_SCORE (10) + bet amount
    - Failed bet: 0 points
    
    Args:
        bet: The amount bet by the player (must be >= 0)
        success: Whether the bet was successful
        
    Returns:
        The calculated score for this round
        
    Examples:
        >>> calculate_score(5, True)
        15
        >>> calculate_score(5, False)
        0
        >>> calculate_score(0, True)
        10
    """
    if success:
        return SUCCESSFUL_BET_BASE_SCORE + bet
    return 0
