"""
Endpoint tests.

The service tests cover what the rules are; these cover whether a request
actually reaches them and comes back in the shape the frontend reads. Most of
the bugs this project has had lived exactly here — a field the ORM knew about
that the response model silently defaulted away.
"""

from datetime import datetime

import pytest

from clock import naive_utc_now
from database import Game, GamePlayer, Player, Round


@pytest.fixture
def roster(db):
    for player_id, alias in ((1, "ana"), (2, "ben"), (3, "cleo")):
        db.add(Player(id=player_id, alias=alias, email=f"{alias}@example.com"))
    db.commit()
    return db


class TestPlayersEndpoint:

    def test_the_roster_carries_all_three_relationships(self, roster, client):
        client.put("/players/3", json={
            "alias": "cleo", "email": "cleo@example.com",
            "parent_ids": [1], "partner_ids": [], "child_ids": [],
        })
        client.put("/players/1", json={
            "alias": "ana", "email": "ana@example.com",
            "parent_ids": [], "partner_ids": [2], "child_ids": [3],
        })

        by_alias = {p["alias"]: p for p in client.get("/players").json()}

        assert by_alias["cleo"]["parent_ids"] == [1]
        assert by_alias["ana"]["child_ids"] == [3]
        assert by_alias["ana"]["partner_ids"] == [2]
        assert by_alias["ben"]["partner_ids"] == [1]

    def test_the_roster_carries_a_games_played_count(self, roster, client):
        """
        The family tree labels a node with it. Without this on the roster the
        page would ask for every player's statistics one at a time.
        """
        roster.add(Game(id=1, total_rounds=2, is_valid=True, is_active=False,
                        date=datetime(2026, 1, 1)))
        roster.add(GamePlayer(game_id=1, player_id=1))
        roster.commit()

        by_alias = {p["alias"]: p for p in client.get("/players").json()}

        assert by_alias["ana"]["games_played"] == 1
        assert by_alias["ben"]["games_played"] == 0

    def test_a_contradictory_relationship_is_a_400_not_a_500(self, roster, client):
        response = client.put("/players/1", json={
            "alias": "ana", "email": "ana@example.com",
            "parent_ids": [2], "partner_ids": [2],
        })

        assert response.status_code == 400
        assert "partner" in response.json()["detail"].lower()

    def test_omitting_a_relationship_leaves_it_alone(self, roster, client):
        """
        A save that only mentions the name must not disown the children. The
        write model defaults these to None for exactly this reason.
        """
        client.put("/players/1", json={
            "alias": "ana", "email": "ana@example.com", "child_ids": [3],
        })

        client.put("/players/1", json={"alias": "ana", "email": "ana@example.com"})

        assert client.get("/players/1").json()["child_ids"] == [3]

    def test_an_empty_list_clears_that_relationship(self, roster, client):
        client.put("/players/1", json={
            "alias": "ana", "email": "ana@example.com", "child_ids": [3],
        })

        client.put("/players/1", json={
            "alias": "ana", "email": "ana@example.com", "child_ids": [],
        })

        assert client.get("/players/1").json()["child_ids"] == []

    def test_the_family_endpoint_agrees_with_the_roster(self, roster, client):
        client.put("/players/1", json={
            "alias": "ana", "email": "ana@example.com",
            "child_ids": [3], "partner_ids": [2],
        })

        family = client.get("/players/1/family").json()

        assert family["child_ids"] == [3]
        assert family["partner_ids"] == [2]


