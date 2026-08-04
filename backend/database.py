from sqlalchemy import (
    create_engine, inspect, Column, Integer, String, Boolean, Date, ForeignKey,
    DateTime, Table, CheckConstraint, UniqueConstraint, text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
import os
import sys

# Deliberately not from utils/: that package imports database, and importing it
# back from here closes the loop.
from clock import naive_utc_now, today

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://parvis:parvis@db:5432/parvis")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Association table for parent-child relationships.
#
# One row means "player_id has parent_id as a parent". The UI offers three
# relationships — parent, child, partner — but "child" is not stored separately:
# marking X as my child is the same edge as marking me as X's parent, entered
# from the other end. Two tables for one fact is how they get to disagree.
player_parents = Table(
    'player_parents',
    Base.metadata,
    Column('player_id', Integer, ForeignKey('players.id'), primary_key=True),
    Column('parent_id', Integer, ForeignKey('players.id'), primary_key=True)
)

# Association table for partnerships.
#
# Unlike parenthood this relation is symmetric, so it is stored canonically with
# the lower id first and a CHECK to enforce it. Without that the same couple can
# be inserted as (3,7) and (7,3), and every read has to remember to look both
# ways. Writes go through PlayerService, which orders the pair; the ORM
# relationships below are viewonly so nothing can bypass that.
player_partners = Table(
    'player_partners',
    Base.metadata,
    Column('player_a_id', Integer, ForeignKey('players.id'), primary_key=True),
    Column('player_b_id', Integer, ForeignKey('players.id'), primary_key=True),
    CheckConstraint('player_a_id < player_b_id', name='ck_player_partners_canonical'),
)

class Player(Base):
    __tablename__ = "players"
    
    id = Column(Integer, primary_key=True, index=True)
    alias = Column(String, unique=True, index=True, nullable=False)
    # Required for new players (enforced by PlayerCreate), but nullable in the
    # database so players registered before this field existed still load.
    email = Column(String)
    first_name = Column(String)
    middle_name = Column(String)
    last_name = Column(String)
    birthdate = Column(Date)
    registration_date = Column(Date, default=today)
    last_game_date = Column(DateTime, nullable=True)  # Track most recent game
    
    # Relationships
    game_participations = relationship("GamePlayer", back_populates="player")
    rounds = relationship("Round", back_populates="player")
    
    # Parent-child relationships
    parents = relationship(
        "Player",
        secondary=player_parents,
        primaryjoin=id == player_parents.c.player_id,
        secondaryjoin=id == player_parents.c.parent_id,
        backref="children"
    )

    # Both halves of the symmetric partner relation. A partnership is stored
    # once, canonically, so a player is the "a" side of some of their
    # partnerships and the "b" side of the others; partner_ids unions the two.
    partners_as_a = relationship(
        "Player",
        secondary=player_partners,
        primaryjoin=id == player_partners.c.player_a_id,
        secondaryjoin=id == player_partners.c.player_b_id,
        viewonly=True,
    )
    partners_as_b = relationship(
        "Player",
        secondary=player_partners,
        primaryjoin=id == player_partners.c.player_b_id,
        secondaryjoin=id == player_partners.c.player_a_id,
        viewonly=True,
    )

    # Filled in by PlayerService.get_all_players so the tree can label a node
    # with how many games its player has finished. Not a column, and not a
    # property either — it needs a session, and one grouped query for the whole
    # roster beats one query per player.
    games_played = 0

    @property
    def partner_ids(self):
        """The player's partners as plain ids, in ascending order."""
        return sorted(
            {p.id for p in self.partners_as_a} | {p.id for p in self.partners_as_b}
        )

    @property
    def child_ids(self):
        """The inverse of parent_ids, for the same reason parent_ids exists."""
        return sorted(c.id for c in self.children)

    @property
    def parent_ids(self):
        """
        The parent relationship as plain ids, which is how the API expresses it.

        Exposed on the model rather than in a serializer so that any response
        model carrying a `parent_ids` field picks it up through
        `from_attributes`. Without it pydantic finds no such attribute and
        silently falls back to the field default — which is how three endpoints
        came to report every player as having no parents.
        """
        return [p.id for p in self.parents]

class Game(Base):
    __tablename__ = "games"
    
    id = Column(Integer, primary_key=True, index=True)
    game_type = Column(String, default="standard")
    date = Column(DateTime, default=naive_utc_now)
    notes = Column(String)
    location = Column(String)
    total_rounds = Column(Integer)
    current_round = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    is_valid = Column(Boolean, default=False)  # Only true when finished successfully
    
    players = relationship("GamePlayer", back_populates="game")
    rounds = relationship("Round", back_populates="game")

class GamePlayer(Base):
    __tablename__ = "game_players"

    game_id = Column(Integer, ForeignKey("games.id"), primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"), primary_key=True)

    # Where this player sits, counting from zero. This is game state, not a
    # display preference: the matrix highlights a different player each round
    # (round N belongs to seat N % players), so who bids first is read off the
    # seating. Before this column the order was whatever the database happened
    # to return, which meant the rotation was never deliberately chosen.
    seat = Column(Integer, nullable=False, default=0, server_default="0")

    game = relationship("Game", back_populates="players")
    player = relationship("Player", back_populates="game_participations")

class Round(Base):
    __tablename__ = "rounds"

    # One row per player per round of a game. Without this the read-then-write
    # in upsert_round has nothing behind it: two people editing the same game
    # matrix can both find no row and both insert, and the duplicate scores are
    # counted twice with nothing to show that it happened.
    __table_args__ = (
        UniqueConstraint("game_id", "round_number", "player_id",
                         name="uq_round_game_number_player"),
    )

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    round_number = Column(Integer, nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    bet = Column(Integer, nullable=False)
    success = Column(Boolean, nullable=False)
    score = Column(Integer)  # Calculated: (10 + bet) if success else 0
    
    game = relationship("Game", back_populates="rounds")
    player = relationship("Player", back_populates="rounds")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

BASELINE_REVISION = "0001_baseline"


def init_db():
    """
    Bring the database up to whatever the models now declare.

    Two paths, because one production database predates Alembic:

      * tables but no `alembic_version` — this database was built by create_all
        before migrations existed. Create whatever is missing the old way, run
        the two idempotent fix-ups that used to run on every boot, and stamp it
        with the baseline. This happens exactly once, on one database.
      * otherwise — run the migrations, which from that point on are the only
        thing that changes the schema. An empty database goes this way too, and
        is built from the baseline forward.

    The point of the split is that create_all must stop running once Alembic is
    in charge: it would helpfully create the table a pending migration is about
    to create, and the migration would then fail on every boot.
    """
    if _is_pre_alembic_database():
        _adopt_existing_database()

    _upgrade_to_head()


def _is_pre_alembic_database() -> bool:
    """
    Was this database built before migrations existed?

    An empty database answers no. It has no `alembic_version` either, but
    adopting it would be actively wrong: create_all builds the schema the models
    declare *today*, and stamping that at the baseline claims every migration
    since has already run. The first one that adds a column would then try to
    add a column create_all had just created, and fail on every boot. Migrations
    build an empty database from nothing, which is the path they are written
    for and the only one that exercises them.
    """
    inspector = inspect(engine)
    if inspector.has_table("alembic_version"):
        return False
    return inspector.has_table("players")


def _adopt_existing_database():
    """The one-time crossing: build what create_all built, then record it."""
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
    _add_missing_constraints()

    from alembic import command

    command.stamp(_alembic_config(), BASELINE_REVISION)
    print(f"Database stamped at {BASELINE_REVISION}; migrations take over from here.",
          flush=True)


def _upgrade_to_head():
    from alembic import command

    command.upgrade(_alembic_config(), "head")


def _alembic_config():
    """
    Alembic's config, pointed at this package rather than the working directory.

    uvicorn is started from /app, but nothing guarantees that stays true, and a
    migration runner that only works from one directory is a trap.
    """
    from alembic.config import Config

    here = os.path.dirname(os.path.abspath(__file__))
    config = Config(os.path.join(here, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(here, "migrations"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    return config


def _add_missing_columns():
    """
    Add columns that were introduced after a database was first created.

    create_all() only creates missing tables, never missing columns, so a
    database that predates a new field needs the ALTER. This now runs only on
    the crossing into Alembic — including after a restore from a backup taken
    before it — so the statements must stay idempotent and non-destructive.
    Nothing new belongs here: a column added from now on is a migration.
    """
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR"))


def _add_missing_constraints():
    """
    Add constraints introduced after a database was first created.

    Same deal as _add_missing_columns: create_all() will not retrofit these onto
    an existing table, and this runs only on the crossing into Alembic. Written
    as a unique INDEX rather than a table constraint
    because CREATE UNIQUE INDEX takes IF NOT EXISTS and ADD CONSTRAINT does not;
    the constraint declared on the model produces an index of the same name, so
    a database created either way ends up in the same place and reruns are
    no-ops.

    A database that already contains duplicates cannot take the index. Rather
    than crash every startup until someone intervenes, that case is reported
    loudly and skipped — the app still runs, just without the new guarantee.
    """
    with engine.begin() as conn:
        duplicates = conn.execute(text("""
            SELECT game_id, round_number, player_id, COUNT(*) AS n
            FROM rounds
            GROUP BY game_id, round_number, player_id
            HAVING COUNT(*) > 1
        """)).fetchall()

        if duplicates:
            print(
                "WARNING: rounds contains duplicate (game_id, round_number, "
                f"player_id) rows, so the unique index was not created. "
                f"{len(duplicates)} duplicated key(s): {duplicates[:5]}. "
                "Scores for these are being double-counted; de-duplicate, then "
                "restart to apply the constraint.",
                file=sys.stderr, flush=True,
            )
            return

        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_round_game_number_player "
            "ON rounds (game_id, round_number, player_id)"
        ))
