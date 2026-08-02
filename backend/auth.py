"""
Optional password protection for the Parvis API.

Two independent secrets, both read from the environment:

    PARVIS_PASSWORD        needed for every request
    PARVIS_ADMIN_PASSWORD  needed instead of the above for deleting data

Neither is set by default. When neither is set the API behaves exactly as it
did before this module existed — no headers, no prompts, no gate — so the
protection can be turned off again, or handed over to Cloudflare Access later,
by clearing the variables.

Enforcement lives here rather than in the frontend because the API is the real
surface: anything on the LAN can talk to it directly.
"""

import os
from hmac import compare_digest
from typing import Optional, Tuple

PASSWORD_HEADER = "X-Parvis-Password"
ADMIN_PASSWORD_HEADER = "X-Parvis-Admin-Password"

# Reachable without a password: the container healthcheck and any monitoring
# that only needs liveness.
OPEN_PATHS = {"/health"}


def _from_env(name: str) -> str:
    """Read a secret from the environment. Blank and unset mean the same thing."""
    return (os.getenv(name) or "").strip()


def app_password() -> str:
    return _from_env("PARVIS_PASSWORD")


def admin_password() -> str:
    return _from_env("PARVIS_ADMIN_PASSWORD")


def protection_enabled() -> bool:
    """True when at least one password is configured."""
    return bool(app_password() or admin_password())


def _matches(supplied: Optional[str], expected: str) -> bool:
    """Constant-time comparison that treats missing values as a mismatch."""
    if not expected or not supplied:
        return False
    return compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))


def check_request(
    method: str,
    path: str,
    supplied: Optional[str],
    supplied_admin: Optional[str],
) -> Optional[Tuple[int, str]]:
    """
    Decide whether a request may proceed.

    Returns None to allow it, or (status_code, detail) to reject it. 401 means
    "the site password is missing or wrong", 403 means "this needs the admin
    password" — the frontend uses the difference to decide which one to ask for.

    Deleting data is the only operation held to the higher bar, and only when an
    admin password is actually configured; otherwise deletes follow the normal
    rule. An admin password is accepted anywhere the site password is, so an
    admin never has to hold both.
    """
    if method == "OPTIONS" or path in OPEN_PATHS:
        return None

    password = app_password()
    admin = admin_password()

    # Nothing configured: unchanged, wide-open behaviour.
    if not password and not admin:
        return None

    if method == "DELETE" and admin:
        if _matches(supplied_admin, admin):
            return None
        return 403, "Admin password required to delete data"

    if password:
        if _matches(supplied, password) or _matches(supplied, admin):
            return None
        return 401, "Password required"

    return None
