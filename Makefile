.PHONY: help install dev lint test typecheck build verify clean

help:
	@echo "Targets:"
	@echo "  install    Install dependencies with npm ci."
	@echo "  dev        Start the local Next.js server."
	@echo "  lint       Run ESLint."
	@echo "  test       Run Vitest."
	@echo "  typecheck  Run TypeScript without emitting files."
	@echo "  build      Build the production app."
	@echo "  verify     Run the release verification gate."
	@echo "  clean      Remove generated build and test output."

install:
	npm ci

dev:
	npm run dev

lint:
	npm run lint

test:
	npm run test

typecheck:
	npm run typecheck

build:
	npm run build

verify:
	npm run verify

clean:
	rm -rf .next coverage .turbo app/.well-known/workflow
