.PHONY: up down build logs test test-unit lint type-check migrate migrate-create seed-dev install update restart ssl

DEV  = docker compose -f docker-compose.dev.yml
PROD = docker compose -f docker-compose.yml

# ── Dev stack ──────────────────────────────────────────────────────────────────

up:
	$(DEV) up -d

down:
	$(DEV) down

build:
	$(DEV) build api worker frontend

logs:
	$(DEV) logs -f api worker

restart-api:
	$(DEV) restart api worker

# ── Testing ────────────────────────────────────────────────────────────────────

test:
	$(DEV) exec api pytest app -v

test-unit:
	$(DEV) exec api pytest app -m unit -v

test-frontend:
	$(DEV) exec frontend pnpm test

# ── Linting ────────────────────────────────────────────────────────────────────

lint:
	$(DEV) exec api ruff check app
	$(DEV) exec frontend pnpm lint

type-check:
	$(DEV) exec api mypy app --strict
	$(DEV) exec frontend pnpm type-check

# ── Database (dev) ─────────────────────────────────────────────────────────────

migrate:
	$(DEV) exec api alembic upgrade head

migrate-create:
	$(DEV) exec api alembic revision --autogenerate -m "$(msg)"

seed-dev:
	$(DEV) exec api python -m app.seed

# ── Production deploy ──────────────────────────────────────────────────────────

install:
	@bash deploy.sh

update:
	@bash deploy.sh --update

restart:
	@bash deploy.sh --restart

ssl:
	@bash deploy.sh --ssl

prod-logs:
	$(PROD) logs -f api worker beat

prod-status:
	$(PROD) ps

prod-migrate:
	docker exec osint-api alembic -c /app/alembic.ini upgrade head
