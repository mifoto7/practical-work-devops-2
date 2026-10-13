# ---------- Этап 1: сборка ----------
# Отдельный builder: компилятор (~сотни МБ) не попадёт в финальный образ.
FROM golang:1.22-alpine AS builder

WORKDIR /build

# Зависимости до кода — слой кэшируется при правках .go.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0: статическая линковка для distroless/static (без glibc).
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/app ./main.go

# ---------- Этап 2: исполнение ----------
# distroless + nonroot: нет shell/apk, процесс не от root.
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

# Только бинарник: HTML уже внутри через //go:embed (надёжнее bind-mount на Windows).
COPY --from=builder /out/app /app/app

EXPOSE 8080
ENTRYPOINT ["/app/app"]
