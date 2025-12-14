from sqlalchemy import create_engine, Column, Integer, String, Boolean, Date, ForeignKey, DateTime, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
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
    first_name = Column(String)
    middle_name = Column(String)
    last_name = Column(String)
    birthdate = Column(Date)
    registration_date = Column(Date, default=datetime.utcnow)
    
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

class Game(Base):
    __tablename__ = "games"
    
    id = Column(Integer, primary_key=True, index=True)
    game_type = Column(String, default="standard")
    date = Column(DateTime, default=datetime.utcnow)
    notes = Column(String)
    location = Column(String)
    total_rounds = Column(Integer)
    current_round = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
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
