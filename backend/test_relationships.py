"""
Relationships: parent, child, partner.

The UI offers three, the database stores two. These tests pin down the mapping,
because it is the kind of thing that reads as correct and is quietly wrong: a
partnership stored twice, or a child edge that only exists when entered from one
particular end.
"""

import pytest
from fastapi import HTTPException

from database import Player, player_partners
from models import PlayerCreate
from services.player_service import PlayerService


def _add(db, *aliases):
    """Create players named by alias, ids assigned in order from 1."""
    for index, alias in enumerate(aliases, start=1):
        db.add(Player(id=index, alias=alias, email=f"{alias}@example.com"))
    db.commit()


def _save(db, player_id, alias, **relationships):
    return PlayerService(db).update_player(player_id, PlayerCreate(
        alias=alias, email=f"{alias}@example.com", **relationships
    ))


@pytest.fixture
def family(db):
    """Four unrelated players: 1 ana, 2 ben, 3 cleo, 4 dev."""
    _add(db, "ana", "ben", "cleo", "dev")
    return db


class TestPartners:
    """A partnership is one fact, symmetric, stored once."""

    def test_a_partnership_is_visible_from_both_sides(self, family):
        _save(family, 1, "ana", partner_ids=[2])

        assert PlayerService(family).get_player(1).partner_ids == [2]
        assert PlayerService(family).get_player(2).partner_ids == [1]

    def test_it_is_stored_as_a_single_canonical_row(self, family):
        """
        The reason for the CHECK: without a canonical order the same couple can
        exist as (1,2) and (2,1), and every read has to look both ways.
        """
        _save(family, 2, "ben", partner_ids=[1])

        rows = family.execute(player_partners.select()).fetchall()
        assert rows == [(1, 2)]

    def test_declaring_it_from_the_other_end_does_not_duplicate_it(self, family):
        _save(family, 1, "ana", partner_ids=[2])
        _save(family, 2, "ben", partner_ids=[1])

        assert len(family.execute(player_partners.select()).fetchall()) == 1

    def test_removing_a_partner_removes_the_row(self, family):
        _save(family, 1, "ana", partner_ids=[2])
        _save(family, 1, "ana", partner_ids=[])

        assert family.execute(player_partners.select()).fetchall() == []
        assert PlayerService(family).get_player(2).partner_ids == []

    def test_a_player_can_have_more_than_one_partner(self, family):
        """Remarriage is not an error; the tree draws the extra one as a ghost."""
        _save(family, 1, "ana", partner_ids=[2, 3])

        assert PlayerService(family).get_player(1).partner_ids == [2, 3]

    def test_editing_one_partnership_leaves_the_others_alone(self, family):
        _save(family, 1, "ana", partner_ids=[2])
        _save(family, 3, "cleo", partner_ids=[4])

        assert PlayerService(family).get_player(4).partner_ids == [3]


class TestChildren:
    """`child` is `parent` entered from the other end — the same row."""

    def test_a_child_edge_shows_up_as_the_child_s_parent(self, family):
        _save(family, 1, "ana", child_ids=[3])

        assert PlayerService(family).get_player(3).parent_ids == [1]

    def test_a_parent_edge_shows_up_as_the_parent_s_child(self, family):
        _save(family, 3, "cleo", parent_ids=[1])

        assert PlayerService(family).get_player(1).child_ids == [3]

    def test_removing_a_child_removes_the_parent_edge(self, family):
        _save(family, 1, "ana", child_ids=[3])
        _save(family, 1, "ana", child_ids=[])

        assert PlayerService(family).get_player(3).parent_ids == []

    def test_two_parents_of_one_child(self, family):
        _save(family, 1, "ana", child_ids=[3])
        _save(family, 2, "ben", child_ids=[3])

        assert sorted(PlayerService(family).get_player(3).parent_ids) == [1, 2]


class TestImpossibleRelationships:
    """Contradictions are refused before anything is written."""

    @pytest.mark.parametrize("field", ["parent_ids", "child_ids", "partner_ids"])
    def test_a_player_cannot_be_their_own_anything(self, family, field):
        with pytest.raises(HTTPException) as excinfo:
            _save(family, 1, "ana", **{field: [1]})
        assert excinfo.value.status_code == 400

    def test_the_same_person_cannot_be_parent_and_child(self, family):
        with pytest.raises(HTTPException) as excinfo:
            _save(family, 1, "ana", parent_ids=[2], child_ids=[2])
        assert excinfo.value.status_code == 400

    def test_a_partner_cannot_also_be_a_parent(self, family):
        with pytest.raises(HTTPException) as excinfo:
            _save(family, 1, "ana", parent_ids=[2], partner_ids=[2])
        assert excinfo.value.status_code == 400

    def test_a_refused_save_writes_nothing(self, family):
        """Half a rewiring is worse than none: the tree would be inconsistent."""
        _save(family, 1, "ana", partner_ids=[4])

        with pytest.raises(HTTPException):
            _save(family, 1, "ana", parent_ids=[2], child_ids=[2], partner_ids=[])

        assert PlayerService(family).get_player(1).partner_ids == [4]

    def test_an_unknown_id_is_dropped_rather_than_refused(self, family):
        """A stale id from a page open while someone deleted a player."""
        updated = _save(family, 1, "ana", child_ids=[3, 999])

        assert updated.child_ids == [3]


class TestCyclesAcrossRelationships:
    """
    Cycle detection judges the tree the request would produce, not the one it
    finds — otherwise a legal rearrangement done in one save gets refused.
    """

    @pytest.fixture
    def line(self, family):
        # ana -> ben -> cleo, oldest first
        _save(family, 2, "ben", parent_ids=[1])
        _save(family, 3, "cleo", parent_ids=[2])
        return family

    def test_a_loop_through_the_child_field_is_refused(self, line):
        # ana's parent is cleo, who is already ana's grandchild
        with pytest.raises(HTTPException) as excinfo:
            _save(line, 1, "ana", parent_ids=[3])
        assert excinfo.value.status_code == 400
        assert "circular" in excinfo.value.detail

    def test_a_loop_created_by_parent_and_child_together_is_refused(self, line):
        # dev's parent is cleo and dev's child is ana, closing the ring
        with pytest.raises(HTTPException) as excinfo:
            _save(line, 4, "dev", parent_ids=[3], child_ids=[1])
        assert excinfo.value.status_code == 400

    def test_moving_a_child_up_a_generation_is_allowed(self, line):
        """
        cleo stops being ben's child and becomes ana's, in one save. Judged on
        stored edges this looks like a loop through ben; judged on the proposed
        tree it is an ordinary correction.
        """
        _save(line, 3, "cleo", parent_ids=[1])

        assert PlayerService(line).get_player(3).parent_ids == [1]
        assert PlayerService(line).get_player(2).child_ids == []


class TestDeletingAPlayer:
    """A partner row is invisible to the ORM, so deleting has to clear it."""

    def test_a_partnered_player_with_no_games_can_be_deleted(self, family):
        _save(family, 1, "ana", partner_ids=[2])

        PlayerService(family).delete_player(1)

        assert family.query(Player).filter(Player.id == 1).first() is None
        assert family.execute(player_partners.select()).fetchall() == []
        assert PlayerService(family).get_player(2).partner_ids == []
