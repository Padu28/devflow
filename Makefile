.PHONY: setup dev-backend dev-frontend test lint seed up down

setup:
	cd backend && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
	cd frontend && npm install

seed:
	cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.scripts.seed

dev-backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test:
	cd backend && .venv/bin/pytest
	cd frontend && npm test

lint:
	cd backend && .venv/bin/ruff check . && .venv/bin/mypy app
	cd frontend && npm run lint && npm run typecheck

up:
	docker compose up --build

down:
	docker compose down

