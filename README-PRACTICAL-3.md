# Практическая работа № 3. GitHub Actions и Docker Compose

Workflow [.github/workflows/practical-3.yml](.github/workflows/practical-3.yml) запускает Go-приложение и PostgreSQL из практической № 2 через Docker Compose. Он проверяет, что оба контейнера работают, приложение подключается к БД, а записи из SQL совпадают с данными на странице в браузере.

## Настройка

1. В **Settings → Actions → Runners** зарегистрируйте self-hosted runner на машине с Git и Docker Compose. Если используется Windows с Docker Desktop, включите режим Linux containers. Запустите runner и проверьте, что в GitHub он отображается как **Idle**.
2. В **Settings → Secrets and variables → Actions** добавьте секреты `DB_USER`, `DB_NAME` и `DB_PASSWORD` для учебной PostgreSQL. Для пользователя и имени базы используйте латинские буквы, цифры и `_`. Начинайте имя с буквы или `_`. Для уже созданного тома PostgreSQL используйте те же значения.
3. Откройте **Actions → Practical 3 - Docker Compose and database UI tests → Run workflow** и выберите `main`. Workflow также запускается при push в `main`.

## Проверка результата

В job `deploy-and-test` проверьте имя runner и результаты шагов запуска Compose, проверки контейнеров и тестов. На машине runner веб-страница по умолчанию доступна по адресу <http://127.0.0.1:18080>.

В архиве **Artifacts** сохраняются четыре файла.

| Файл | Содержание |
|---|---|
| `.env` | Имена переменных с удалёнными значениями |
| `deployment-logs.txt` | Логи контейнеров приложения и базы |
| `docker-ps.txt` | Состояние контейнеров |
| `test-report.md` | Результаты проверки контейнеров, подключения к БД и двух тестов |
