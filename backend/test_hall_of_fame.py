"""
Hall of fame: the yearly tournament winners, and the all-time records.

The two halves fail differently. The winners are about *which* game decides a
year — a question with a real answer that is easy to get subtly wrong. The
records are about which rounds are allowed to count, which is the same rule the
rest of the statistics obey and must not drift from it.
"""

import json
from datetime import datetime

import pytest

from database import Game, GamePlayer, Player, Round
from services.hall_of_fame_service import DEFAULT_ALBUM_URL, HallOfFameService


def _player(db, player_id, alias):
    db.add(Player(id=player_id, alias=alias, email=f"{alias}@example.com"))


def _game(db, game_id, *, year, month=6, game_type="standard", rounds=2, valid=True):
    db.add(Game(
        id=game_id,
        game_type=game_type,
        date=datetime(year, month, 1, 20, 0),
        total_rounds=rounds,
        current_round=rounds,
        is_active=False,
        is_valid=valid,
    ))


def _played(db, game_id, player_id, bets):
    """Give a player one round per (bet, success) pair, scored as the app does."""
    db.add(GamePlayer(game_id=game_id, player_id=player_id))
    for number, (bet, success) in enumerate(bets, start=1):
        db.add(Round(
            game_id=game_id, round_number=number, player_id=player_id,
            bet=bet, success=success, score=(10 + bet) if success else 0,
        ))


@pytest.fixture
def hof(db, monkeypatch):
    """Two players, one standard game and two tournaments in different years."""
    monkeypatch.delenv("HALL_OF_FAME_SEED", raising=False)
    monkeypatch.delenv("HALL_OF_FAME_ALBUM_URL", raising=False)
    # No seed file: point at a path that cannot exist, so the test never picks
    # up a real hall_of_fame.json someone left in the backend directory.
    monkeypatch.setenv("HALL_OF_FAME_SEED", "/nonexistent/hall_of_fame.json")

    _player(db, 1, "ana")
    _player(db, 2, "ben")

    _game(db, 1, year=2024, game_type="tournament")
    _played(db, 1, 1, [(3, True), (2, True)])     # 13 + 12 = 25
    _played(db, 1, 2, [(1, True), (5, False)])    # 11 +  0 = 11

    _game(db, 2, year=2025, game_type="tournament")
    _played(db, 2, 1, [(0, False), (0, False)])   # 0
    _played(db, 2, 2, [(9, True), (1, True)])     # 19 + 11 = 30

    _game(db, 3, year=2025, game_type="standard")
    _played(db, 3, 1, [(4, True), (4, True)])     # 14 + 14 = 28

    db.commit()
    return db


def _records(result):
    return {record.key: record for record in result.records}


class TestTournamentWinners:

    def test_one_winner_per_year_highest_score_first(self, hof):
        winners = HallOfFameService(hof).get_hall_of_fame().tournament_winners

        assert [(w.year, w.player_alias, w.score) for w in winners] == [
            (2025, "ben", 30),
            (2024, "ana", 25),
        ]

    def test_a_standard_game_never_wins_a_year(self, hof):
        """ana scored more in the standard game than ben did in the final."""
        winners = HallOfFameService(hof).get_hall_of_fame().tournament_winners

        assert {w.year: w.player_alias for w in winners}[2025] == "ben"

    def test_the_latest_tournament_of_a_year_decides_it(self, hof):
        """A replayed or rescheduled final is the tournament, not a second one."""
        _game(hof, 4, year=2025, month=11, game_type="tournament")
        _played(hof, 4, 1, [(7, True)])
        hof.commit()

        winners = {w.year: w.player_alias
                   for w in HallOfFameService(hof).get_hall_of_fame().tournament_winners}
        assert winners[2025] == "ana"

    def test_an_unfinished_tournament_does_not_count(self, hof):
        _game(hof, 4, year=2026, game_type="tournament", valid=False)
        _played(hof, 4, 2, [(9, True)])
        hof.commit()

        years = {w.year for w in HallOfFameService(hof).get_hall_of_fame().tournament_winners}
        assert 2026 not in years

    def test_no_tournaments_is_an_empty_roll_not_an_error(self, db, monkeypatch):
        monkeypatch.setenv("HALL_OF_FAME_SEED", "/nonexistent/hall_of_fame.json")

        assert HallOfFameService(db).get_hall_of_fame().tournament_winners == []


