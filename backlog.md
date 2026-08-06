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

      **Run at last** *(2026-08-06)*, on the deploy box, where the containers
      have what the authoring container lacks: 219 backend tests and 129
      frontend tests across 9 suites, all passing. Writing tests you cannot run
      is writing tests you have to trust, and one of them was wrong — see the
      note under the eviction entry.

- [x] **No migration tool.** *(added 2026-08-04)* Alembic owns the schema:
      `backend/alembic.ini`, `backend/migrations/`, baseline `0001_baseline`.
      `init_db()` runs `alembic upgrade head` on startup and adopts a
      pre-Alembic database once — create_all, the two legacy fix-ups, then
      stamp — after which `create_all` never runs again. See the README's
      "Schema changes".

      **Executed on the live database 2026-08-06**, after a `pg_dump` taken
      first. The adoption had in fact already happened on an earlier restart —
      the database was found stamped `0002_game_player_seat` with all seven
      tables in place, so the step that had never been run had quietly run
      itself the last time the backend came up. Only `0003` was outstanding, and
      it adds one nullable column. The warning above is left here rather than
      deleted because it was the right warning to have written.

## Follow-ups from recent changes

- [ ] **Backfill four legacy emails.** Players registered before email was
      required show `MISSING` in the registry; editing any of them forces an
      email, so the fix is one pass through EDIT.

- [ ] **Wire the photograph up to the importer.** *(added 2026-08-06)* Chris's,
      and deliberately later. Everything downstream of the transcription is
      done: `backend/transcription_prompt.md` is the instruction to hand a
      model, `POST /games/import` takes what it produces, and a file whose
      arithmetic does not hold arrives on screen with its doubts attached
      rather than being refused. What is missing is the part in between —
      something that takes a photo of the sheet, runs the prompt against it,
      and posts the result.

      Worth deciding before building it: whether that runs on the phone that
      took the photo or on the server, and whether the frontend grows an upload
      button or the whole thing stays a POST. The importer does not care, which
      is the point of having drawn the line where it is drawn.

- [x] **Import and export a game as a CSV.** *(added 2026-08-05)* For nights
      played on paper. `POST /games/import` takes the file as the request body,
      `GET /games/{id}/export.csv` writes the same format back, and what one
      writes the other reads. There is no upload button yet — the import is a
      POST — but an imported game does have a frontend now, since the warnings
      have to reach whoever can answer them.

      The format is a row per round and a column per player, which is the shape
      of the paper — a transcription is a copy rather than a translation. It
      took two passes to get the square right. The first draft came from a
      machine-vision prompt and used two columns per player (`Name_bets`,
      `Name_mask`); that was halved to one, because every extra column is
      another chance for a row to shift by one and a shifted row is a valid
      file describing the wrong game. Then Chris pointed out that the paper
      needs no mask at all: a made bid gets a 1 written in front of it, so the
      square already holds the score, and a struck bid keeps its own number. So
      a square is transcribed as it stands — `15` is a made bid of five, `5-` a
      struck one, `10` a made bid of nothing — and nobody has to decide what a
      mark meant. The old paired layout is still read on the way in so existing
      transcriptions keep working; it is never written.

      **Empty is not zero.** Zero is a real bid worth ten if it holds; empty is
      a round nobody filled in. The first draft wrote both as `0`, which made a
      half-finished sheet unimportable and an unreadable row indistinguishable
      from four players all bidding nothing.

      Made squares hold `10..10+N` and struck ones hold `0..N`, so from round
      ten the two overlap — in a ten-round game exactly one value, a bare `10`,
      which is a made bid of nothing or a struck bid of ten. Read as made,
      since bidding everything is rare, and the totals row settles it: a column
      that adds up is a column that was read right.

      Three checks run that the transcriber cannot run on itself: a square's
      number and its strike must agree, the made bids in round N cannot exceed
      the N tricks it deals, and the totals row must match the rounds. When a
      column is out, the round whose square would account for the difference is
      named. All of it matters because the sample transcription that prompted
      this **passed its own totals check and was still impossible** — rounds 5
      and 10 awarded more tricks than were dealt.

      Refusing those files was the first answer and the wrong one. None of the
      three can be settled without looking at the paper, so a refusal leaves the
      person holding the paper with nothing on screen to correct. A file that
      reads is now imported with its doubts stored on the game
      (`games.import_warnings`, migration 0003) and shown in a banner over the
      matrix; **CHECKED AGAINST THE PAPER** clears it through
      `POST /games/{id}/acknowledge-import`. A file that cannot be *read* is
      still refused — there is nothing to load. `?strict=true` brings the old
      behaviour back for a caller that would rather fix the file, and
      `?dry_run=true` looks without writing.

      `backend/transcription_prompt.md` is the instruction for whatever model
      does the transcribing, written for an agent with no context. It describes
      a grid of numbers and states the four checks as arithmetic, never
      mentioning cards — Chris's call, and the right one: a transcriber that
      knows the game is a transcriber that will help the numbers along. Its
      standing order is to copy digits and report what does not add up, never
      to repair it.

      Aliases are matched against the roster and players are never created: a
      player invented from a misread name is permanent, silent, and reaches the
      hall of fame. Imported games arrive unfinished whatever the file says, so
      a human presses FINISH after comparing it with the paper.

