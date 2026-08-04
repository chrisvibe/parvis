"""
Shared test fixtures.

Everything runs against a fresh in-memory SQLite database built from the real
models, so the schema under test is the schema the app declares — including the
constraints, which is the whole point of several of these tests.

SQLite is not Postgres, and the difference matters in one place: the ALTER and
CREATE INDEX statements in init_db() are Postgres-specific. Tests never call
init_db(); they call Base.metadata.create_all, which produces the same tables
from the same declarations.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base


@pytest.fixture
def db():
    """A session on an empty database with the real schema."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        # One connection for the whole test, or the in-memory database vanishes
        # between statements.
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()

    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(db, monkeypatch):
    """
    A TestClient talking to the same database the test holds.

    Deliberately not entered as a context manager: that would run the app's
    lifespan, and lifespan calls init_db(), which reaches for the real Postgres
    connection. Requests work fine without it — the only thing lifespan does is
    create tables the fixture has already created.

    The password gate is switched off, because these tests are about what the
    endpoints do rather than who may reach them (TestPasswordGate covers that).
    Without this the suite passes or fails depending on whether the machine it
    runs on happens to have a site password configured — which is exactly what
    happened the first time it was run on the server.
    """
    from fastapi.testclient import TestClient

    import main
    from database import get_db

    monkeypatch.delenv("PARVIS_PASSWORD", raising=False)
    monkeypatch.delenv("PARVIS_ADMIN_PASSWORD", raising=False)

    main.app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()
