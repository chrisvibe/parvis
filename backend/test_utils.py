"""
Basic tests for Parvis backend utilities.

These tests cover the most critical backbone functions that affect
scoring consistency and data integrity.
"""

import pytest
from pydantic import ValidationError
from utils.scoring import calculate_score
from utils.stats import aggregate_rounds
from utils.validators import validate_bet, validate_positive_int
from models import PlayerCreate
from auth import check_request
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


class TestPlayerCreate:
    """Tests for player input validation."""

    def test_email_required(self):
        """Creating a player without an email is rejected."""
        with pytest.raises(ValidationError):
            PlayerCreate(alias="tester")

    def test_email_must_be_well_formed(self):
        """Obvious non-emails are rejected."""
        for bad in ["not-an-email", "no@domain", "two@@at.com", "spaces in@mail.com", "  "]:
            with pytest.raises(ValidationError):
                PlayerCreate(alias="tester", email=bad)

    def test_valid_email_accepted_and_trimmed(self):
        """A well-formed email is accepted, with surrounding whitespace removed."""
        player = PlayerCreate(alias="tester", email="  player@example.com  ")
        assert player.email == "player@example.com"

    def test_relationships_remain_optional(self):
        """
        Relationships are not required — a player can be created without them.

        They read as None rather than [], and the difference is load-bearing:
        an omitted list leaves that relationship alone, an empty one clears it.
        """
        player = PlayerCreate(alias="tester", email="player@example.com")
        assert player.parent_ids is None
        assert player.child_ids is None
        assert player.partner_ids is None

    def test_other_fields_remain_optional(self):
        """Names and birthdate stay optional."""
        player = PlayerCreate(alias="tester", email="player@example.com")
        assert player.first_name is None
        assert player.middle_name is None
        assert player.last_name is None
        assert player.birthdate is None


class TestPasswordGate:
    """
    Tests for the optional password protection.

    The important property is the first one: with nothing configured the API
    must behave exactly as it did before passwords existed.
    """

    @staticmethod
    def _configure(monkeypatch, password=None, admin=None):
        for name, value in (("PARVIS_PASSWORD", password), ("PARVIS_ADMIN_PASSWORD", admin)):
            if value is None:
                monkeypatch.delenv(name, raising=False)
            else:
                monkeypatch.setenv(name, value)

    def test_no_passwords_configured_allows_everything(self, monkeypatch):
        """Unset means unprotected — the pre-existing behaviour."""
        self._configure(monkeypatch)
        assert check_request("GET", "/players", None, None) is None
        assert check_request("POST", "/players", None, None) is None
        assert check_request("DELETE", "/players/1", None, None) is None

    def test_blank_password_counts_as_unset(self, monkeypatch):
        """A variable left empty must not half-enable the gate."""
        self._configure(monkeypatch, password="   ", admin="")
        assert check_request("GET", "/players", None, None) is None
        assert check_request("DELETE", "/players/1", None, None) is None

    def test_site_password_required_when_set(self, monkeypatch):
        self._configure(monkeypatch, password="hunter2")
        assert check_request("GET", "/players", None, None)[0] == 401
        assert check_request("GET", "/players", "wrong", None)[0] == 401
        assert check_request("GET", "/players", "hunter2", None) is None

    def test_delete_falls_back_to_site_password_when_no_admin_set(self, monkeypatch):
        """Without an admin password there is no second tier."""
        self._configure(monkeypatch, password="hunter2")
        assert check_request("DELETE", "/players/1", None, None)[0] == 401
        assert check_request("DELETE", "/players/1", "hunter2", None) is None

    def test_admin_password_guards_deletes(self, monkeypatch):
        self._configure(monkeypatch, password="hunter2", admin="rootword")
        # Site password is enough to read and write...
        assert check_request("GET", "/players", "hunter2", None) is None
        assert check_request("POST", "/players", "hunter2", None) is None
        # ...but not to delete.
        assert check_request("DELETE", "/players/1", "hunter2", None)[0] == 403
        assert check_request("DELETE", "/players/1", "hunter2", "wrong")[0] == 403
        assert check_request("DELETE", "/players/1", None, "rootword") is None

    def test_admin_password_works_everywhere(self, monkeypatch):
        """An admin should not have to hold both secrets."""
        self._configure(monkeypatch, password="hunter2", admin="rootword")
        assert check_request("GET", "/players", "rootword", None) is None

    def test_admin_only_leaves_reads_open(self, monkeypatch):
        """Setting just the admin password protects deletion and nothing else."""
        self._configure(monkeypatch, admin="rootword")
        assert check_request("GET", "/players", None, None) is None
        assert check_request("POST", "/players", None, None) is None
        assert check_request("DELETE", "/players/1", None, None)[0] == 403
        assert check_request("DELETE", "/players/1", None, "rootword") is None

    def test_health_and_preflight_stay_open(self, monkeypatch):
        """The healthcheck must not need a password, or the container goes unhealthy."""
        self._configure(monkeypatch, password="hunter2", admin="rootword")
        assert check_request("GET", "/health", None, None) is None
        assert check_request("OPTIONS", "/players", None, None) is None