class TestSeededWinners:
    """Tournaments from before the app existed cannot be computed."""

    def test_a_seeded_year_is_marked_historical(self, hof, tmp_path, monkeypatch):
        seed = tmp_path / "seed.json"
        seed.write_text(json.dumps([{"year": 2001, "player_alias": "grandpa"}]))
        monkeypatch.setenv("HALL_OF_FAME_SEED", str(seed))

        winners = {w.year: w for w in
                   HallOfFameService(hof).get_hall_of_fame().tournament_winners}

        assert winners[2001].player_alias == "grandpa"
        assert winners[2001].is_historical is True
        assert winners[2024].is_historical is False

    def test_a_recorded_tournament_supersedes_a_seeded_year(self, hof, tmp_path, monkeypatch):
        """So a placeholder can be left in place and quietly stops being used."""
        seed = tmp_path / "seed.json"
        seed.write_text(json.dumps([{"year": 2024, "player_alias": "placeholder"}]))
        monkeypatch.setenv("HALL_OF_FAME_SEED", str(seed))

        winners = {w.year: w for w in
                   HallOfFameService(hof).get_hall_of_fame().tournament_winners}

        assert winners[2024].player_alias == "ana"
        assert winners[2024].is_historical is False

    def test_a_missing_seed_file_is_not_an_error(self, hof, monkeypatch):
        monkeypatch.setenv("HALL_OF_FAME_SEED", "/nonexistent/seed.json")

        assert HallOfFameService(hof).get_hall_of_fame().tournament_winners

    def test_a_malformed_entry_is_skipped_not_fatal(self, hof, tmp_path, monkeypatch):
        seed = tmp_path / "seed.json"
        seed.write_text(json.dumps([
            {"year": "not a year", "player_alias": "nobody"},
            {"year": 2002, "player_alias": "grandma"},
        ]))
        monkeypatch.setenv("HALL_OF_FAME_SEED", str(seed))

        years = {w.year for w in
                 HallOfFameService(hof).get_hall_of_fame().tournament_winners}
        assert 2002 in years

    def test_unreadable_json_leaves_the_computed_winners_intact(self, hof, tmp_path, monkeypatch):
        seed = tmp_path / "seed.json"
        seed.write_text("{not json at all")
        monkeypatch.setenv("HALL_OF_FAME_SEED", str(seed))

        years = {w.year for w in
                 HallOfFameService(hof).get_hall_of_fame().tournament_winners}
        assert years == {2024, 2025}


class TestRecords:

    def test_highest_successful_bet_ignores_failed_ones(self, hof):
        """ben bet 5 and missed in 2024; the record is a bet that was made."""
        record = _records(HallOfFameService(hof).get_hall_of_fame())["highest_successful_bet"]

        assert record.player_alias == "ben"
        assert record.value == 9

    def test_highest_and_lowest_game_scores(self, hof):
        records = _records(HallOfFameService(hof).get_hall_of_fame())

        assert (records["highest_game_score"].player_alias,
                records["highest_game_score"].value) == ("ben", 30)
        assert (records["lowest_game_score"].player_alias,
                records["lowest_game_score"].value) == ("ana", 0)

    def test_most_matches_counts_finished_games(self, hof):
        record = _records(HallOfFameService(hof).get_hall_of_fame())["most_matches"]

        assert record.player_alias == "ana"
        assert record.value == 3

    def test_longest_streak_is_within_one_game(self, hof):
        record = _records(HallOfFameService(hof).get_hall_of_fame())["longest_streak"]

        assert record.value == 2

    def test_wooden_spoon_counts_failed_bets(self, hof):
        record = _records(HallOfFameService(hof).get_hall_of_fame())["most_failed_bets"]

        assert record.player_alias == "ana"
        assert record.value == 2

    def test_rate_records_need_a_floor(self, hof):
        """
        Best win rate is over at least three games. ben has played two, so it
        cannot be ben — whatever their rate.
        """
        record = _records(HallOfFameService(hof).get_hall_of_fame())["best_win_rate"]

        assert record.player_alias == "ana"

    def test_an_unfinished_game_never_sets_a_record(self, hof):
        _game(hof, 4, year=2026, valid=False)
        _played(hof, 4, 2, [(20, True)])
        hof.commit()

        record = _records(HallOfFameService(hof).get_hall_of_fame())["highest_successful_bet"]
        assert record.value == 9

    def test_a_round_past_the_end_of_a_game_never_counts(self, hof):
        """The same rule the statistics pages use, from utils/stats.py."""
        hof.add(Round(game_id=1, round_number=99, player_id=1,
                      bet=30, success=True, score=40))
        hof.commit()

        record = _records(HallOfFameService(hof).get_hall_of_fame())["highest_successful_bet"]
        assert record.value == 9

    def test_an_empty_database_reports_every_record_as_blank(self, db, monkeypatch):
        monkeypatch.setenv("HALL_OF_FAME_SEED", "/nonexistent/seed.json")

        records = HallOfFameService(db).get_hall_of_fame().records

        assert records, "the list of records should exist even with no games"
        assert all(r.display == "—" and r.player_alias is None for r in records)


