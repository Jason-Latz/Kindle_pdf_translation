.PHONY: help install backend-install frontend-install compose-up compose-build compose-down compose-destroy compose-logs compose-ps migrate bootstrap backend-shell worker-shell lint-frontend test-backend clean

COMPOSE_FILE := infra/docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)
BACKEND_DIR := backend
FRONTEND_DIR := frontend
PYTHON ?= python3
PIP ?= $(PYTHON) -m pip
NPM ?= npm

.DEFAULT_GOAL := help

help: ## Show available make targets
	@echo "Available make targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

install: backend-install frontend-install ## Install backend and frontend dependencies locally

backend-install: ## Install backend Python dependencies into the active environment
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt

frontend-install: ## Install frontend Node dependencies
	cd $(FRONTEND_DIR) && $(NPM) install

compose-up: ## Build and start the full stack in the background
	$(COMPOSE) up --build -d

compose-build: ## Build or rebuild Docker images without starting containers
	$(COMPOSE) build

compose-down: ## Stop containers and remove network but keep data volumes
	$(COMPOSE) down

compose-destroy: ## Stop containers and remove volumes (⚠️ removes data)
	$(COMPOSE) down --volumes --remove-orphans

compose-logs: ## Tail logs from all services
	$(COMPOSE) logs -f

compose-ps: ## Display service status for the stack
	$(COMPOSE) ps

migrate: ## Run Alembic migrations inside a one-off backend container
	$(COMPOSE) run --rm backend alembic upgrade head

bootstrap: compose-up migrate ## Bring up services and run migrations

backend-shell: ## Open an interactive shell inside the running backend container
	$(COMPOSE) exec backend bash

worker-shell: ## Open an interactive shell inside the running worker container
	$(COMPOSE) exec worker bash

lint-frontend: ## Run Next.js linting
	cd $(FRONTEND_DIR) && $(NPM) run lint

test-backend: ## Run backend pytest suite
	cd $(BACKEND_DIR) && pytest

clean: ## Remove Python cache artifacts from the backend
	find $(BACKEND_DIR) -type d -name "__pycache__" -exec rm -rf {} +
	find $(BACKEND_DIR) -type f -name "*.py[co]" -delete
