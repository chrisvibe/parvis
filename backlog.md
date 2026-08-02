# parvis backlog

Single task list for parvis. Absorbed the old `todo.txt` on 2026-08-02.

Bugs are ordered by how much they matter, not by effort. Each one names the file
so it can be picked up cold.

## Bugs

- [ ] **Statistics disagree with themselves.** `player_service.get_player_stats`
      aggregates in SQL over *every* round a player ever played;
      `game_service.get_game_stats` aggregates in a Python loop capped at
      `round_number <= game.total_rounds`. So the same numbers are computed two
      different ways, and per-game and lifetime figures diverge. Lifetime stats
      also count rounds from **cancelled and unfinished games**, because nothing
      joins to `Game.is_valid`. This is almost certainly the cause of the old
      todo item "make sure statistics make sense". Decide the rule first (do
      abandoned games count?), then implement it once and have both endpoints
      call it.

- [ ] **`parent_ids` is always `[]` in three endpoints.** `POST /players`,
      `PUT /players/{id}` and `GET /players/{id}` all report no parents even
      when the player has them — verified live. `schemas.Player` inherits
      `parent_ids` from `PlayerBase`, but the ORM object exposes `parents`, so
      `from_attributes` finds nothing and falls back to the default. `GET
      /players` and `/players/{id}/family` are correct because they go through
      `player_to_dict_with_relations`. Fix: route those three through the same
      serializer, or give the ORM model a `parent_ids` property.

- [ ] **No unique constraint on `rounds(game_id, round_number, player_id)`.**
      `round_service.upsert_round` does read-then-write with nothing behind it,
      so two people editing the game matrix at once can insert duplicate rows
      and silently double-count a score. Add the constraint, then let the upsert
      rely on it.

- [ ] **Deleting a player with game history returns a 500.** `rounds.player_id`
      is `NOT NULL`, so SQLAlchemy's default null-out on delete raises an
      IntegrityError. Should be a 409 with a message that says what is actually
      wrong. The frontend currently guesses ("They may have game history") on
      any error.

- [ ] **A parent cycle crashes the family tree.** The API accepts A as parent of
      B and B as parent of A; `familyTree.js convertToD3TreeFormat` then
      recurses forever and the page goes white. The frontend only blocks a
      player being their own parent. Reject cycles server-side, and add a
      visited set in the converter. Related: a child with two parents is pushed
      into both parents' `children`, so that subtree renders twice.

- [ ] **CORS wildcard with credentials.** `allow_origins=["*"]` together with
      `allow_credentials=True` is invalid per the CORS spec and browsers reject
      the combination. Harmless while nothing sends cookies; a trap the moment
      something does.

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

- [ ] Verify independent mode works (LAN access without the self-hosting
      framework web network override), i.e. `docker compose up -d` in
      `services/parvis/` with only the base `docker-compose.yaml`. Should be
      reachable directly on its own port from the LAN.

## Notes for whoever deploys this

- The **backend hot-reloads**: `./backend` is bind-mounted and uvicorn runs with
  `--reload`, so copying a file in is enough.
- The **frontend does not**, despite `command: npm start` in the base compose.
  `overrides/parvis.override.yaml` replaces it with
  `npm run build && npx serve -s build`, so a source change needs
  `docker compose restart frontend` (a rebuild against the bind-mounted `src`,
  a few minutes, no image rebuild).
- **New environment variables need `docker compose up -d backend`**, not
  `restart` — a reload does not pick them up.
