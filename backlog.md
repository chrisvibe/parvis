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
      renders. The remaining half — a child with two parents drawn under both —
      is fixed below.

- [x] **A child with two parents was drawn twice.** *(fixed 2026-08-04)* A tree
      gives every node one parent; a family gives a child two. The old renderer
      drew the child once under each, the same person in two places with nothing
      to say it was the same person.

      The unit of layout is now a **union** — the set of people who are parents
      together — rather than a person. The layout-parent of a person is the
      union of their parents, and every person has exactly one of those, so the
      graph is a tree by construction rather than by hoping the data stays
      simple. Unions come from declared partnerships and from shared
      parenthood, the latter drawn with a dashed bar so the tree does not assert
      a relationship nobody entered — which is what makes the existing data
      render correctly before a single partnership has been typed in.

      One case genuinely cannot be drawn: a couple hangs in one place, but both
      halves have parents, and remarriage puts a person in two unions. The
      appearance that is not chosen is a dashed **ghost** clicking through to
      the same player. Every genealogy tool makes this trade.

      A ring in stored data is promoted to a root rather than dropped, so one
      bad pair of edges cannot blank the whole page. `utils/familyTree.js`,
      `components/FamilyTreeSelector.jsx`, 19 tests.

- [x] **CORS wildcard with credentials.** *(fixed 2026-08-03)* An "*"
      origin together with `allow_credentials=True` is invalid per the CORS
      spec and browsers reject the pair, so the permissive setting bought
      nothing. `allow_credentials` is now False, which is what the app
      actually needs: the site and admin passwords travel as request headers,
      not cookies, and headers are unaffected by the flag. If cookie or Basic
      auth ever arrives, this must become an explicit origin list rather than
      being switched back on.

## Cleanups

- [x] **Deprecations.** *(fixed 2026-08-04)* `@app.on_event("startup")` is now a
      lifespan handler. `datetime.utcnow()` is gone: `backend/clock.py` has
      `now()` (aware) and `naive_utc_now()` for the columns that are still
      `DateTime` without a timezone, so the choice is made once and named.
      Pydantic's deprecated `.dict()` went at the same time.

- [x] **Duplicated chart maths.** *(fixed 2026-08-04)* One
      `utils/chartData.js`, used by `useChartData` and by the historical viewer.

- [x] **Duplicated multi-select UI.** *(fixed 2026-08-04)* One
      `components/MultiSelect.jsx`. `Players.jsx` wraps it in
      `RelationshipPicker`, which adds the parent/child/partner choice.

- [x] **`Stats.jsx` is 717 lines.** *(fixed 2026-08-04)* Now 63: two hooks
      (`usePlayerStats`, `useGameHistory`) and two components
      (`PlayerStatsPanel`, `GameHistoryViewer`).

- [x] **Inline styles fight `index.css`.** *(fixed 2026-08-04)* The palette is
      CSS custom properties installed by `utils/theme.js` before first paint;
      `settings.yaml`'s `colors` and `matrix` blocks feed it, so they finally
      do something. JavaScript that genuinely needs a colour (recharts takes
      styling as props) asks `color('--fg')` rather than repeating a hex.

- [x] **Debug logging left in.** *(fixed 2026-08-04)* Gone from `GameMatrix`,
      `useGameState` and the old `Stats.jsx`. `console.error` in a catch stays —
      that is a report, not a trace.

- [x] **`settings.js` race.** *(fixed 2026-08-04)* Settings are awaited before
      the app renders, and the defaults live in one place.

- [x] **No tests for services or endpoints.** *(added 2026-08-04)*
      `conftest.py` (in-memory SQLite on the real schema, plus a `TestClient`
      with `get_db` overridden), `test_relationships.py`, `test_hall_of_fame.py`
      and `test_api.py`. Frontend: `familyTree`, `datetime`, `chartData`,
      `playerStats` and `theme`.

      **Unrun.** The container this was written in has no `python3` and no
      `frontend/node_modules`, so neither suite has been executed. First job on
      a machine that can: `docker compose exec backend pytest -q` and
      `CI=true npm test`.

- [x] **No migration tool.** *(added 2026-08-04)* Alembic owns the schema:
      `backend/alembic.ini`, `backend/migrations/`, baseline `0001_baseline`.
      `init_db()` runs `alembic upgrade head` on startup and adopts a
      pre-Alembic database once — create_all, the two legacy fix-ups, then
      stamp — after which `create_all` never runs again. See the README's
      "Schema changes".

      **Verify against a restored dump before this reaches the live database.**
      The adoption path has not been executed anywhere.

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

- [x] **Add a hall of fame.** *(added 2026-08-04)* A panel beside ABOUT.
      Yearly tournament winners at the top, ten years visible and the rest on
      scroll; then the records; then the album link.

      Tournaments needed a concept to exist first: `game_type` is now
      `standard` or `tournament`, chosen at creation, with a date that defaults
      to now and is editable afterwards — the tournament year is read off it,
      so a game entered the morning after still counts for the night it was
      played. The last tournament of a year decides that year, which is how a
      replayed final should read. Years from before the app existed cannot be
      computed from anything, so they come from a JSON seed file and are marked
      historical; a real result for that year supersedes the seed
      automatically.

      Records shipped: highest successful bet, highest and lowest score in a
      game, most matches, best win rate (floor of 3 games), longest streak,
      boldest player by average bet (floor of 10 rounds), and the wooden spoon.
      Deliberately a small fixed list — adding one is a few lines in
      `hall_of_fame_service.py` and nothing anywhere else. Expect to change it
      once people have opinions.

- [x] **Add historical pictures to immich, and link the immich albums from
      here.** *(linked 2026-08-04)* The album is linked from the hall of fame;
      `HALL_OF_FAME_ALBUM_URL` moves it without a deploy. Filling the album is
      not a code task.

- [x] **Choose the order of play.** *(added 2026-08-04)* Drag the matrix
      columns, or use the ◀ ▶ arrows on each header; the setup screen orders
      the selection with ▲ ▼ before the game starts.

      This turned out not to be a display preference. The matrix marks round N
      as belonging to column N % players — that highlight is who bids first —
      so the order is game state and belongs in the database. It was not stored
      at all: `game_players` had no ordering column, so the columns appeared in
      whatever order Postgres returned and nobody had ever chosen it. There is
      now a `seat`, set from the order players were picked in.

      Arrows as well as dragging because HTML5 drag events do not fire on a
      touchscreen at all, and this gets used on phones at the table.

      Note for whoever changes this next: the rotation is derived from the
      column index rather than stored per round, so reseating mid-game also
      moves the highlight on rounds already played. Scores are recorded per
      player and are unaffected. Storing a first-bidder per round would fix the
      cosmetic part; nobody has asked.

- [ ] Do the final standings need a rounds column?
- [ ] Improve the visual theme.
- [ ] **Decide what else belongs in the hall of fame.** The record list is a
      starting point, chosen to have something to react to. Cheapest possible
      change; wait for suggestions.

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
- **New Python dependencies need a rebuild.** `requirements.txt` is installed at
  image build time, so a bind-mounted source change is not enough:
  `docker compose up -d --build backend`. The 2026-08-04 work added `alembic`
  and `httpx`, so that deploy is a rebuild, not a reload.
- **The first boot after that deploy migrates the database.** It creates
  `player_partners`, stamps `0001_baseline`, and from then on `alembic upgrade
  head` is what changes the schema. Take a backup first and watch the backend
  log — this path has never been executed anywhere.
