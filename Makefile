.PHONY: up down build logs test test-unit lint type-check migrate migrate-create seed-dev deploy-staging install update restart

# ── Dev stack ──────────────────────────────────────────────────────────────────

up:
	docker compose -f docker-compose.dev.yml up -d

down:
	docker compose -f docker-compose.dev.yml down

build:
	docker compose -f docker-compose.dev.yml build api worker frontend

logs:
	docker compose -f docker-compose.dev.yml logs -f api worker

restart-api:
	docker compose -f docker-compose.dev.yml restart api worker

# ── Testing ────────────────────────────────────────────────────────────────────

test:
	docker compose -f docker-compose.dev.yml exec api pytest app -v

test-unit:
	docker compose -f docker-compose.dev.yml exec api pytest app -m unit -v

test-frontend:
	docker compose -f docker-compose.dev.yml exec frontend pnpm test

# ── Linting ────────────────────────────────────────────────────────────────────

lint:
	docker compose -f docker-compose.dev.yml exec api ruff check app
	docker compose -f docker-compose.dev.yml exec frontend pnpm lint

type-check:
	docker compose -f docker-compose.dev.yml exec api mypy app --strict
	docker compose -f docker-compose.dev.yml exec frontend pnpm type-check

# ── Database ───────────────────────────────────────────────────────────────────

migrate:
	docker compose -f docker-compose.dev.yml exec api alembic upgrade head

migrate-create:
	docker compose -f docker-compose.dev.yml exec api alembic revision --autogenerate -m "$(msg)"

seed-dev:
	docker compose -f docker-compose.dev.yml exec api python -m app.seed

# ── Deploy ─────────────────────────────────────────────────────────────────────

install:
	@bash deploy.sh

update:
	@bash deploy.sh --update

restart:
	@bash deploy.sh --restart

# ── First-time setup (legacy) ───────────────────────────────────────────────────

setup: up
	@echo "Waiting for services to be ready..."
	@sleep 8
	@$(MAKE) migrate
	@echo ""
	@echo "✓ OSINT//DESK ready"
	@echo "  API:      http://localhost:8000/docs"
	@echo "  Frontend: http://localhost:3000"
