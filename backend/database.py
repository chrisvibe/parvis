from sqlalchemy import create_engine, Column, Integer, String, Boolean, Date, ForeignKey, DateTime, Table, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://parvis:parvis@db:5432/parvis")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Association table for parent-child relationships
player_parents = Table(
    'player_parents',
    Base.metadata,
    Column('player_id', Integer, ForeignKey('players.id'), primary_key=True),
    Column('parent_id', Integer, ForeignKey('players.id'), primary_key=True)
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
    registration_date = Column(Date, default=datetime.utcnow)
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
    date = Column(DateTime, default=datetime.utcnow)
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
    
    game = relationship("Game", back_populates="players")
    player = relationship("Player", back_populates="game_participations")

class Round(Base):
    __tablename__ = "rounds"
    
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

def init_db():
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


def _add_missing_columns():
    """
    Add columns that were introduced after a database was first created.

    create_all() only creates missing tables, never missing columns, so a
    database that predates a new field needs the ALTER. Statements here must be
    idempotent and non-destructive — they run on every startup, including after
    a restore from an older backup.
    """
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR"))
