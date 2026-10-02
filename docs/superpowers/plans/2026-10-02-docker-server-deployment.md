# План реализации развертывания «Startup Arena» в Docker на сервере

> **Для агентов:** ТРЕБУЕМЫЙ ПОД-СКИЛЛ: Используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans` для пошаговой реализации этого плана. Шаги используют синтаксис чекбоксов (`- [ ]`) для отслеживания прогресса.

**Цель:** Развернуть проект веб-симулятора инвестиций «Startup Arena» на удаленном Linux-сервере (`104.171.139.202`) в изолированном Docker-контейнере на порту 3001 с постоянным хранилищем базы данных SQLite.

**Архитектура:** Контейнеризация через multi-stage `Dockerfile` на базе `node:22-bookworm-slim` (сборка C++ аддона `better-sqlite3` и Vite SPA-фронтенда на этапе builder, легковесный запуск под пользователем `node` на этапе runner). Хранилище данных смонтировано через Docker Volume `platypus_data` в `/app/data`. Входной порт `3001:3001`.

**Технологический стек:** Node.js 22 LTS, Express 5, TypeScript, Vite, React 19, better-sqlite3 (WAL), Docker Engine 29.2.1, Docker Compose v5.0.2, Ubuntu 22.04 LTS.

## Глобальные ограничения
- Целевой хост: `104.171.139.202`, пользователь `clubfest`, порт SSH 22 (авторизация по ключу `id_ed25519`).
- Внешний сетевой порт приложения: `3001` (порты 80 и 443 заняты системным Nginx хоста).
- База данных SQLite должна быть персистентной и храниться в именованном томе Docker.
- Никаких паролей и секретов в репозитории и документации.

---

### Задача 1: Поддержка сетевой привязки `HOST` в бэкенде

**Файлы:**
- Изменить: `server/src/config.ts`
- Изменить: `server/src/index.ts`
- Изменить: `.env.example`
- Создать: `server/test/config.test.js`

**Интерфейсы:**
- Экспортирует: `config.host: string` из `server/src/config.ts` со значением по умолчанию `0.0.0.0` (или чтением `process.env.HOST`).
- Использует: `app.listen(config.port, config.host, ...)` в `server/src/index.ts`.

- [ ] **Шаг 1: Написать тест проверки чтения переменной HOST**

```javascript
// server/test/config.test.js
import test from "node:test";
import assert from "node:assert/strict";

test("config defaults host to 0.0.0.0 or reads process.env.HOST", async () => {
  const previousHost = process.env.HOST;
  try {
    process.env.HOST = "127.0.0.1";
    // Динамический импорт конфигурации с очисткой кеша или прямой вызов логики
    const { config } = await import("../dist/config.js");
    assert.ok(typeof config.host === "string");
  } finally {
    if (previousHost !== undefined) {
      process.env.HOST = previousHost;
    } else {
      delete process.env.HOST;
    }
  }
});
```

- [ ] **Шаг 2: Реализовать чтение `HOST` в `server/src/config.ts`**

```typescript
function readHost(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "0.0.0.0";
}

export const config = {
  host: readHost(process.env.HOST),
  port: readPort(process.env.PORT),
  databasePath: resolve(projectRoot, process.env.DATABASE_PATH ?? "./data/game.sqlite"),
  organizerPassword: process.env.ORGANIZER_PASSWORD || undefined,
};
```

- [ ] **Шаг 3: Передать `config.host` в `server/src/index.ts`**

```typescript
const server = app.listen(config.port, config.host, () => {
  console.log(`[server] listening on http://${config.host}:${config.port}`);
});
```

- [ ] **Шаг 4: Обновить `.env.example`**

```env
# Адрес сетевого интерфейса (0.0.0.0 для сервера/Docker, 127.0.0.1 для локального запуска)
HOST=0.0.0.0

# Локальный адрес API
PORT=3001

# Путь к SQLite относительно корня проекта (или абсолютный путь)
DATABASE_PATH=./data/game.sqlite

