# Makefile — единая точка входа; делегирует в npm-скрипты (ADR-007).
# CI (.github/workflows/check.yml) вызывает make check — ту же команду, что и локально.
# .github/workflows/hexlet-check.yml — автогенерированный Хекслетом, не трогаем.

install:
	npm install

test:
	npm test

lint:
	npm run lint

check:
	npm run check

.PHONY: install test lint check
