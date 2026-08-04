"""
Hall of fame: the yearly tournament winners, and the all-time records.

Everything here is derived from the games as they were played. Nothing is typed
in, with one deliberate exception — tournaments held before this app existed
cannot be computed from anything, so they come from a seed file and are marked
as historical so they are never mistaken for a computed result.

The figures obey the same rules as the rest of the statistics (utils/stats.py):
finished games only, and only rounds inside a game's declared length. A record
that counted an abandoned game would be a record nobody actually set.
"""

import json
import os
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from database import Game, GamePlayer, Player
from models import GAME_TYPE_TOURNAMENT, HallOfFame, HallOfFameRecord, TournamentWinner
from utils import aggregate_rounds, countable_rounds

# Photos live outside this app; the link is configurable so it can be changed
# without a deploy, but it has a working default so the panel is never empty.
DEFAULT_ALBUM_URL = (
    "https://immich.tubiformis.work/albums/0284eddb-0d70-4746-a076-d2f1f204d9d6"
)

# Rate-style records need a floor, or they are won by whoever played once and
# got lucky. Three games is enough to mean something at family scale.
MIN_GAMES_FOR_RATE = 3
MIN_ROUNDS_FOR_RATE = 10


@dataclass
class _PlayerGame:
    """One player's figures in one game."""

    game_id: int
    player_id: int
    total_score: int
    rounds_played: int
    successful_bets: int
    failed_bets: int
    average_bet: float
    win_rate: float
    longest_streak: int
    highest_successful_bet: Optional[int]


