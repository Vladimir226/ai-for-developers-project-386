#!/usr/bin/env bash
# Drift-check (ADR-010): артефакты src/generated/ обязаны точно
# соответствовать TypeSpec-контракту. Регенерируем и сверяем с индексом git.
set -euo pipefail

npm run --silent contract:gen

# intent-to-add: новые (ещё не tracked) файлы тоже попадают в git diff
git add -N src/generated

if ! git diff --exit-code -- src/generated; then
  echo
  echo "Контракт рассинхронизирован с артефактами src/generated/."
  echo "Запусти: npm run contract:gen — и закоммить изменения."
  exit 1
fi

echo "Контракт и артефакты src/generated/ синхронны."
