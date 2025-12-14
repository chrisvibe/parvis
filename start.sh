#!/bin/bash
# Quick start script for Parvis

set -e

echo "🎮 PARVIS - Quick Start"
echo "======================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from template..."
    cp env_template .env
    echo "⚠️  IMPORTANT: Edit .env and set a secure POSTGRES_PASSWORD!"
    echo ""
    read -p "Press Enter to continue after editing .env, or Ctrl+C to exit..."
fi

# Start services
echo "Starting services..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo ""
echo "Checking service status..."
docker compose ps

echo ""
echo "✅ Parvis is starting!"
echo ""
echo "Access points:"
echo "  - Frontend: http://localhost:3000"
echo "  - Backend:  http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
echo ""
echo "View logs:"
echo "  docker compose logs -f"
echo ""
echo "Stop services:"
echo "  docker compose down"
echo ""
echo "🎲 Have fun playing Parvis!"
