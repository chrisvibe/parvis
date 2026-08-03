# parvis backlog

Single task list for parvis. Absorbed the old `todo.txt` on 2026-08-02.

Bugs are ordered by how much they matter, not by effort. Each one names the file
so it can be picked up cold.

## Bugs

- [x] **Statistics disagree with themselves.** *(fixed 2026-08-02)* The two
      endpoints computed the same figures two different ways — SQL aggregation
      over every round ever played vs. a Python loop capped at
      `round_number <= game.total_rounds` — so lifetime and per-game numbers
      diverged, and lifetime totals counted cancelled and in-progress games.
      Both now go through `utils/stats.py`, which holds the rules in one place:

      1. A round counts only within its game's `total_rounds` (rounds orphaned
         by shrinking a game score nothing).
      2. Lifetime figures count **finished games only** (`is_valid`) — a record
         moves when a game completes, not while it is being played, and never
         for a cancelled one.
      3. Per-game figures count that game whatever its state, so the live
         scoreboard still works.
      4. Invariant: lifetime totals equal the sum of that player's per-game
         totals over finished games.

      `games_played` now counts game *membership* in finished games, so joining
      a game and never betting still counts as having played it, and the count
      matches the number of per-game rows that sum into the totals.
      `bet-distribution` uses the same rounds, so the histogram adds up to
      `total_rounds`. `GameStats` gained `win_rate`, defined identically to the
      lifetime one. Covered by 12 new tests (33 total) built on a synthetic
      season, since there is no real game data yet.

- [x] **`parent_ids` is always `[]` in three endpoints.** *(fixed 2026-08-03)*
      `POST /players`, `PUT /players/{id}` and `GET /players/{id}` reported no
      parents even when the player had them. `schemas.Player` inherits
      `parent_ids` from `PlayerBase`, but the ORM object only exposed
      `parents`, so `from_attributes` found nothing and fell back to the field
      default — an empty list, which fails silently. Only `GET /players` and
      `/players/{id}/family` were right, because they went through
      `player_to_dict_with_relations`.

      Fixed on the ORM model: `Player.parent_ids` is now a property, so any
      response model with that field picks it up and the class of bug cannot
      come back on the next endpoint. `utils/serializers.py` existed only to
      work around its absence and is gone, taking with it a hand-maintained
      second copy of the player field list. Covered by 8 tests (41 total).

- [x] **No unique constraint on `rounds(game_id, round_number, player_id)`.**
      *(fixed 2026-08-03)* `upsert_round` did read-then-write with nothing
      behind it, so two people editing the game matrix at once could both read
      "no row" and both insert — a silently double-counted score.

      The constraint is on the model and, for databases that predate it, added
      at startup by `_add_missing_constraints()` as a unique index of the same
      name (`CREATE UNIQUE INDEX IF NOT EXISTS` is idempotent where `ADD
      CONSTRAINT` is not). A database that already holds duplicates is reported
      loudly on stderr and skipped rather than crash-looping on every boot.
      `upsert_round` now loses the race gracefully: on IntegrityError it
      re-reads the winner's row and applies the edit there, so last write wins
      exactly as if the two edits had arrived in sequence.

- [x] **Deleting a player with game history returns a 500.** *(fixed
      2026-08-03)* `rounds.player_id` is `NOT NULL`, so the default null-out
      on delete raised an IntegrityError. Now a 409 naming the player and the
      games in the way, so the frontend no longer has to guess. Membership of a
      game counts as history even with no rounds played.

- [x] **A parent cycle crashes the family tree.** *(fixed 2026-08-03)* The API
      accepted A as parent of B and B as parent of A, after which
      `convertToD3TreeFormat` recursed until the stack blew and the page went
      white — confirmed by reproducing it.

      `PUT /players/{id}` now walks up from each proposed parent and returns 400
      if it arrives back at the player, so no loop can be stored (the frontend
      only ever blocked the one-step case). `convertToD3TreeFormat` and
      `filterTree` each carry the ids on the current path and stop at a repeat,
      marking it `isLoop`, so a database that already contains one still
      renders. Still open, deliberately: a child with two parents renders under
      both, because a tree cannot draw a DAG.