class TestAggregateRounds:
    """Tests for the pure aggregation, without a database."""

    class FakeRound:
        def __init__(self, bet, success, score):
            self.bet = bet
            self.success = success
            self.score = score

    def test_no_rounds_is_zero_not_unknown(self):
        """A player who has played nothing scores 0, not None."""
        totals = aggregate_rounds([])
        assert totals.rounds_played == 0
        assert totals.total_score == 0
        assert totals.successful_bets == 0
        assert totals.failed_bets == 0
        assert totals.average_bet == 0.0
        assert totals.win_rate == 0.0

    def test_totals_and_rates(self):
        rounds = [
            self.FakeRound(2, True, 12),
            self.FakeRound(5, False, 0),
            self.FakeRound(0, True, 10),
        ]
        totals = aggregate_rounds(rounds)
        assert totals.rounds_played == 3
        assert totals.total_score == 22
        assert totals.successful_bets == 2
        assert totals.failed_bets == 1
        assert totals.average_bet == pytest.approx(7 / 3)
        assert totals.win_rate == pytest.approx(200 / 3)

    def test_successes_and_failures_always_partition_the_rounds(self):
        rounds = [self.FakeRound(1, True, 11), self.FakeRound(1, False, 0)]
        totals = aggregate_rounds(rounds)
        assert totals.successful_bets + totals.failed_bets == totals.rounds_played

    def test_unscored_round_does_not_break_the_sum(self):
        """score is nullable; a row without one contributes nothing."""
        totals = aggregate_rounds([self.FakeRound(3, True, None)])
        assert totals.total_score == 0
        assert totals.rounds_played == 1


