.PHONY: help up down logs sh.backend

COMPOSE_FILE := infra/docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

help:
	@echo "Targets:"
	@echo "  up          Build and start the backend (and MinIO)."
	@echo "  down        Stop running containers."
	@echo "  logs        Tail backend logs."
	@echo "  sh.backend  Open a shell inside the backend container."

up:
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f backend

sh.backend:
	$(COMPOSE) exec backend /bin/sh
