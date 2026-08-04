"""
The current time, in one place.

`datetime.utcnow()` is deprecated in Python 3.12 and — more to the point — it
returns a *naive* datetime that claims nothing about its zone, which is how a
UTC timestamp ends up being compared against a local one. `now()` returns an
aware UTC datetime instead.

`naive_utc_now()` exists because the existing columns are `DateTime` without
`timezone=True`, and Postgres drops the offset on the way in. Feeding an aware
value into a naive column stores the right instant but reads back naive, so
mixing the two in one comparison raises. Until the columns are migrated to
`timestamptz`, anything destined for storage uses `naive_utc_now()` and
everything else uses `now()`.
"""

from datetime import datetime, timezone


def now() -> datetime:
    """The current instant, timezone-aware, in UTC."""
    return datetime.now(timezone.utc)


def naive_utc_now() -> datetime:
    """The current UTC instant with the offset stripped, for naive columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def today():
    """Today's date in UTC."""
    return now().date()