class TestStatsRules:
    """
    Statistics over a synthetic season, built to exercise every rule at once.

    There are no real games yet, so the numbers below are hand-computed from
    the scenario in _seed() and asserted literally. If an excluded round ever
    starts counting, these totals move by a large, obvious amount.
    """

    ADA, BO = 1, 2

    @pytest.fixture
    def db(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from database import Base

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        session = sessionmaker(bind=engine)()
        self._seed(session)
        yield session
        session.close()

    def _seed(self, db):
        """
        Ada and Bo play five games:

          G1  finished,    3 rounds, both play all 3
          G2  CANCELLED,   2 rounds, both play  (must not reach lifetime)
          G3  IN PROGRESS, 2 rounds, both play  (must not reach lifetime)
          G4  finished,    2 rounds, Ada plays 3 - the 3rd is past the end
                                     of the game and must not count anywhere
          G5  finished,    2 rounds, Bo is a member but never bets
        """
        from datetime import date
        from database import Game, GamePlayer, Player, Round

        for pid, alias in ((self.ADA, "ada"), (self.BO, "bo")):
            db.add(Player(id=pid, alias=alias, email=f"{alias}@example.com",
                          registration_date=date(2026, 1, 1)))

        games = {
            1: dict(total_rounds=3, is_valid=True, is_active=False),
            2: dict(total_rounds=2, is_valid=False, is_active=False),  # cancelled
            3: dict(total_rounds=2, is_valid=False, is_active=True),   # in progress
            4: dict(total_rounds=2, is_valid=True, is_active=False),
            5: dict(total_rounds=2, is_valid=True, is_active=False),
        }
        for gid, attrs in games.items():
            db.add(Game(id=gid, **attrs))

        members = {1: (self.ADA, self.BO), 2: (self.ADA, self.BO),
                   3: (self.ADA, self.BO), 4: (self.ADA,), 5: (self.BO,)}
        for gid, player_ids in members.items():
            for pid in player_ids:
                db.add(GamePlayer(game_id=gid, player_id=pid))

        # (game, round, player, bet, success)
        rounds = [
            (1, 1, self.ADA, 2, True), (1, 2, self.ADA, 5, False), (1, 3, self.ADA, 0, True),
            (1, 1, self.BO, 1, True), (1, 2, self.BO, 2, True), (1, 3, self.BO, 3, False),
            (2, 1, self.ADA, 7, True), (2, 2, self.ADA, 7, True),
            (2, 1, self.BO, 9, True), (2, 2, self.BO, 9, True),
            (3, 1, self.ADA, 4, True),
            (3, 1, self.BO, 6, False),
            (4, 1, self.ADA, 3, True), (4, 2, self.ADA, 1, True),
            (4, 3, self.ADA, 100, True),  # past total_rounds=2: orphaned
        ]
        for gid, number, pid, bet, success in rounds:
            db.add(Round(game_id=gid, round_number=number, player_id=pid,
                         bet=bet, success=success,
                         score=calculate_score(bet, success)))

        db.commit()

    def _player_stats(self, db, player_id):
        from services.player_service import PlayerService
        return PlayerService(db).get_player_stats(player_id)

    def _game_stats(self, db, game_id):
        from services.game_service import GameService
        return {s.player_id: s for s in GameService(db).get_game_stats(game_id)}

    # --- the rules ----------------------------------------------------------

    def test_lifetime_counts_only_finished_games(self, db):
        """
        Ada's record is G1 (12+0+10=22) plus G4 (13+11=24) and nothing else.

        If the cancelled game leaked in this would be 80; with the game in
        progress, 94.
        """
        stats = self._player_stats(db, self.ADA)
        assert stats.total_score == 46
        assert stats.total_rounds == 5
        assert stats.successful_bets == 4
        assert stats.failed_bets == 1
        assert stats.average_bet == pytest.approx(11 / 5)
        assert stats.win_rate == pytest.approx(80.0)

    def test_rounds_past_the_end_of_a_game_never_count(self, db):
        """G4's third round scores 110 and belongs to no one."""
        assert self._player_stats(db, self.ADA).total_score == 46
        assert self._game_stats(db, 4)[self.ADA].total_score == 24
        assert self._game_stats(db, 4)[self.ADA].rounds_played == 2

    def test_per_game_stats_work_for_an_unfinished_game(self, db):
        """
        Rule 3: the live scoreboard must report a game that is still running,
        even though rule 2 keeps it out of lifetime figures.
        """
        in_progress = self._game_stats(db, 3)
        assert in_progress[self.ADA].total_score == 14
        assert in_progress[self.BO].total_score == 0
        cancelled = self._game_stats(db, 2)
        assert cancelled[self.ADA].total_score == 34

    def test_games_played_counts_membership_not_bets(self, db):
        """Bo joined G5 and never bet; he still played it."""
        bo = self._player_stats(db, self.BO)
        assert bo.games_played == 2          # G1 and G5
        assert bo.total_rounds == 3          # only G1 produced rounds
        assert self._game_stats(db, 5)[self.BO].rounds_played == 0
        assert self._player_stats(db, self.ADA).games_played == 2  # G1 and G4

    def test_lifetime_equals_the_sum_of_finished_games(self, db):
        """
        THE INVARIANT the two endpoints used to violate: what a player's page
        says must equal what their game pages add up to.
        """
        finished_games = [1, 4, 5]
        for player_id in (self.ADA, self.BO):
            lifetime = self._player_stats(db, player_id)
            per_game = [self._game_stats(db, gid).get(player_id)
                        for gid in finished_games]
            per_game = [s for s in per_game if s is not None]

            assert lifetime.total_score == sum(s.total_score for s in per_game)
            assert lifetime.total_rounds == sum(s.rounds_played for s in per_game)
            assert lifetime.successful_bets == sum(s.successful_bets for s in per_game)
            assert lifetime.failed_bets == sum(s.failed_bets for s in per_game)
            assert lifetime.games_played == len(per_game)

    def test_win_rate_is_defined_the_same_on_both_sides(self, db):
        """A single finished game must report the same rate either way."""
        bo_lifetime = self._player_stats(db, self.BO)
        bo_in_g1 = self._game_stats(db, 1)[self.BO]
        # G1 is Bo's only game with rounds, so the two must agree exactly.
        assert bo_lifetime.win_rate == pytest.approx(bo_in_g1.win_rate)
        assert bo_lifetime.win_rate == pytest.approx(200 / 3)

    def test_bet_distribution_matches_the_round_count(self, db):
        """
        The histogram is drawn from the same rounds as the totals, so it adds
        up to total_rounds and excludes the 100 bet from the orphaned round.
        """
        from services.player_service import PlayerService

        stats = self._player_stats(db, self.ADA)
        distribution = PlayerService(db).get_bet_distribution(self.ADA)

        assert sum(d["count"] for d in distribution) == stats.total_rounds
        assert [d["bet"] for d in distribution] == sorted(d["bet"] for d in distribution)
        assert 100 not in [d["bet"] for d in distribution]  # orphaned round
        assert 7 not in [d["bet"] for d in distribution]    # cancelled game

    def test_a_player_with_no_games_reads_as_zero(self, db):
        from database import Player

        db.add(Player(id=99, alias="newcomer", email="new@example.com"))
        db.commit()

        stats = self._player_stats(db, 99)
        assert stats.games_played == 0
        assert stats.total_rounds == 0
        assert stats.total_score == 0
        assert stats.win_rate == 0.0


class TestParentIds:
    """
    Parent relationships survive the trip through a response model.

    The ORM stores parents as objects under `parents`; the API speaks
    `parent_ids`. When only the serializer knew how to bridge the two, every
    endpoint that returned an ORM object directly reported no parents at all —
    and because the field has a default of [], nothing failed loudly.
    """

    @pytest.fixture
    def db(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy.pool import StaticPool
        from database import Base, Player
        from datetime import date

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        session = sessionmaker(bind=engine)()

        # mum and dad are both parents of kid; loner has nobody.
        for pid, alias in ((1, "mum"), (2, "dad"), (3, "kid"), (4, "loner")):
            session.add(Player(id=pid, alias=alias, email=f"{alias}@example.com",
                               registration_date=date(2026, 1, 1)))
        session.commit()
        kid = session.query(Player).filter(Player.id == 3).first()
        kid.parents.append(session.query(Player).filter(Player.id == 1).first())
        kid.parents.append(session.query(Player).filter(Player.id == 2).first())
        session.commit()

        yield session
        session.close()

    def _kid(self, db):
        from database import Player
        return db.query(Player).filter(Player.id == 3).first()

    def test_the_model_exposes_parents_as_ids(self, db):
        assert sorted(self._kid(db).parent_ids) == [1, 2]

    def test_no_parents_reads_as_empty(self, db):
        from database import Player
        loner = db.query(Player).filter(Player.id == 4).first()
        assert loner.parent_ids == []

    def test_player_response_carries_parent_ids(self, db):
        """The bug: this used to validate to [] for a player with two parents."""
        from models import Player as PlayerSchema

        assert sorted(PlayerSchema.model_validate(self._kid(db)).parent_ids) == [1, 2]

    def test_player_with_relations_carries_parent_ids(self, db):
        from models import PlayerWithRelations

        assert sorted(PlayerWithRelations.model_validate(self._kid(db)).parent_ids) == [1, 2]

    def test_listing_players_keeps_parent_ids(self, db):
        from models import PlayerWithRelations
        from services.player_service import PlayerService

        by_alias = {
            p.alias: PlayerWithRelations.model_validate(p)
            for p in PlayerService(db).get_all_players()
        }
        assert sorted(by_alias["kid"].parent_ids) == [1, 2]
        assert by_alias["loner"].parent_ids == []

    def test_created_player_reports_its_parents(self, db):
        """POST /players validates the returned ORM object through Player."""
        from models import Player as PlayerSchema, PlayerCreate
        from services.player_service import PlayerService

        created = PlayerService(db).create_player(PlayerCreate(
            alias="grandkid", email="grandkid@example.com", parent_ids=[3]
        ))
        assert PlayerSchema.model_validate(created).parent_ids == [3]

    def test_updated_player_reports_its_parents(self, db):
        from models import Player as PlayerSchema, PlayerCreate
        from services.player_service import PlayerService

        updated = PlayerService(db).update_player(4, PlayerCreate(
            alias="loner", email="loner@example.com", parent_ids=[1]
        ))
        assert PlayerSchema.model_validate(updated).parent_ids == [1]

    def test_family_endpoint_agrees(self, db):
        from services.player_service import PlayerService

        service = PlayerService(db)
        assert sorted(service.get_player_family(3)["parent_ids"]) == [1, 2]
        assert service.get_player_family(1)["child_ids"] == [3]


def _memory_db():
    """A fresh in-memory database with the real schema."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from database import Base

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


class TestRoundUniqueness:
    """
    One row per (game, round, player) — enforced by the database, not by hope.

    upsert_round does read-then-write. Two writers editing the same cell of the
    game matrix can both read "no row" and both insert, and the duplicate is
    invisible: nothing errors, the score is simply counted twice.
    """

    GAME, ADA, BO = 1, 1, 2
    # Bets are capped at the round number, so exercise this on a later round.
    ROUND = 5

    @pytest.fixture
    def db(self):
        from database import Game, Player

        session = _memory_db()
        session.add(Game(id=self.GAME, total_rounds=5, is_active=True, is_valid=False))
        for pid, alias in ((self.ADA, "ada"), (self.BO, "bo")):
            session.add(Player(id=pid, alias=alias, email=f"{alias}@example.com"))
        session.commit()
        yield session
        session.close()

    def _rows(self, db):
        from database import Round
        return db.query(Round).filter(
            Round.game_id == self.GAME,
            Round.round_number == self.ROUND,
            Round.player_id == self.ADA,
        ).all()

    def test_the_database_refuses_a_duplicate_cell(self, db):
        from sqlalchemy.exc import IntegrityError
        from database import Round

        for _ in range(2):
            db.add(Round(game_id=self.GAME, round_number=1, player_id=self.ADA,
                         bet=1, success=True, score=11))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_the_same_cell_can_hold_different_players(self, db):
        from database import Round

        db.add(Round(game_id=self.GAME, round_number=1, player_id=self.ADA,
                     bet=1, success=True, score=11))
        db.add(Round(game_id=self.GAME, round_number=1, player_id=self.BO,
                     bet=2, success=True, score=12))
        db.commit()  # must not raise

    def test_upserting_twice_updates_rather_than_duplicates(self, db):
        from services.round_service import RoundService

        service = RoundService(db)
        service.upsert_round(self.GAME, self.ROUND, self.ADA, 3, True)
        result = service.upsert_round(self.GAME, self.ROUND, self.ADA, 5, False)

        assert len(self._rows(db)) == 1
        assert result["bet"] == 5
        assert result["success"] is False
        assert result["score"] == 0

    def test_losing_the_race_updates_the_winners_row(self, db):
        """
        The branch that only fires under concurrency: our lookup misses, someone
        else's insert lands first, and our commit hits the constraint. The edit
        must still take effect instead of surfacing as a 500.
        """
        from database import Round
        from services.round_service import RoundService

        service = RoundService(db)
        service.upsert_round(self.GAME, self.ROUND, self.ADA, 3, True)

        class _SawNothing:
            """Stands in for the query that ran a moment too early."""
            def filter(self, *args, **kwargs): return self
            def first(self): return None

        real_query = db.query
        missed = {"done": False}

        def query_that_misses_once(*args, **kwargs):
            if args and args[0] is Round and not missed["done"]:
                missed["done"] = True
                return _SawNothing()
            return real_query(*args, **kwargs)

        db.query = query_that_misses_once
        try:
            result = service.upsert_round(self.GAME, self.ROUND, self.ADA, 4, True)
        finally:
            db.query = real_query

        assert missed["done"], "the test did not exercise the collision path"
        assert len(self._rows(db)) == 1
        assert result["bet"] == 4
        assert result["score"] == 14


class TestDeletePlayer:
    """Deleting a player who has played is a conflict, not a server error."""

    @pytest.fixture
    def db(self):
        from database import Game, GamePlayer, Player, Round

        session = _memory_db()
        session.add(Game(id=1, total_rounds=2, is_active=False, is_valid=True))
        session.add(Player(id=1, alias="veteran", email="v@example.com"))
        session.add(Player(id=2, alias="newcomer", email="n@example.com"))
        session.add(Player(id=3, alias="spectator", email="s@example.com"))
        session.add(GamePlayer(game_id=1, player_id=1))
        session.add(GamePlayer(game_id=1, player_id=3))
        session.add(Round(game_id=1, round_number=1, player_id=1,
                          bet=2, success=True, score=12))
        session.commit()
        yield session
        session.close()

    def test_a_player_with_history_is_refused_with_409(self, db):
        from services.player_service import PlayerService

        with pytest.raises(HTTPException) as excinfo:
            PlayerService(db).delete_player(1)

        assert excinfo.value.status_code == 409
        assert "veteran" in excinfo.value.detail
        assert "1 game" in excinfo.value.detail

    def test_joining_a_game_counts_as_history_even_without_rounds(self, db):
        from services.player_service import PlayerService

        with pytest.raises(HTTPException) as excinfo:
            PlayerService(db).delete_player(3)
        assert excinfo.value.status_code == 409

    def test_a_player_who_never_played_is_deleted(self, db):
        from database import Player
        from services.player_service import PlayerService

        PlayerService(db).delete_player(2)
        assert db.query(Player).filter(Player.id == 2).first() is None

    def test_a_missing_player_is_still_404(self, db):
        from services.player_service import PlayerService

        with pytest.raises(HTTPException) as excinfo:
            PlayerService(db).delete_player(999)
        assert excinfo.value.status_code == 404


class TestParentCycles:
    """
    The API must not store a family tree that cannot be drawn.

    A and B as each other's parent used to be accepted, after which the tree
    renderer recursed until the page died.
    """

    @pytest.fixture
    def db(self):
        from database import Player

        session = _memory_db()
        for pid, alias in ((1, "gran"), (2, "mum"), (3, "kid"), (4, "stranger")):
            session.add(Player(id=pid, alias=alias, email=f"{alias}@example.com"))
        session.commit()
        # gran -> mum -> kid
        for child_id, parent_id in ((2, 1), (3, 2)):
            child = session.query(Player).filter(Player.id == child_id).first()
            child.parents.append(session.query(Player).filter(Player.id == parent_id).first())
        session.commit()
        yield session
        session.close()

    def _set_parents(self, db, player_id, parent_ids, alias):
        from models import PlayerCreate
        from services.player_service import PlayerService

        return PlayerService(db).update_player(player_id, PlayerCreate(
            alias=alias, email=f"{alias}@example.com", parent_ids=parent_ids
        ))

    def test_a_direct_loop_is_refused(self, db):
        """
        kid is mum's parent, while mum is already kid's parent.

        Caught as a contradiction rather than as a cycle, and the message says
        so: since the request leaves mum's children alone, kid would end up
        both parent and child of mum — which is the more precise complaint of
        the two. The multi-step case below is the one that reads as circular.
        """
        with pytest.raises(HTTPException) as excinfo:
            self._set_parents(db, 2, [3], "mum")
        assert excinfo.value.status_code == 400
        assert "both a parent and a child" in excinfo.value.detail

    def test_a_longer_loop_is_refused(self, db):
        # gran is three generations up; making kid its parent closes the ring
        with pytest.raises(HTTPException) as excinfo:
            self._set_parents(db, 1, [3], "gran")
        assert excinfo.value.status_code == 400
        assert "circular" in excinfo.value.detail

    def test_self_parenting_is_refused(self, db):
        with pytest.raises(HTTPException) as excinfo:
            self._set_parents(db, 3, [3], "kid")
        assert excinfo.value.status_code == 400

    def test_an_ordinary_parent_is_still_accepted(self, db):
        updated = self._set_parents(db, 4, [2], "stranger")
        assert updated.parent_ids == [2]

    def test_a_second_parent_on_the_same_child_is_fine(self, db):
        # Two parents is normal; only a loop is not.
        updated = self._set_parents(db, 3, [2, 4], "kid")
        assert sorted(updated.parent_ids) == [2, 4]


# Run with: pytest test_utils.py -v
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
