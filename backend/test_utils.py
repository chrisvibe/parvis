"""
Basic tests for Parvis backend utilities.

These tests cover the most critical backbone functions that affect
scoring consistency and data integrity.
"""

import pytest
from utils.scoring import calculate_score
from utils.validators import validate_bet, validate_positive_int
from fastapi import HTTPException


class TestScoring:
    """Tests for score calculation logic."""
    
    def test_successful_bet(self):
        """Successful bet returns BASE_SCORE + bet."""
        assert calculate_score(5, True) == 15
        assert calculate_score(0, True) == 10
        assert calculate_score(10, True) == 20
    
    def test_failed_bet(self):
        """Failed bet always returns 0."""
        assert calculate_score(5, False) == 0
        assert calculate_score(0, False) == 0
        assert calculate_score(100, False) == 0
    
    def test_edge_cases(self):
        """Test edge cases in scoring."""
        # Minimum bet
        assert calculate_score(0, True) == 10
        # Large bet
        assert calculate_score(1000, True) == 1010


class TestValidation:
    """Tests for input validation."""
    
    def test_valid_bet(self):
        """Valid bets should not raise exceptions."""
        validate_bet(0, 5)  # Min bet
        validate_bet(5, 5)  # Max bet
        validate_bet(3, 10)  # Middle value
    
    def test_invalid_bet_too_low(self):
        """Bet below minimum should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_bet(-1, 5)
        assert exc_info.value.status_code == 400
    
    def test_invalid_bet_too_high(self):
        """Bet above maximum should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_bet(6, 5)
        assert exc_info.value.status_code == 400
    
    def test_valid_positive_int(self):
        """Valid positive integers should not raise exceptions."""
        validate_positive_int(1, "test_field")
        validate_positive_int(100, "test_field")
    
    def test_invalid_positive_int(self):
        """Zero and negative values should raise HTTPException."""
        with pytest.raises(HTTPException) as exc_info:
            validate_positive_int(0, "test_field")
        assert exc_info.value.status_code == 400
        
        with pytest.raises(HTTPException) as exc_info:
            validate_positive_int(-5, "test_field")
        assert exc_info.value.status_code == 400


# Run with: pytest test_utils.py -v
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