class TestGamesEndpoint:

    def test_a_game_defaults_to_standard_and_to_now(self, roster, client):
        before = naive_utc_now()

        game = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
        }).json()

        assert game["game_type"] == "standard"
        assert datetime.fromisoformat(game["date"]) >= before.replace(microsecond=0)

    def test_a_tournament_can_be_created_with_its_own_date(self, roster, client):
        game = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
            "game_type": "tournament",
            "date": "2024-12-31T21:00:00+00:00",
        }).json()

        assert game["game_type"] == "tournament"
        assert datetime.fromisoformat(game["date"]).year == 2024

    def test_an_offset_is_converted_rather_than_dropped(self, roster, client):
        """
        `games.date` has no timezone. Storing the wall-clock part of an offset
        datetime would shift the instant — and, at the turn of a year, the
        tournament's year with it.
        """
        game = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
            "date": "2025-01-01T00:30:00+02:00",
        }).json()

        stored = datetime.fromisoformat(game["date"])
        assert (stored.year, stored.month, stored.day, stored.hour) == (2024, 12, 31, 22)

    def test_type_and_date_can_be_corrected_afterwards(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
        }).json()["id"]

        client.put(f"/games/{game_id}/metadata", params={
            "game_type": "tournament", "date": "2023-06-01T18:00:00+00:00",
        })

        corrected = client.get(f"/games/{game_id}").json()
        assert corrected["game_type"] == "tournament"
        assert datetime.fromisoformat(corrected["date"]).year == 2023

    def test_editing_one_field_leaves_the_others_alone(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
            "game_type": "tournament", "notes": "the final",
        }).json()["id"]

        client.put(f"/games/{game_id}/metadata", params={"location": "kitchen"})

        game = client.get(f"/games/{game_id}").json()
        assert game["location"] == "kitchen"
        assert game["notes"] == "the final"
        assert game["game_type"] == "tournament"


class TestSeating:
    """
    Column order in the matrix is who bids first — round N belongs to seat
    N % players — so it is game state, and it has to survive a reload.
    """

    def _seating(self, client, game_id):
        return [row["player_alias"] for row in client.get(f"/games/{game_id}/stats").json()]

    def test_players_are_seated_in_the_order_they_were_chosen(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [3, 1, 2], "total_rounds": 5,
        }).json()["id"]

        assert self._seating(client, game_id) == ["cleo", "ana", "ben"]

    def test_seats_are_numbered_from_zero(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [3, 1, 2], "total_rounds": 5,
        }).json()["id"]

        stats = client.get(f"/games/{game_id}/stats").json()
        assert [row["seat"] for row in stats] == [0, 1, 2]

    def test_reseating_survives_a_reload(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [1, 2, 3], "total_rounds": 5,
        }).json()["id"]

        response = client.put(f"/games/{game_id}/player-order",
                              json={"player_ids": [2, 3, 1]})

        assert response.status_code == 200
        assert self._seating(client, game_id) == ["ben", "cleo", "ana"]

    def test_a_partial_seating_is_refused(self, roster, client):
        """
        Half a seating has no unambiguous reading: the seats it leaves out
        could go anywhere.
        """
        game_id = client.post("/games", json={
            "player_ids": [1, 2, 3], "total_rounds": 5,
        }).json()["id"]

        response = client.put(f"/games/{game_id}/player-order",
                              json={"player_ids": [2, 1]})

        assert response.status_code == 400
        assert self._seating(client, game_id) == ["ana", "ben", "cleo"]

    def test_seating_someone_who_is_not_playing_is_refused(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
        }).json()["id"]

        response = client.put(f"/games/{game_id}/player-order",
                              json={"player_ids": [1, 2, 3]})

        assert response.status_code == 400

    def test_one_player_cannot_take_two_seats(self, roster, client):
        game_id = client.post("/games", json={
            "player_ids": [1, 2], "total_rounds": 5,
        }).json()["id"]

        response = client.put(f"/games/{game_id}/player-order",
                              json={"player_ids": [1, 1]})

        assert response.status_code == 400
        assert "two seats" in response.json()["detail"]


