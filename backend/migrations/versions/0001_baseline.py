"""Baseline: the schema as it stood when Alembic was adopted.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-04

This is the starting point, not a change. A database that already exists is
brought under Alembic by stamping it with this revision rather than running it —
see init_db() in database.py, which does that automatically the first time it
finds tables but no alembic_version.

Everything here matches the models in database.py. Anything added from now on
belongs in a new revision, not in this file and not in a hand-written ALTER.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("alias", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("first_name", sa.String(), nullable=True),
        sa.Column("middle_name", sa.String(), nullable=True),
        sa.Column("last_name", sa.String(), nullable=True),
        sa.Column("birthdate", sa.Date(), nullable=True),
        sa.Column("registration_date", sa.Date(), nullable=True),
        sa.Column("last_game_date", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_players_id"), "players", ["id"])
    op.create_index(op.f("ix_players_alias"), "players", ["alias"], unique=True)

    op.create_table(
        "player_parents",
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.ForeignKeyConstraint(["parent_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("player_id", "parent_id"),
    )

    op.create_table(
        "player_partners",
        sa.Column("player_a_id", sa.Integer(), nullable=False),
        sa.Column("player_b_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["player_a_id"], ["players.id"]),
        sa.ForeignKeyConstraint(["player_b_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("player_a_id", "player_b_id"),
        # A partnership is symmetric, so it is stored once with the lower id
        # first. Without this the same couple can exist twice, in both
        # directions, and every read has to remember to look both ways.
        sa.CheckConstraint(
            "player_a_id < player_b_id", name="ck_player_partners_canonical"
        ),
    )

    op.create_table(
        "games",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_type", sa.String(), nullable=True),
        sa.Column("date", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("total_rounds", sa.Integer(), nullable=True),
        sa.Column("current_round", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_games_id"), "games", ["id"])

    op.create_table(
        "game_players",
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"]),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("game_id", "player_id"),
    )

    op.create_table(
        "rounds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("bet", sa.Integer(), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"]),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("id"),
        # One row per player per round: upsert_round does read-then-write, and
        # without this two people editing the same matrix can both insert.
        sa.UniqueConstraint(
            "game_id", "round_number", "player_id",
            name="uq_round_game_number_player",
        ),
    )
    op.create_index(op.f("ix_rounds_id"), "rounds", ["id"])


def downgrade() -> None:
    op.drop_table("rounds")
    op.drop_table("game_players")
    op.drop_table("games")
    op.drop_table("player_partners")
    op.drop_table("player_parents")
    op.drop_table("players")