- [x] **Write the actual rules on the About page.** *(added 2026-08-05)* How to
      Play was three sentences about scoring and nothing about the game: no
      deal, no bidding, no following suit, no idea that round N has N tricks in
      it. Somebody arriving at the site could not have played from it.

      It now covers the deal growing a card a round, bidding 0 to N after
      looking at your hand, the highest bidder leading and ties going to the
      player nearest the priority mark counting rightwards, following suit,
      only the led suit winning, ace high and 2 low, and exact-or-nothing
      scoring — plus a four-line short version at the end. It also explains why
      a made bid gets a 1 written in front of it on paper, which is the same
      fact the CSV format is built on.

- [x] **No logout.** *(fixed 2026-08-05)* The site password was kept in local
      storage with no way to clear it from the UI; it only cleared on a 401.
      There is now a LOG OUT button in the nav, shown only to a browser that is
      actually holding a password — on an open site there is nothing to log out
      of, and a button saying otherwise would advertise a lock that is not
      there.

      It clears and reloads rather than raising the login screen directly, so
      the server gets to answer whether a password is needed at all: with one
      configured the first request 401s and the gate comes up by itself, and if
      the passwords have since been blanked the site simply opens. Going
      straight to the gate would strand whoever logged out of a site that no
      longer locks.

- [x] **ABOUT listed its own features.** *(removed 2026-08-05)* A bullet list of
      what the app does, and a paragraph about why it was built, on a page read
      by the six people who play the game. Gone; ABOUT is the rules now.

- [x] **Columns resized while bets were being typed.** *(fixed 2026-08-05)* The
      table sized itself by its contents, so a cell going from `-` to `10`
      widened its column and shunted every other one along — on each bet, under
      the cursor. The matrix is now `table-layout: fixed` with a `colgroup`:
      the round column has a width, the player columns split what is left
      equally, and nothing in a cell can change either. `min-width` on the table
      is the floor past which the wrapper scrolls sideways instead of squeezing.

- [x] **The game matrix could not be filled in from the keyboard.**
      *(added 2026-08-05)* Every bet was a click and then a keystroke, which is
      the wrong shape for the one job done while everybody sits waiting. It now
      behaves like a spreadsheet: arrows move, Tab and Enter carry on to the
      next player and wrap to the next round, typing a digit opens the editor on
      that digit, Escape abandons. In MARK RESULTS, Enter and Space flip the
      cell rather than editing it — the two modes are different jobs.

      Enter goes **right**, not down: bidding goes round the table in seat
      order, and the columns are the seats. Tab at the last cell is left to the
      browser so the grid can always be tabbed out of.

      The movement is `utils/gridNavigation.js`, tested on its own because the
      whole bug surface is the behaviour at an edge, and that is invisible in a
      browser until somebody is mid-game.

- [x] **Evict a player from a game in progress.** *(added 2026-08-05)* Somebody
      could not finish a game and there was no way to say so.

      `DELETE /games/{id}/players/{player_id}` takes them out as though they had
      never been in it: their rounds in that game go with them, and the seats
      close up behind them. The game is then recorded as the one that was
      actually played, by the people who played it through. 🚪 on the column
      header, behind a confirm, and refused if it would leave fewer than two.

      **The closing-up is the point, not tidiness.** Round N belongs to seat
      N % players, so a game that is now four-handed has to be numbered
      four-handed or the priority highlight points at the wrong person for every
      round of it. That includes rounds already entered — which is correct,
      since those rounds were four-handed too.

      An earlier draft of this kept the player with a `withdrawn_after_round`
      column, an empty-seat rendering, a tournament disqualification and a
      migration. Deleting outright is a great deal simpler and it makes the
      rotation right for free. The cost, accepted deliberately: the rounds that
      player did play are gone, so a five-player night is recorded as a
      four-player game.

      **One of its tests was wrong and said so the first time it was run**
      *(2026-08-06)*. `test_nobody_elses_score_is_touched` had a player bidding
      three in round one — a round that deals one card, so the bid is illegal
      and the API rightly refused it, leaving the score it asserted about at
      zero. Written in a container that could not run it, it looked fine for a
      day. The same mistake in the same shape had already been made twice in the
      CSV fixtures: a round is not a free-for-all, and `bid <= round` is a rule
      the tests have to obey too.

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

- [x] Do the final standings need a rounds column? *(decided 2026-08-05: no)*
      Every game in a standings table shares one `total_rounds`, so the column
      would repeat the same number down the page.

- [x] Improve the visual theme. *(closed 2026-08-05)* Too vague to act on. The
      retro CRT theme exists and is coherent; there was no specific complaint
      behind this line. Reopen it with the actual gripe if one turns up.

- [x] **Decide what else belongs in the hall of fame.** *(decided 2026-08-05)*
      One addition: **most tournaments won**. The roll of honour lists the
      years but nothing said who owns the most of them, which is the one
      question a hall of fame ought to answer directly. The other eight records
      already cover scoring, volume, rate and failure, so the list stops there
      rather than growing for its own sake.

      It is counted by ALIAS, not player id, because a seeded year has a name
      and no id — counting by id would split a person's wins across the arrival
      of the app and hide anyone whose wins predate it. Draws break
      alphabetically, purely so the same request gives the same answer twice.

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
- **The database migrates itself on boot.** `init_db()` runs `alembic upgrade
  head`, so a deploy that adds a migration needs no separate command — the
  restart is the migration. Take a backup first anyway; it costs seconds and the
  schema is the only thing here that cannot be re-copied from git.
- **Check `alembic current` before assuming what is pending.** On the
  2026-08-06 deploy the live database turned out to be two migrations further
  along than these notes claimed, having adopted and stamped itself on an
  earlier restart. The notes were stale, not the database. `docker exec
  parvis-db psql -U parvis -d parvis -c "select * from alembic_version;"`
  settles it in one command, and disagrees with a guess more often than not.
