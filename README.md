# Parvis - Betting Game Tracker

A retro-styled web application for tracking Parvis betting games with live statistics, score progression, and player management.

## Features

### 🎮 Game Play
- Start new games with multiple players
- Choose the order of play: reorder the list when setting a game up, and drag
  the matrix columns (or use the ◀ ▶ arrows) to change it during one
- Track bets and results round-by-round
- Live score progression with animated line chart
- Real-time leaderboard updates
- Automatic score calculation (10 + bet for successful bets)

### 📊 Statistics
- Comprehensive player statistics
- Win rate tracking
- Bet distribution histogram
- Average bet analysis
- Performance breakdown tables

### 👥 Player Management
- Register new players
- Browse all players
- Delete players (with game history protection)
- Track registration dates and player info

## Quick Start

### 1. Prerequisites
- Docker and Docker Compose
- (Optional) Cloudflare Tunnel for external access

### 2. Setup

```bash
# Copy environment template
cp env_template .env

# Edit configuration
nano .env  # Set secure passwords and domain

# Start services
docker compose up -d

# Check logs
docker compose logs -f
```

### 3. Access

**Local:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

**External (with Cloudflare):**
- https://parvis.yourdomain.com

## Access control

Two optional passwords, both set in the environment file:

| Variable | Guards | Prompted |
|---|---|---|
| `PARVIS_PASSWORD` | every API request | once per browser, stored locally |
| `PARVIS_ADMIN_PASSWORD` | deleting players and games | each deletion, never stored |

Leave both blank and the site is open and never prompts, exactly as it behaved
before passwords existed — which is also how you retire this in favour of
Cloudflare Access.

The site password is remembered in the browser's local storage. A LOG OUT
button in the nav forgets it, and appears only in a browser that is holding
one, so an open site shows no such button. Logging out reloads rather than
jumping to the login screen, which means blanking `PARVIS_PASSWORD` genuinely
reopens the site instead of leaving people at a prompt nothing will satisfy.

Setting only `PARVIS_ADMIN_PASSWORD` is a useful middle ground: the site stays
open, but nothing can be deleted without the second password. The admin
password is accepted anywhere the site password is.

Enforcement is in the API (`backend/auth.py`), not the UI, because anything on
the LAN can reach the API directly. `/health` stays open so the container
healthcheck keeps working. Passwords are compared in constant time, but they
travel as plain headers — fine behind HTTPS, so don't expose the API over plain
HTTP.

## Architecture

```
parvis/
├── backend/          # FastAPI backend
│   ├── main.py       # API endpoints
│   ├── database.py   # SQLAlchemy models
│   ├── models.py     # Pydantic schemas
│   └── Dockerfile
├── frontend/         # React frontend
│   ├── src/
│   │   ├── pages/    # GamePlay, Stats, Players
│   │   ├── api.js    # API client
│   │   └── App.jsx
│   └── Dockerfile
└── docker-compose.yaml
```

## Game Rules

### Parvis Betting Game

1. Each round, players make a bet (any positive number)
2. Players mark their bet as successful or failed. A round opens with everyone
   assumed to have made it, so marking results means double-clicking whoever
   went down — the shorter list. The consequence is that an unmarked round
   already counts as won, so the running total mid-round reads "what everyone
   gets if they all make it". Set `game.default_success: false` in
   `settings.yaml` to start rounds as failed instead.
3. Scoring:
   - **Successful bet**: 10 + bet amount
   - **Failed bet**: 0 points
4. Winner is determined by total score after all rounds

### Example

```
Round 1:
- Alice bets 5, succeeds → 15 points
- Bob bets 8, fails → 0 points

Round 2:
- Alice bets 3, succeeds → 13 points (total: 28)
- Bob bets 10, succeeds → 20 points (total: 20)

Alice wins!
```

## Dates

Shown as `DD/MM/YYYY` on a 24-hour clock, everywhere, for everyone. The format
is fixed in `frontend/src/utils/datetime.js` rather than taken from the
browser, because a browser-formatted date reads as 08/04/2026 on one phone and
04/08/2026 on the next and neither says which it is.

That is also why the date fields are `react-datepicker` and not
`<input type="datetime-local">`: the native control is drawn by the browser in
the browser's own locale, and nothing in the page — `lang`, CSS, an attribute —
can change it. Same reason the time is picked from a list rather than with
`showTimeInput`, which is an `<input type="time">` and brings back AM/PM.

Storage is unaffected by any of this and needs no migration to change how a date
looks. Instants (`games.date`, `players.last_game_date`) are `DateTime` holding
naive UTC — see `backend/clock.py`. Days (`players.birthdate`,
`registration_date`) are `Date`, a calendar day with no zone, which is what a
birthday is.

The one place that distinction bites is converting between them. A picker hands
back local midnight, and `toISOString()` on that is the previous day anywhere
east of Greenwich — Norway included — so a day-valued field goes through
`toDateOnly()`, which reads the local calendar parts. Reading one back uses
`parseDate()` for the mirror-image reason: a bare `"1990-05-12"` parses as UTC
midnight, which is the 11th to anyone west of Greenwich. The frontend tests are
pinned to `TZ=Europe/Oslo` by `frontend/jest.globalSetup.js` because at UTC+0
neither mistake is visible — a suite running at UTC would pass either way. The
pin is asserted by a test of its own, so losing it fails the build rather than
quietly making the rest of the date tests meaningless.

## Database Schema

### Players
- `id`: Primary key
- `alias`: Unique player nickname
- `email`: Required for new players, nullable for ones registered before it was
- `first_name`, `middle_name`, `last_name`: Optional full name
- `birthdate`: Optional date of birth
- `registration_date`: Auto-generated