class HallOfFameService:
    """Reads the records and the roll of honour."""

    def __init__(self, db: Session):
        self.db = db

    def get_hall_of_fame(self) -> HallOfFame:
        aliases = {
            player.id: player.alias for player in self.db.query(Player).all()
        }
        per_game = self._per_player_game_figures()

        return HallOfFame(
            # `or`, not a getenv default: a variable present but blank — which
            # is how it ships in env_template — means "unset", not "no album".
            album_url=os.getenv("HALL_OF_FAME_ALBUM_URL") or DEFAULT_ALBUM_URL,
            tournament_winners=self._tournament_winners(per_game, aliases),
            records=self._records(per_game, aliases),
        )

    # ------------------------------------------------------------------
    # Source data
    # ------------------------------------------------------------------

    def _per_player_game_figures(self) -> List[_PlayerGame]:
        """
        Every (game, player) pair that scored, with that pair's figures.

        Aggregated in Python over one query. At family scale — a handful of
        games a year — this costs nothing, and it reuses aggregate_rounds so
        these figures are the same ones the stats pages show rather than a
        second, subtly different definition.
        """
        rounds = countable_rounds(self.db).filter(Game.is_valid.is_(True)).all()

        grouped: Dict[tuple, list] = defaultdict(list)
        for entry in rounds:
            grouped[(entry.game_id, entry.player_id)].append(entry)

        figures = []
        for (game_id, player_id), player_rounds in grouped.items():
            player_rounds.sort(key=lambda r: r.round_number)
            totals = aggregate_rounds(player_rounds)
            successful_bets = [r.bet for r in player_rounds if r.success]

            figures.append(_PlayerGame(
                game_id=game_id,
                player_id=player_id,
                total_score=totals.total_score,
                rounds_played=totals.rounds_played,
                successful_bets=totals.successful_bets,
                failed_bets=totals.failed_bets,
                average_bet=totals.average_bet,
                win_rate=totals.win_rate,
                longest_streak=_longest_streak(player_rounds),
                highest_successful_bet=max(successful_bets) if successful_bets else None,
            ))

        return figures

    # ------------------------------------------------------------------
    # Tournament winners
    # ------------------------------------------------------------------

    def _tournament_winners(
        self, per_game: List[_PlayerGame], aliases: Dict[int, str]
    ) -> List[TournamentWinner]:
        """
        One winner per year, most recent first.

        Where a year held more than one tournament the latest one decides it,
        which is the reading that matches how these are actually run — a
        rescheduled or replayed final is the tournament, not a second one.

        Computed years replace seeded ones, so a hand-written placeholder can
        be left in place and will quietly stop being used once the real game is
        recorded.
        """
        tournaments = (
            self.db.query(Game)
            .filter(Game.game_type == GAME_TYPE_TOURNAMENT, Game.is_valid.is_(True))
            .order_by(Game.date.asc())
            .all()
        )

        by_game: Dict[int, List[_PlayerGame]] = defaultdict(list)
        for figure in per_game:
            by_game[figure.game_id].append(figure)

        winners: Dict[int, TournamentWinner] = {}
        for seeded in self._seeded_winners():
            winners[seeded.year] = seeded

        for game in tournaments:
            entries = by_game.get(game.id, [])
            if not entries:
                continue

            best = max(entries, key=lambda f: f.total_score)
            year = game.date.year

            winners[year] = TournamentWinner(
                year=year,
                player_id=best.player_id,
                player_alias=aliases.get(best.player_id, "unknown"),
                score=best.total_score,
                game_id=game.id,
                is_historical=False,
            )

        return sorted(winners.values(), key=lambda w: w.year, reverse=True)

    def _seeded_winners(self) -> List[TournamentWinner]:
        """
        Winners from before the app existed, read from a JSON file.

        A missing or malformed file is not fatal — the hall of fame still has
        everything it computed. It is reported on stderr rather than silently
        ignored, because a file that is present but wrong is a mistake someone
        wants to hear about.
        """
        path = os.getenv("HALL_OF_FAME_SEED") or _default_seed_path()

        try:
            with open(path, "r", encoding="utf-8") as handle:
                raw = json.load(handle)
        except FileNotFoundError:
            return []
        except (OSError, ValueError) as error:
            print(f"WARNING: could not read hall of fame seed {path}: {error}", flush=True)
            return []

        seeded = []
        for entry in raw or []:
            try:
                seeded.append(TournamentWinner(
                    year=int(entry["year"]),
                    player_alias=str(entry["player_alias"]),
                    score=entry.get("score"),
                    is_historical=True,
                ))
            except (KeyError, TypeError, ValueError):
                print(f"WARNING: skipping malformed hall of fame seed entry: {entry}", flush=True)

        return seeded

    # ------------------------------------------------------------------
    # Records
    # ------------------------------------------------------------------

    def _records(
        self, per_game: List[_PlayerGame], aliases: Dict[int, str]
    ) -> List[HallOfFameRecord]:
        """
        The all-time bests, in the order they are shown.

        Deliberately a small, fixed list. It is meant to be argued with and
        changed — adding one is a few lines here and nothing anywhere else.
        """
        lifetime = self._lifetime_figures(per_game)
        games_played = self._games_played()

        def name(player_id: Optional[int]) -> Optional[str]:
            return aliases.get(player_id) if player_id is not None else None

        records: List[HallOfFameRecord] = []

        def add(key, label, holder, value, display, detail=None):
            records.append(HallOfFameRecord(
                key=key,
                label=label,
                player_id=holder,
                player_alias=name(holder),
                value=value,
                display=display if holder is not None else "—",
                detail=detail if holder is not None else "No finished games yet",
            ))

        # Highest successful bet ever made.
        with_bets = [f for f in per_game if f.highest_successful_bet is not None]
        best_bet = max(with_bets, key=lambda f: f.highest_successful_bet, default=None)
        add(
            "highest_successful_bet", "Highest successful bet",
            best_bet.player_id if best_bet else None,
            float(best_bet.highest_successful_bet) if best_bet else None,
            f"{best_bet.highest_successful_bet}" if best_bet else "—",
            f"Game #{best_bet.game_id}" if best_bet else None,
        )

        # Best and worst single-game scores.
        best_game = max(per_game, key=lambda f: f.total_score, default=None)
        add(
            "highest_game_score", "Highest score in a game",
            best_game.player_id if best_game else None,
            float(best_game.total_score) if best_game else None,
            f"{best_game.total_score}" if best_game else "—",
            f"Game #{best_game.game_id}" if best_game else None,
        )

        worst_game = min(per_game, key=lambda f: f.total_score, default=None)
        add(
            "lowest_game_score", "Lowest score in a game",
            worst_game.player_id if worst_game else None,
            float(worst_game.total_score) if worst_game else None,
            f"{worst_game.total_score}" if worst_game else "—",
            f"Game #{worst_game.game_id}" if worst_game else None,
        )

        # Most games finished.
        most = max(games_played.items(), key=lambda item: item[1], default=None)
        add(
            "most_matches", "Most matches played",
            most[0] if most else None,
            float(most[1]) if most else None,
            f"{most[1]}" if most else "—",
        )

        # Best win rate, over enough games to mean something.
        eligible = [
            (pid, figures) for pid, figures in lifetime.items()
            if games_played.get(pid, 0) >= MIN_GAMES_FOR_RATE
        ]
        best_rate = max(eligible, key=lambda item: item[1]["win_rate"], default=None)
        add(
            "best_win_rate", "Best win rate",
            best_rate[0] if best_rate else None,
            best_rate[1]["win_rate"] if best_rate else None,
            f"{best_rate[1]['win_rate']:.1f}%" if best_rate else "—",
            f"Minimum {MIN_GAMES_FOR_RATE} games" if best_rate else None,
        )

        # Longest run of successful bets inside one game.
        streak = max(per_game, key=lambda f: f.longest_streak, default=None)
        add(
            "longest_streak", "Longest winning streak",
            streak.player_id if streak and streak.longest_streak else None,
            float(streak.longest_streak) if streak else None,
            f"{streak.longest_streak} rounds" if streak else "—",
            f"Game #{streak.game_id}" if streak else None,
        )

        # Highest average bet — the least cautious player.
        reckless = [
            (pid, figures) for pid, figures in lifetime.items()
            if figures["rounds"] >= MIN_ROUNDS_FOR_RATE
        ]
        boldest = max(reckless, key=lambda item: item[1]["average_bet"], default=None)
        add(
            "highest_average_bet", "Boldest player",
            boldest[0] if boldest else None,
            boldest[1]["average_bet"] if boldest else None,
            f"{boldest[1]['average_bet']:.1f} average bet" if boldest else "—",
            f"Minimum {MIN_ROUNDS_FOR_RATE} rounds" if boldest else None,
        )

        # And the wooden spoon.
        spoon = max(
            lifetime.items(), key=lambda item: item[1]["failed_bets"], default=None
        )
        add(
            "most_failed_bets", "Wooden spoon",
            spoon[0] if spoon and spoon[1]["failed_bets"] else None,
            float(spoon[1]["failed_bets"]) if spoon else None,
            f"{spoon[1]['failed_bets']} failed bets" if spoon else "—",
        )

        return records

    def _lifetime_figures(self, per_game: List[_PlayerGame]) -> Dict[int, dict]:
        """Each player's figures summed over their finished games."""
        totals: Dict[int, dict] = defaultdict(
            lambda: {"rounds": 0, "successful": 0, "failed_bets": 0, "bet_total": 0.0}
        )

        for figure in per_game:
            entry = totals[figure.player_id]
            entry["rounds"] += figure.rounds_played
            entry["successful"] += figure.successful_bets
            entry["failed_bets"] += figure.failed_bets
            # average_bet is an average over this game's rounds; multiply back
            # out before summing, or games of different lengths get equal say.
            entry["bet_total"] += figure.average_bet * figure.rounds_played

        for entry in totals.values():
            rounds = entry["rounds"] or 1
            entry["win_rate"] = entry["successful"] / rounds * 100
            entry["average_bet"] = entry["bet_total"] / rounds

        return totals

    def _games_played(self) -> Dict[int, int]:
        """How many finished games each player took part in."""
        rows = (
            self.db.query(GamePlayer.player_id, Game.id)
            .join(Game, GamePlayer.game_id == Game.id)
            .filter(Game.is_valid.is_(True))
            .all()
        )

        counts: Dict[int, int] = defaultdict(int)
        for player_id, _ in rows:
            counts[player_id] += 1
        return counts


def _longest_streak(player_rounds: List) -> int:
    """
    The longest run of consecutive successful bets, within one game.

    Consecutive by position in the sorted list rather than by round number: a
    missing round in the middle is a gap in the record, not a bet that was won.
    """
    longest = 0
    current = 0
    previous_number = None

    for entry in player_rounds:
        contiguous = previous_number is None or entry.round_number == previous_number + 1
        if entry.success and contiguous:
            current += 1
        elif entry.success:
            current = 1
        else:
            current = 0

        longest = max(longest, current)
        previous_number = entry.round_number

    return longest


def _default_seed_path() -> str:
    """The seed file next to the backend package, whatever the working dir."""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "hall_of_fame.json")
