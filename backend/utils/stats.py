"""
Statistics rules for Parvis.

There is exactly one implementation of "what counts", used by both the per-game
and the lifetime endpoints, because the two used to compute the same figures in
two different ways and disagree with each other.

THE RULES
---------
1. A round counts only if its round_number falls within the game's declared
   total_rounds. Shrinking a game with "adjust rounds" leaves the trimmed-off
   rows in the table; they are no longer part of the game and must not score.
   (A game with no total_rounds recorded caps nothing — every round counts.)

2. Lifetime figures count FINISHED games only, i.e. is_valid. A game is marked
   valid when it is finished, and cleared again when it is cancelled or
   reopened for editing. So a game in progress and a cancelled game both
   contribute nothing to a player's record — a record should only move when a
   game actually completes.

3. Per-game figures count that game's rounds whatever state it is in. This is
   the live scoreboard: it has to work while the game is being played, which is
   exactly when rule 2 says it is not part of anyone's lifetime record yet.

4. Therefore: a player's lifetime totals equal the sum of their per-game totals
   over their finished games. That invariant is what makes the numbers on the
   two pages agree, and it is enforced by a test.

Aggregation is done in Python over the same query in both cases. At family
scale the cost is irrelevant, and sharing one code path is what guarantees the
two endpoints can't drift apart again.
"""

from dataclasses import dataclass
from typing import Iterable, List

from sqlalchemy import func, or_
from sqlalchemy.orm import Query, Session

from database import Game, GamePlayer, Round


@dataclass(frozen=True)
class RoundAggregate:
    """The figures derived from a set of rounds."""

    rounds_played: int
    total_score: int
    successful_bets: int
    failed_bets: int
    average_bet: float
    win_rate: float


def aggregate_rounds(rounds: Iterable) -> RoundAggregate:
    """
    Reduce rounds to their summary figures.

    Pure and storage-agnostic: it takes anything with .bet, .success and
    .score, so it can be tested without a database.

    An empty set yields zeros rather than None — a player who has played
    nothing has a score of 0, not an unknown score. win_rate is 0.0 for
    "no rounds", which is a floor, not an average of nothing.
    """
    rounds = list(rounds)
    played = len(rounds)

    if played == 0:
        return RoundAggregate(
            rounds_played=0,
            total_score=0,
            successful_bets=0,
            failed_bets=0,
            average_bet=0.0,
            win_rate=0.0,
        )

    successful = sum(1 for r in rounds if r.success)

    return RoundAggregate(
        rounds_played=played,
        # score is nullable; an unscored row contributes nothing rather than
        # blowing up the sum.
        total_score=sum(r.score or 0 for r in rounds),
        successful_bets=successful,
        failed_bets=played - successful,
        average_bet=sum(r.bet for r in rounds) / played,
        win_rate=successful / played * 100,
    )


def countable_rounds(db: Session) -> Query:
    """
    Every round that counts at all (rule 1), as a query others narrow further.
    """
    return db.query(Round).join(Game, Round.game_id == Game.id).filter(
        or_(Game.total_rounds.is_(None), Round.round_number <= Game.total_rounds)
    )


def rounds_in_game(db: Session, game_id: int) -> Query:
    """Rounds belonging to one game, valid or not (rule 3)."""
    return countable_rounds(db).filter(Round.game_id == game_id)


def lifetime_rounds(db: Session, player_id: int) -> Query:
    """A player's rounds from finished games only (rule 2)."""
    return countable_rounds(db).filter(
        Round.player_id == player_id,
        Game.is_valid.is_(True),
    )


def games_finished(db: Session, player_id: int) -> int:
    """
    How many finished games the player took part in.

    Counted from game membership, not from rounds, so someone who joined a game
    and never placed a bet still shows as having played it — which is what a
    person means by "games played". It also keeps the count equal to the number
    of per-game rows that sum into the lifetime totals.
    """
    return (
        db.query(func.count(GamePlayer.game_id))
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id, Game.is_valid.is_(True))
        .scalar()
        or 0
    )


def bet_histogram(rounds: Iterable) -> List[dict]:
    """
    Count how often each bet amount was made, ascending by bet.

    Built from the same rounds as the rest of a player's figures so the
    histogram totals match their round count instead of quietly counting
    cancelled games too.
    """
    counts: dict = {}
    for r in rounds:
        counts[r.bet] = counts.get(r.bet, 0) + 1
    return [{"bet": bet, "count": counts[bet]} for bet in sorted(counts)]
