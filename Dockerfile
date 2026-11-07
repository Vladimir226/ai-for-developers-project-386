# syntax=docker/dockerfile:1
# Единственный Docker-образ «Запись на звонок» (ADR-007):
# multi-stage, non-root, БД в volume /data, миграции при старте, healthcheck.

# ---------- deps: полный install (dev-зависимости нужны для сборки) ----------
# prisma/ копируется до install: root-postinstall (`prisma generate`)
# требует схему; engine-бинари скачиваются на linux-musl этой стадии.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma ./
RUN npm ci

# ---------- builder: prisma generate + next build (standalone) ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---------- prod-deps: только прод-зависимости ----------
# prisma CLI нужен в рантайме для `migrate deploy` при старте контейнера,
# поэтому prisma/@prisma/client — обычные dependencies.
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json prisma ./
RUN npm ci --omit=dev

# ---------- runner: исполняемый слой ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_TZ=Europe/Moscow \
    DATABASE_URL=file:/data/app.db

# каталог БД под volume /data; создаём и передаём node до dropping привилегий
RUN mkdir -p /data && chown node:node /data

# standalone-выход Next.js: server.js + трассированные зависимости.
# Исходников, тестов и .env здесь нет и не будет (.dockerignore).
# Каталог public/ появится со статикой UI-тикетов — тогда добавить
# COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# прод-зависимости поверх трассированных: prisma CLI + engine-бинари
# для migrate deploy (деревья слияются, версии совпадают — один lock-файл)
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# схема + миграции для migrate deploy
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# непривилегированный пользователь (NFR-007)
USER node

# информативно: 3000 — дефолт (ENV PORT выше); фактический порт задаётся
# переменной PORT (например docker run -e PORT=8080 … -p 8080:8080),
# healthcheck ниже следует за PORT автоматически
EXPOSE 3000
# shell-форма CMD: /bin/sh -c раскрывает ${PORT:-3000} в рантайме контейнера,
# поэтому проба здоровья бьёт в тот же порт, на котором слушает сервер,
# а не в захардкоженный 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (${PORT:-3000}) + '/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