class TestMostTournamentsWon:
    """
    The record this panel exists for: the roll of honour lists the years, this
    says who owns the most of them. Counted off that same roll so the two cannot
    disagree, and by alias rather than player id — see below.
    """

    def test_a_draw_is_broken_the_same_way_every_time(self, hof):
        """ana took 2024 and ben took 2025, so the tie-break decides it."""
        record = _records(HallOfFameService(hof).get_hall_of_fame())["most_tournament_wins"]

        assert record.player_alias == "ana"
        assert record.value == 1
        assert record.display == "1 win"

    def test_winning_twice_beats_a_draw(self, hof):
        _game(hof, 4, year=2026, game_type="tournament")
        _played(hof, 4, 2, [(6, True)])
        hof.commit()

        record = _records(HallOfFameService(hof).get_hall_of_fame())["most_tournament_wins"]

        assert record.player_alias == "ben"
        assert record.display == "2 wins"

    def test_a_seeded_year_counts_toward_the_tally(self, hof, tmp_path, monkeypatch):
        """
        Counting by player id would drop this year, because a seeded winner has
        a name and no id — splitting one person's wins across the arrival of the
        app, and hiding whoever won most before it existed.
        """
        seed = tmp_path / "seed.json"
        seed.write_text(json.dumps([{"year": 2001, "player_alias": "ana"}]))
        monkeypatch.setenv("HALL_OF_FAME_SEED", str(seed))

        record = _records(HallOfFameService(hof).get_hall_of_fame())["most_tournament_wins"]

        assert record.player_alias == "ana"
        assert record.value == 2

    def test_a_champion_from_before_the_app_needs_no_player_row(self, hof, tmp_path, monkeypatch):
        seed = tmp_path / "seed.json"
        seed.write_text(json.dumps([
            {"year": 1999, "player_alias": "grandpa"},
            {"year": 2000, "player_alias": "grandpa"},
            {"year": 2001, "player_alias": "grandpa"},
        ]))
        monkeypatch.setenv("HALL_OF_FAME_SEED", str(seed))

        record = _records(HallOfFameService(hof).get_hall_of_fame())["most_tournament_wins"]

        assert record.player_alias == "grandpa"
        assert record.player_id is None
        assert record.value == 3

    def test_no_tournament_yet_says_so_rather_than_reporting_nobody(self, db, monkeypatch):
        monkeypatch.setenv("HALL_OF_FAME_SEED", "/nonexistent/seed.json")

        record = _records(HallOfFameService(db).get_hall_of_fame())["most_tournament_wins"]

        assert record.display == "—"
        assert record.detail == "No tournament has been played yet"


class TestAlbumLink:

    def test_it_has_a_working_default(self, hof, monkeypatch):
        monkeypatch.delenv("HALL_OF_FAME_ALBUM_URL", raising=False)

        assert HallOfFameService(hof).get_hall_of_fame().album_url == DEFAULT_ALBUM_URL

    def test_a_blank_setting_counts_as_unset(self, hof, monkeypatch):
        """Which is how it ships in env_template."""
        monkeypatch.setenv("HALL_OF_FAME_ALBUM_URL", "")

        assert HallOfFameService(hof).get_hall_of_fame().album_url == DEFAULT_ALBUM_URL

    def test_it_can_be_pointed_somewhere_else(self, hof, monkeypatch):
        monkeypatch.setenv("HALL_OF_FAME_ALBUM_URL", "https://example.com/album")

        assert HallOfFameService(hof).get_hall_of_fame().album_url == "https://example.com/album"
