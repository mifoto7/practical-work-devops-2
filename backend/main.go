package main

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	_ "github.com/lib/pq"
)

// //go:embed вместо bind-mount ./frontend (как в PDF): на Windows/AgentStores
// том часто пустой → / отдавал 404. Держите backend/static/ = frontend/.
//
//go:embed static/*
var embeddedStatic embed.FS

type Item struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

func main() {
	// URL encoding preserves spaces, quotes and other characters in a secret.
	dsn := (&url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(env("DB_USER", "app"), env("DB_PASSWORD", "secret")),
		Host:     net.JoinHostPort(env("DB_HOST", "db"), env("DB_PORT", "5432")),
		Path:     "/" + env("DB_NAME", "appdb"),
		RawQuery: "sslmode=disable",
	}).String()

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		if err := db.PingContext(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "error", "database": "unavailable"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "database": "connected"})
	})

	mux.HandleFunc("/api/items", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		rows, err := db.QueryContext(ctx, `SELECT id, name FROM items ORDER BY id`)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		defer rows.Close()

		items := []Item{}
		for rows.Next() {
			var it Item
			if err := rows.Scan(&it.ID, &it.Name); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			items = append(items, it)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, "database read failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	})

	// Явный ReadFile — без FileServer/path-rewrite (на Desktop давал пустой /).
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && r.URL.Path != "/index.html" {
			http.NotFound(w, r)
			return
		}
		data, err := embeddedStatic.ReadFile("static/index.html")
		if err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	})

	addr := ":" + env("HTTP_PORT", "8080")
	log.Printf("listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
