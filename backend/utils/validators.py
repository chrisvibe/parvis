"""
Input validation utilities for Parvis API.
"""

from fastapi import HTTPException
from constants import MIN_BET


def validate_bet(bet: int, max_bet: int) -> None:
    """
    Validate that a bet is within the allowed range.
    
    Args:
        bet: The bet amount to validate
        max_bet: The maximum allowed bet (typically the round number)
        
    Raises:
        HTTPException: If bet is outside valid range [MIN_BET, max_bet]
    """
    if bet < MIN_BET or bet > max_bet:
        raise HTTPException(
            status_code=400,
            detail=f"Bet must be between {MIN_BET} and {max_bet}"
        )


def validate_positive_int(value: int, field_name: str) -> None:
    """
    Validate that an integer is positive.
    
    Args:
        value: The value to validate
        field_name: Name of the field for error messages
        
    Raises:
        HTTPException: If value is not positive
    """
    if value < 1:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must be at least 1"
        )