class TestRemovingAPlayer:
    """
    Somebody who could not finish comes out of the game entirely, as though
    they had never been in it — the game is recorded as the one that was played,
    by the people who played it through.

    The seating is the part with teeth. Round N belongs to seat N % players, so
    a game that is now four-handed has to be numbered four-handed or the
    priority highlight points at the wrong person for every round of it.
    """

    def _game(self, client, players=(1, 2, 3), rounds=5):
        return client.post("/games", json={
            "player_ids": list(players), "total_rounds": rounds,
        }).json()["id"]

    def _bet(self, client, game_id, round_number, player_id, bet, success=True):
        return client.post(f"/games/{game_id}/rounds/upsert", params={
            "round_number": round_number, "player_id": player_id,
            "bet": bet, "success": success,
        })

    def _stats(self, client, game_id):
        return client.get(f"/games/{game_id}/stats").json()

    def test_they_are_gone_from_the_roster(self, roster, client):
        game_id = self._game(client)

        response = client.delete(f"/games/{game_id}/players/1")

        assert response.status_code == 200
        assert [row["player_alias"] for row in self._stats(client, game_id)] == ["ben", "cleo"]

    def test_everything_they_bet_in_that_game_goes_with_them(self, roster, client):
        game_id = self._game(client)
        for round_number in (1, 2, 3):
            self._bet(client, game_id, round_number, 1, 1)

        response = client.delete(f"/games/{game_id}/players/1")

        assert response.json()["rounds_removed"] == 3
        assert all(r["player_id"] != 1
                   for r in client.get(f"/games/{game_id}/rounds").json())

    def test_the_seats_close_up_behind_them(self, roster, client):
        """
        The whole reason this renumbers. Leaving a hole at seat 0 would keep the
        game three-handed as far as the rotation is concerned.
        """
        game_id = self._game(client)

        client.delete(f"/games/{game_id}/players/1")

        assert [row["seat"] for row in self._stats(client, game_id)] == [0, 1]

    def test_removing_from_the_middle_keeps_the_order_of_the_rest(self, roster, client):
        game_id = self._game(client, players=(3, 1, 2))

        client.delete(f"/games/{game_id}/players/1")

        stats = self._stats(client, game_id)
        assert [row["player_alias"] for row in stats] == ["cleo", "ben"]
        assert [row["seat"] for row in stats] == [0, 1]

    def test_nobody_elses_score_is_touched(self, roster, client):
        game_id = self._game(client)
        self._bet(client, game_id, 1, 1, 1)
        self._bet(client, game_id, 3, 2, 3)

        client.delete(f"/games/{game_id}/players/1")

        ben = next(row for row in self._stats(client, game_id)
                   if row["player_alias"] == "ben")
        assert ben["total_score"] == 13

    def test_they_can_be_added_to_a_later_game_as_normal(self, roster, client):
        """
        This is about one game, not about the player. Removing them from a
        night out is not a ban.
        """
        first = self._game(client)
        client.delete(f"/games/{first}/players/1")

        second = self._game(client, players=(1, 2))
        assert self._bet(client, second, 1, 1, 1).status_code == 200

    def test_somebody_who_is_not_in_the_game_cannot_be_removed(self, roster, client):
        game_id = self._game(client, players=(1, 2))

        assert client.delete(f"/games/{game_id}/players/3").status_code == 404

    def test_a_game_cannot_be_cut_below_two_players(self, roster, client):
        """
        One player left is not a shorter game but an abandoned one, and CANCEL
        or DELETE says that without pretending there are results.
        """
        game_id = self._game(client, players=(1, 2))

        response = client.delete(f"/games/{game_id}/players/1")

        assert response.status_code == 400
        assert "at least two players" in response.json()["detail"]
        assert len(self._stats(client, game_id)) == 2


class TestHallOfFameEndpoint:

    @pytest.fixture(autouse=True)
    def _no_seed_file(self, monkeypatch):
        monkeypatch.setenv("HALL_OF_FAME_SEED", "/nonexistent/seed.json")

    def test_it_answers_on_an_empty_database(self, db, client):
        body = client.get("/hall-of-fame").json()

        assert body["tournament_winners"] == []
        assert body["album_url"]
        assert body["records"]

    def test_a_finished_tournament_appears(self, roster, client):
        roster.add(Game(id=1, game_type="tournament", total_rounds=1,
                        is_valid=True, is_active=False, date=datetime(2025, 5, 1)))
        roster.add(GamePlayer(game_id=1, player_id=1))
        roster.add(Round(game_id=1, round_number=1, player_id=1,
                         bet=4, success=True, score=14))
        roster.commit()

        body = client.get("/hall-of-fame").json()

        assert body["tournament_winners"] == [{
            "year": 2025, "player_alias": "ana", "player_id": 1,
            "score": 14, "game_id": 1, "is_historical": False,
        }]
