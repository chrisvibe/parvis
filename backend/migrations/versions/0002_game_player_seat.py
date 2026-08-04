"""Give every player in a game a seat.

Revision ID: 0002_game_player_seat
Revises: 0001_baseline
Create Date: 2026-08-04

Column order in the matrix decides who bids first — round N belongs to seat
N % players — but nothing stored it. The order on screen was whatever the
database returned for an unordered query, so the rotation was never chosen by
anyone and could in principle differ between two loads of the same game.

Backfilling has to preserve what people are already looking at, because games
already played were scored against the diagonal as it was drawn at the time. On
PostgreSQL that order is recoverable: game_players rows are inserted once and
never updated, so physical order (ctid) is insertion order, which is the order
the players were picked when the game was created. Elsewhere there is no such
handle and player_id is the best deterministic fallback.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_game_player_seat"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default so the ALTER can fill existing rows without a second pass;
    # it stays on the column afterwards, which also keeps any INSERT that
    # predates the application code from failing on a NOT NULL.
    op.add_column(
        "game_players",
        sa.Column("seat", sa.Integer(), nullable=False, server_default="0"),
    )

    # Numbering restarts per game, so seats run 0..n-1 within each game rather
    # than being unique across the table.
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            """
            UPDATE game_players AS gp
            SET seat = ordered.position - 1
            FROM (
                SELECT
                    ctid AS row_id,
                    ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY ctid) AS position
                FROM game_players
            ) AS ordered
            WHERE gp.ctid = ordered.row_id
            """
        )
    else:
        op.execute(
            """
            UPDATE game_players
            SET seat = (
                SELECT COUNT(*)
                FROM game_players AS earlier
                WHERE earlier.game_id = game_players.game_id
                  AND earlier.player_id < game_players.player_id
            )
            """
        )


def downgrade() -> None:
    op.drop_column("game_players", "seat")
