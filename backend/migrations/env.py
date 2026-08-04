"""
Alembic environment.

Two things differ from the generated default:

  * the URL comes from DATABASE_URL, so migrations connect exactly where the
    app does and no credentials live in alembic.ini
  * `target_metadata` is the app's own Base.metadata, so `alembic revision
    --autogenerate` can diff the models against the database
"""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# The backend package is the parent of this directory; migrations are run from
# there, but make it explicit so `alembic` works from anywhere.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers stays off: migrations also run from inside the
    # app at startup, and the generated default would silence uvicorn's loggers
    # as a side effect of applying a migration.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

config.set_main_option(
    "sqlalchemy.url",
    os.getenv("DATABASE_URL", "postgresql://parvis:parvis@db:5432/parvis"),
)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it — for review before a change."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Without this a column changing type or nullability is invisible to
            # autogenerate, which is most of what a schema change actually is.
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
