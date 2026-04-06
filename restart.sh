#!/bin/bash

echo "Stopping any running services..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:8081 | xargs kill -9 2>/dev/null

echo "Starting Float services..."

# Terminal 1 — API
osascript -e 'tell application "Terminal" to do script "conda activate float && cd ~/Documents/Float\\ Project/float/backend && uvicorn app.main:app --reload --host 0.0.0.0"'

# Terminal 2 — Web
osascript -e 'tell application "Terminal" to do script "cd ~/Documents/Float\\ Project/float/apps/web && npm run dev"'

# Terminal 3 — Mobile (optional, comment out if not needed)
# osascript -e 'tell application "Terminal" to do script "cd ~/Documents/Float\\ Project/float/apps/mobile && npx expo start --tunnel"'

echo "Done — API on :8000, Web on :5173"