### Relationships
The UI offers three — parent, child, partner — stored in two tables, because
"X is my child" and "I am X's parent" are one fact.

- `player_parents(player_id, parent_id)`: one row means `player_id` has
  `parent_id` as a parent. `child_ids` is this table read backwards.
- `player_partners(player_a_id, player_b_id)`: symmetric, so stored once with
  the lower id first and a CHECK to enforce it. Writes go through
  `PlayerService`; the ORM relationships are `viewonly` so nothing can bypass
  the ordering.

### Games
- `id`: Primary key
- `game_type`: `standard` or `tournament`. The winner of the last tournament of
  a year takes that year's place in the hall of fame.
- `date`: When the game was played. Defaults to now, settable at creation and
  editable afterwards — the tournament year is read off it.
- `total_rounds`: Number of rounds
- `current_round`: Current round number
- `is_active`: Whether game is in progress

### Game players
- `game_id`, `player_id`: who is playing what, together the primary key
- `seat`: where they sit, counting from zero. This is game state rather than a
  display preference — the matrix marks round N as belonging to seat
  N % players, so the seating is what says who bids first. It is set from the
  order players were picked in, and changed with `PUT /games/{id}/player-order`.

### Rounds
- `id`: Primary key
- `game_id`: Foreign key to Games
- `round_number`: Round number in game
- `player_id`: Foreign key to Players
- `bet`: Amount bet
- `success`: Whether bet was successful
- `score`: Calculated score (10 + bet if success)

## API Endpoints

### Players
- `GET /players` - List all players
- `POST /players` - Create new player
- `GET /players/{id}` - Get player details
- `DELETE /players/{id}` - Delete player
- `GET /players/{id}/stats` - Player statistics
- `GET /players/{id}/bet-distribution` - Bet histogram

### Games
- `GET /games` - List games (optional: ?active_only=true)
- `POST /games` - Create new game
- `GET /games/{id}` - Get game details
- `POST /games/{id}/finish` - Finish game
- `GET /games/{id}/rounds` - Get all rounds
- `POST /games/{id}/rounds` - Add new round
- `PUT /games/{id}/metadata` - Correct notes, location, type or date
- `PUT /games/{id}/player-order` - Reseat the players. The body is
  `{"player_ids": [...]}` and must list exactly this game's roster, in order;
  a partial list is refused because the seats it omits would have no home.
- `GET /games/{id}/stats` - Game statistics, in seat order

### Hall of fame
- `GET /hall-of-fame` - Yearly tournament winners, all-time records, album link

## Environment Variables

### Backend
- `DATABASE_URL`: PostgreSQL connection string
- `CORS_ORIGINS`: Allowed frontend origins
- `HALL_OF_FAME_ALBUM_URL`: Photo album linked from the hall of fame (optional;
  has a working default)
- `HALL_OF_FAME_SEED`: JSON list of tournaments played before this app existed,
  which cannot be computed from the games. Defaults to
  `backend/hall_of_fame.json`; see `backend/hall_of_fame.example.json`. Seeded
  years are marked historical and are superseded once a real tournament is
  recorded for that year.

### Frontend
- `REACT_APP_API_URL`: Backend API URL

### Database
- `POSTGRES_DB`: Database name
- `POSTGRES_USER`: Database user
- `POSTGRES_PASSWORD`: Database password

## Schema changes

The schema is owned by Alembic (`backend/migrations`). The app runs
`alembic upgrade head` on startup, so a deploy applies its own migrations.

A database created before Alembic existed is adopted automatically the first
time it boots: `init_db()` sees no `alembic_version` table, creates whatever the
models declare, runs the two legacy idempotent fix-ups, and stamps the baseline.
That path runs once. After it, `create_all` never runs again — which is the
point, since it would otherwise create the very table a pending migration is
about to create.

```bash
# After changing a model — writes a revision by diffing models against the DB
docker compose exec backend alembic revision --autogenerate -m "add x to y"

# Review the generated file, then apply (a restart does this too)
docker compose exec backend alembic upgrade head

# Where are we
docker compose exec backend alembic current
```

Always read the generated revision before applying it. Autogenerate is good at
tables and columns and bad at renames — it sees a drop and an add.

## Development

### Backend Development

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run the tests
pytest -q

# Run with hot reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run the tests (pinned to TZ=Europe/Oslo however they are started — see Dates)
CI=true npm test

# Run development server
npm start
```

## Backup

### Database Backup

```bash
# Backup
docker compose exec db pg_dump -U parvis parvis > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20250101.sql | docker compose exec -T db psql -U parvis parvis
```

### Full Backup

```bash
# Backup volumes
docker run --rm \
  -v parvis_db:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/parvis_$(date +%Y%m%d).tar.gz -C /data .
```

## Troubleshooting

### Frontend can't connect to backend
- Check `REACT_APP_API_URL` in frontend .env
- Verify CORS settings in backend
- Check backend is running: `docker compose logs backend`

### Database connection errors
- Verify `DATABASE_URL` in backend environment
- Check database is healthy: `docker compose ps`
- View database logs: `docker compose logs db`

### Port conflicts
- Change ports in docker-compose.yaml
- Update `LOCAL_IP` in .env for custom binding

## Retro UI Theme

The application features a retro CRT terminal aesthetic:
- Monospace font (Courier New)
- Green phosphor color scheme
- Scanline effects
- Flicker animation
- Glowing text shadows
- Classic button styling

## License

MIT License - See LICENSE file

## Credits

Original concept from the Python-based Parvis game tracker. Modernized with Docker, React, and FastAPI for web-based gameplay.
