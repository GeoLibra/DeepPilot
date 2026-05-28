.PHONY: help install install-frontend install-backend dev-frontend dev-backend dev

help:
	@echo "Available commands:"
	@echo "  make install         - Installs frontend and backend dependencies"
	@echo "  make install-frontend - Installs frontend dependencies"
	@echo "  make install-backend - Installs backend dependencies into the uv virtual environment"
	@echo "  make dev-frontend    - Starts the frontend development server (Vite)"
	@echo "  make dev-backend     - Starts the backend development server (Uvicorn with reload)"
	@echo "  make dev             - Starts both frontend and backend development servers"

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

dev-frontend:
	@echo "Starting frontend development server..."
	@cd frontend && npm run dev

dev-backend:
	@echo "Starting backend development server..."
	@cd backend && uv run --group dev --with-editable . langgraph dev --port 2026

# Run frontend and backend concurrently
dev:
	@echo "Starting both frontend and backend development servers..."
	@$(MAKE) dev-frontend & $(MAKE) dev-backend
