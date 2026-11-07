# Makefile — цели для hexlet-check CI (ADR-007).
# Делегируют в npm-скрипты; workflow .github/workflows/hexlet-check.yml не трогаем.

install:
	npm install

test:
	npm test

lint:
	npm run lint

.PHONY: install test lint
