# Study Helper

A simple full-stack starter for a study app:
- **Frontend:** React + CRACO (`frontend/`)
- **Backend:** FastAPI (`backend/`)

## What I improved
- Added a **run system** with a top-level `Makefile` for common setup/run commands.
- Made backend resilient: if Mongo env vars are missing, it now starts in **in-memory mode** instead of crashing.
- Improved frontend backend connection handling (default backend URL + clear connection status text).
- Added `.env.example` files for backend and frontend.

## Quick start

### 1) Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # optional; only needed for Mongo mode
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 2) Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm start
```

Frontend: http://localhost:3000  
Backend: http://localhost:8000

## Makefile commands
From repo root:
```bash
make setup-backend
make setup-frontend
make run-backend
make run-frontend
```

## Backend storage modes
- **Mongo mode:** when `MONGO_URL` and `DB_NAME` are set.
- **Memory mode:** default fallback if those env vars are missing.

You can inspect mode via:
- `GET /api/` → includes `storage_mode`.

## If installs fail in this environment
This environment may block package downloads with proxy/security policy (`403 Forbidden`).
If that happens, run locally on your machine/network where npm and pip access are allowed.
