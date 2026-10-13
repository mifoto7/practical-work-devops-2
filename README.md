# Практика 2 — Docker / Compose

Go API + простой HTML + PostgreSQL.

## Запуск

```powershell
# Windows: скопируйте проект на локальный диск (не AgentStores), затем:
copy .env.example .env
docker compose down
docker compose build --no-cache
docker compose up -d --force-recreate
curl.exe -i http://127.0.0.1:8080/
curl.exe http://127.0.0.1:8080/api/items
```

```bash
# Linux / macOS
cp .env.example .env
docker compose down
docker compose build --no-cache
docker compose up -d --force-recreate
curl -i http://127.0.0.1:8080/
curl -s http://127.0.0.1:8080/api/items
```

При правке UI синхронизируйте `frontend/index.html` → `backend/static/index.html` (embed).

## Чеклист (8 критериев)

1. Multi-stage: `golang:1.22-alpine` → `distroless/static-debian12:nonroot`, `COPY --from=builder`
2. Кэш слоёв: `go.mod`/`go.sum` + `go mod download` до кода; образ < 30 МБ
3. Non-root + без shell (distroless nonroot)
4. Fullstack: `/` → HTML, `/api/items` → JSON из Postgres
5. Compose: app + db, сеть, у БД нет портов наружу, секреты из `.env`
6. `healthcheck` + `depends_on: condition: service_healthy`
7. `docker compose up -d --build` → стек отвечает с первого раза
8. `.gitignore` с `.env`, теги `app-backend:1.0.0` / `postgres:16-alpine` (не `latest`), короткие комментарии «почему»