- [x] **CORS wildcard with credentials.** *(fixed 2026-08-03)* An "*"
      origin together with `allow_credentials=True` is invalid per the CORS
      spec and browsers reject the pair, so the permissive setting bought
      nothing. `allow_credentials` is now False, which is what the app
      actually needs: the site and admin passwords travel as request headers,
      not cookies, and headers are unaffected by the flag. If cookie or Basic
      auth ever arrives, this must become an explicit origin list rather than
      being switched back on.

## Cleanups

- [ ] **Deprecations:** `@app.on_event("startup")` (use a lifespan handler) and
      `datetime.utcnow()` (naive, deprecated in 3.12).

- [ ] **Duplicated chart maths.** `hooks/useChartData.js` and `Stats.jsx`'s
      `selectGame` build the same cumulative-score array with the same loop.

- [ ] **Duplicated multi-select UI.** The "filter box + dropdown + chip list"
      block is copy-pasted between `Players.jsx` (parent selection) and
      `Stats.jsx` (player selection), inline styles and all. One shared
      component removes both copies.

- [ ] **`Stats.jsx` is 717 lines** doing selection, aggregation, game browsing,
      debounced search, chart building and three tables. `GamePlay.jsx` shows
      the pattern to follow: hooks plus presentational components.

- [ ] **Inline styles fight `index.css`.** There is a real design system in the
      stylesheet (`.card`, `.stat-box`, `.button`), yet `#00ff00` and `#0a0e27`
      are hardcoded inline dozens of times. `settings.yaml` even has a `colors`
      block nothing consumes.

- [ ] **Debug logging left in** `Stats.jsx` and `hooks/useGameState.js` — every
      game payload is dumped to the browser console.

- [ ] **`settings.js` race.** `getSetting` is synchronous but `loadSettings` is
      async and nothing awaits it at startup, so early renders silently get
      defaults. Defaults are also duplicated between `getDefaultSettings()` and
      `public/settings.yaml`.

- [ ] **No tests for services or endpoints.** Only `test_utils.py` exists
      (scoring, validators, player input, password gate). The service layer is
      shaped well for `TestClient` tests that do not exist yet.

- [ ] **No migration tool.** `create_all()` never adds columns, which is why
      `database.py` carries a hand-rolled idempotent `_add_missing_columns()`.
      One or two more schema changes and Alembic starts paying for itself.

## Follow-ups from recent changes

- [ ] **Backfill four legacy emails.** Players registered before email was
      required show `MISSING` in the registry; editing any of them forces an
      email, so the fix is one pass through EDIT.

- [ ] **No logout.** The site password is kept in local storage with no way to
      clear it from the UI; it only clears on a 401. Worth a button if the
      password is ever shared more widely.

- [ ] **Passwords travel as plain headers.** Fine behind the HTTPS front door —
      but do not expose the API over plain HTTP. Moot if this is replaced by
      Cloudflare Access, in which case both variables can simply be blanked.

## Ideas

- [ ] Add a hall of fame.
- [ ] Do the final standings need a rounds column?
- [ ] Add historical pictures to immich, and link the immich albums from here.
- [ ] Improve the visual theme.

## Testing

- [ ] Verify independent mode works: `docker compose up -d` here with only the
      base `docker-compose.yaml` and nothing layered on top. Should be reachable
      directly on its own port from the LAN.

## Notes for whoever deploys this

- The **backend hot-reloads**: `./backend` is bind-mounted and uvicorn runs with
  `--reload`, so copying a file in is enough.
- The **frontend does not**, wherever it is deployed with a build-and-serve
  command rather than the base compose's `npm start`. A source change then needs
  `docker compose restart frontend` — a rebuild against the bind-mounted `src`,
  a few minutes, no image rebuild. Check the running container's command if
  unsure which mode you are in.
- **New environment variables need `docker compose up -d backend`**, not
  `restart` — a reload does not pick them up.