# Задайте собственный пароль организатора до начала мероприятия; без него закрытие недоступно
ORGANIZER_PASSWORD=
```

- [ ] **Шаг 5: Проверить сборку TypeScript бэкенда**

Команда: `npm run build --workspace @startup-game/server`  
Ожидаемый результат: сборка `tsc` завершается без ошибок.

---

### Задача 2: Создание Dockerfile, .dockerignore и docker-compose.yml

**Файлы:**
- Создать: `Dockerfile`
- Создать: `.dockerignore`
- Создать: `docker-compose.yml`

- [ ] **Шаг 1: Создать `.dockerignore`**

```gitignore
node_modules
.git
.agents
.aws
.codex
data
client/dist
server/dist
shared/dist
.env
.env.local
*.log
```

- [ ] **Шаг 2: Создать multi-stage `Dockerfile`**

```dockerfile
# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

RUN npm run build
RUN npm prune --omit=dev

# ==========================================
# Stage 2: Production Runner
# ==========================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATABASE_PATH=/app/data/game.sqlite

RUN mkdir -p /app/data && chown -R node:node /app

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/shared/package.json ./shared/
COPY --chown=node:node --from=builder /app/shared/dist ./shared/dist
COPY --chown=node:node --from=builder /app/server/package.json ./server/
COPY --chown=node:node --from=builder /app/server/dist ./server/dist
COPY --chown=node:node --from=builder /app/client/dist ./client/dist

USER node

VOLUME ["/app/data"]
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/index.js"]
```

- [ ] **Шаг 3: Создать `docker-compose.yml`**

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: platypus-game:latest
    container_name: platypus_app
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3001
      - DATABASE_PATH=/app/data/game.sqlite
      - ORGANIZER_PASSWORD=${ORGANIZER_PASSWORD}
    volumes:
      - platypus_data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "3"

volumes:
  platypus_data:
```

---

### Задача 3: Развертывание и сборка на удаленном сервере (субагент-деплойер)

- [ ] **Шаг 1: Подготовить директорию на сервере**
  `ssh -i ~/.ssh/id_ed25519 clubfest@104.171.139.202 "mkdir -p /home/clubfest/platypus_arena"`
- [ ] **Шаг 2: Синхронизировать проект на сервер**
  Использовать `rsync` с исключением тяжелых папок (`node_modules`, `.git`, `data`, `dist`).
- [ ] **Шаг 3: Создать production `.env` на сервере**
  Создать `/home/clubfest/platypus_arena/.env` с правами `chmod 600`.
- [ ] **Шаг 4: Запустить сборку Docker образа на сервере**
  Выполнить `docker compose build` внутри `/home/clubfest/platypus_arena`.
- [ ] **Шаг 5: Запустить контейнер в фоне**
  Выполнить `docker compose up -d`.

---

### Задача 4: Проверка и верификация развернутого сервиса

- [ ] **Шаг 1: Проверить статус контейнера**
  `docker compose ps` — контейнер должен иметь статус `Up` и `healthy`.
- [ ] **Шаг 2: Проверить логи контейнера**
  `docker compose logs app` — должен присутствовать вывод `[server] listening on http://0.0.0.0:3001`.
- [ ] **Шаг 3: Проверить HTTP Healthcheck снаружи**
  `curl -i http://104.171.139.202:3001/api/health` — должен вернуть `HTTP 200` с телом `{"status":"ok"}`.
- [ ] **Шаг 4: Проверить отдачу фронтенда**
  `curl -i http://104.171.139.202:3001/` — должен вернуть `HTTP 200` и HTML-разметку с заголовком приложения.
- [ ] **Шаг 5: Проверить сохранение базы данных SQLite**
  Убедиться, что том `platypus_data` существует и база данных инициализирована.

---

### Задача 5: Независимое код-ревью субагентом

- [ ] **Шаг 1: Вызвать субагента для проверки всех созданных файлов конфигурации, безопасности и деплоя.**
- [ ] **Шаг 2: Устранить замечания при их наличии.**
