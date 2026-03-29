#!/bin/bash

echo ""
echo "========================================"
echo "  FILE MERGER AGENT - Starting..."
echo "========================================"
echo ""

# ── Check Node.js ──
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please download from: https://nodejs.org"
    exit 1
fi

# ── Setup PostgreSQL Database (first time only) ──
echo "Checking database..."
DB_EXISTS=$(psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='file_merger_db'" 2>/dev/null)
if [ "$DB_EXISTS" != "1" ]; then
    echo "Creating database for first time..."
    psql -U postgres -f backend/init_db.sql
    echo "Database ready!"
else
    echo "Database already exists, skipping..."
fi

# ── Install Backend (first time only) ──
if [ ! -d "backend/node_modules" ]; then
    echo ""
    echo "Installing backend packages (first time only)..."
    cd backend && npm install && cd ..
    echo "Backend packages ready!"
fi

# ── Install Frontend (first time only) ──
if [ ! -d "frontend/node_modules" ]; then
    echo ""
    echo "Installing frontend packages (first time only)..."
    cd frontend && npm install && cd ..
    echo "Frontend packages ready!"
fi

echo ""
echo "Starting Backend on port 5000..."
cd backend && node server.js &
BACKEND_PID=$!
cd ..

sleep 3

echo "Starting Frontend on port 3000..."
cd frontend && npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================"
echo "  App running at: http://localhost:3000"
echo "  Press Ctrl+C to stop everything"
echo "========================================"

# Open browser
sleep 5
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v open &> /dev/null; then
    open http://localhost:3000
fi

# Wait and clean up on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'; exit" INT TERM
wait
