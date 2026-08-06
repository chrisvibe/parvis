"""Let an imported game carry what was doubtful about it.

Revision ID: 0003_game_import_warnings
Revises: 0002_game_player_seat
Create Date: 2026-08-05

Games can now be imported from a CSV transcribed off a paper score sheet, and
the arithmetic checks on that file find things nobody can settle without the
paper in front of them: a round awarding more tricks than it deals, a column
that does not add up to the total written under it.

Refusing the import was the first answer and the wrong one — the game then
exists nowhere and the person who could fix it has nothing to fix. So the game
is imported and its doubts come with it, in this column, which the active game
screen turns into a banner over the matrix. Clearing it is a deliberate act:
somebody looked at the paper and says it is right.

Null for every game that was not imported, and for imported ones that read
cleanly.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_game_import_warnings"
down_revision: Union[str, None] = "0002_game_player_seat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("games", sa.Column("import_warnings", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("games", "import_warnings")
