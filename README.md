# Parvis - Betting Game Tracker

A retro-styled web application for tracking Parvis betting games with live statistics, score progression, and player management.

## Features

### 🎮 Game Play
- Start new games with multiple players
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
2. Players mark their bet as successful or failed
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

## Database Schema

### Players
- `id`: Primary key
- `alias`: Unique player nickname
- `first_name`, `middle_name`, `last_name`: Optional full name
- `birthdate`: Optional date of birth
- `registration_date`: Auto-generated

### Games
- `id`: Primary key
- `game_type`: Type of game (default: "standard")
- `date`: Game creation timestamp
- `total_rounds`: Number of rounds
- `current_round`: Current round number
- `is_active`: Whether game is in progress

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
- `GET /games/{id}/stats` - Game statistics

## Environment Variables

### Backend
- `DATABASE_URL`: PostgreSQL connection string
- `CORS_ORIGINS`: Allowed frontend origins

### Frontend
- `REACT_APP_API_URL`: Backend API URL

### Database
- `POSTGRES_DB`: Database name
- `POSTGRES_USER`: Database user
- `POSTGRES_PASSWORD`: Database password

## Integration with Self-Hosting Infrastructure

### 1. Add to main infrastructure

```bash
# In your self-hosting root
cp parvis/overrides/parvis.override.yaml overrides/
cp parvis/scripts/setup_parvis.sh scripts/
chmod +x scripts/setup_parvis.sh
```

### 2. Run setup

```bash
./scripts/setup_parvis.sh
```

### 3. Configure Cloudflare Tunnel

Add public hostname:
- **Subdomain**: `parvis`
- **Domain**: `yourdomain.com`
- **Service**: `http://parvis:3000`

### 4. Update nginx proxy (optional for local access)

Add to your local nginx configuration:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name parvis.DOMAIN;

    location / {
        set $backend "http://parvis:3000";
        proxy_pass $backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Development

### Backend Development

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run with hot reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

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
