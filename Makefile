.PHONY: setup-frontend setup-backend run-frontend run-backend run check-backend

setup-frontend:
	cd frontend && npm install

setup-backend:
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

run-frontend:
	cd frontend && npm start

run-backend:
	cd backend && . .venv/bin/activate && python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload

run:
	@echo "Use two terminals:"
	@echo "  make run-backend"
	@echo "  make run-frontend"

check-backend:
	cd backend && python -m py_compile server.py
