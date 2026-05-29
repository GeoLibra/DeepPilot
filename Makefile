.PHONY: help install install-frontend install-backend docker-check docker-build docker-prune-build-cache db-pull db-up db-down db-reset db-ui dev-frontend dev-backend dev-backend-server dev-backend-container dev-backend-restart dev-backend-file dev-backend-local dev-local dev-db dev-container dev

LOCAL_DATABASE_URI ?= postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable
LOCAL_REDIS_URI ?= redis://127.0.0.1:6379

help:
	@echo "Available commands:"
	@echo "  make install         - Installs frontend and backend dependencies"
	@echo "  make install-frontend - Installs frontend dependencies"
	@echo "  make install-backend - Installs backend dependencies into the uv virtual environment"
	@echo "  make docker-check    - Verifies Docker Desktop/daemon is running"
	@echo "  make docker-build    - Builds the LangGraph API image"
	@echo "  make docker-prune-build-cache - Removes Docker build cache, keeps volumes"
	@echo "  make db-pull         - Pulls local database/helper Docker images"
	@echo "  make db-up           - Starts Postgres, Redis, and Adminer"
	@echo "  make db-down         - Stops Postgres, Redis, and Adminer"
	@echo "  make db-reset        - Removes local database volumes"
	@echo "  make db-ui           - Starts Adminer database UI"
	@echo "  make dev-frontend    - Starts the frontend development server (Vite)"
	@echo "  make dev-backend     - Starts DB-backed LangGraph API container with local backend code mounted"
	@echo "  make dev-backend-container - Starts DB-backed LangGraph API container with local backend code mounted"
	@echo "  make dev-backend-restart - Restarts the backend container after local backend code changes"
	@echo "  make dev-backend-file - Starts file-backed local uv LangGraph dev server"
	@echo "  make dev-local       - Starts local frontend plus file-backed local backend"
	@echo "  make dev-db          - Starts local frontend plus DB-backed backend container"
	@echo "  make dev-container   - Alias for make dev-db"
	@echo "  make dev             - Starts local frontend plus DB-backed backend container"

install-frontend:
	@echo "Installing frontend dependencies..."
	@cd frontend && npm install

install-backend:
	@echo "Installing backend dependencies into uv virtual environment..."
	@uv sync --directory backend --group dev --reinstall

install:
	@echo "Installing frontend and backend dependencies..."
	@$(MAKE) install-frontend
	@$(MAKE) install-backend
	@$(MAKE) db-pull

docker-check:
	@docker info >/dev/null 2>&1 || (echo "Docker daemon is not running. Start Docker Desktop, wait until it says Docker is running, then retry. For file-backed backend development without Docker, run: make dev-backend-file" && exit 1)

docker-build: docker-check
	@echo "Building LangGraph API image..."
	@docker compose build langgraph-api

docker-prune-build-cache: docker-check
	@echo "Removing Docker build cache. Volumes are kept."
	@docker builder prune -af

db-pull: docker-check
	@echo "Pulling local database/helper images..."
	@docker compose pull langgraph-postgres langgraph-redis adminer

db-up: docker-check
	@echo "Starting Postgres, Redis, and Adminer..."
	@docker compose up -d langgraph-postgres langgraph-redis adminer

db-down: docker-check
	@echo "Stopping Postgres, Redis, and Adminer..."
	@docker compose stop langgraph-postgres langgraph-redis adminer

db-reset: docker-check
	@echo "Removing local database volumes..."
	@docker compose down -v

db-ui: db-up
	@echo "Adminer is available at http://127.0.0.1:8080"

dev-frontend:
	@echo "Starting frontend development server..."
	@cd frontend && npm run dev

dev-backend: db-up
	@$(MAKE) dev-backend-container

dev-backend-server: dev-backend-file

dev-backend-container: docker-check
	@echo "Starting DB-backed LangGraph API container with local backend code mounted..."
	@docker compose up langgraph-api

dev-backend-restart: docker-check
	@echo "Restarting LangGraph API container to reload bind-mounted backend code..."
	@docker compose restart langgraph-api

dev-backend-file:
	@echo "Starting file-backed local LangGraph development server..."
	@cd backend && uv run --group dev --with-editable . langgraph dev --port 2026

dev-backend-local: dev-backend-file

dev-local:
	@echo "Starting local frontend plus file-backed local backend..."
	@$(MAKE) dev-frontend & $(MAKE) dev-backend-file

dev-db:
	@echo "Starting local frontend plus DB-backed backend container..."
	@$(MAKE) db-up
	@$(MAKE) dev-frontend & $(MAKE) dev-backend-container

dev-container: dev-db

# Run local frontend plus DB-backed backend container by default. Backend source
# and config are bind-mounted into the container for local code iteration.
dev: dev-db
