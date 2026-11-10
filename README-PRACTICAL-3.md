# Практическая работа № 3: GitHub Actions и Docker Compose

Основа — существующий проект практической № 2: Go, PostgreSQL 16 и веб-страница со списком `items`.
Workflow находится в `.github/workflows/practical-3.yml` и выполняется на **self-hosted runner**.

## Что делает workflow

1. Получает проект и устанавливает Node.js 22.
2. Создаёт рабочий `.env` из GitHub Secrets. В каталог артефактов сразу записывается отдельная копия `.env`, в которой удалены **все значения**.
3. Устанавливает зависимости тестов и Chromium.
4. Выполняет `docker compose up -d --build --wait --wait-timeout 120`.
5. Проверяет каждый из двух контейнеров и `/health`. Этот адрес проверяет настоящее подключение Go-приложения к PostgreSQL.
6. Запускает два теста: SQL против API, затем SQL против фактического текста в браузере.
7. Даже при провале тестов собирает логи, состояние Docker и отчёт, затем загружает материалы в GitHub Actions.
8. Удаляет рабочий `.env` с секретами. Контейнеры остаются доступны для демонстрации.

Современная команда `docker compose` выполняет ту же задачу, что `docker-compose` в методичке.
Статическая строка «10/10» не используется: отчёт строится по фактическим результатам.

## Настройка GitHub

Репозиторий: <https://github.com/mifoto7/practical-work-devops-2>.

### 1. Self-hosted runner на выбранной машине

Runner можно установить на другом компьютере или на облачной виртуальной машине.
Компьютер, на котором готовили файлы, использовать для этого необязательно.
Сохранено `runs-on: self-hosted`: обычный GitHub-hosted runner с `ubuntu-latest` не выполняет критерий на 3 балла.

На выбранной машине нужны Git, поддерживаемая runner операционная система и Docker с Docker Compose.
На Windows можно использовать Docker Desktop, на Linux — Docker Engine с Compose plugin.
Node.js 22 устанавливается самим workflow. На Linux шаг установки Chromium также устанавливает системные библиотеки;
для первой такой установки нужны соответствующие права администратора.

Откройте **Settings → Actions → Runners → New self-hosted runner**, выберите ОС и архитектуру выбранной машины.
Выполните именно на ней команды скачивания и регистрации, показанные GitHub.
Затем запустите `run.sh` на Linux или `run.cmd` на Windows.
Временный токен регистрации не должен попадать в репозиторий.

В GitHub runner должен отображаться как Idle / Online; в его окне — `Listening for Jobs`.
Runner и Docker должны оставаться запущенными во время выполнения и проверки задания.

### 2. Секреты

Откройте **Settings → Secrets and variables → Actions → New repository secret**.

| Имя | Значение |
|---|---|
| `DB_USER` | Имя пользователя PostgreSQL, например `practical_user` |
| `DB_PASSWORD` | Случайный пароль для отдельной учебной БД |
| `DB_NAME` | Имя БД, например `practical_db` |

Имена пользователя и БД должны содержать латинские буквы, цифры и `_`, не начинаться с цифры и быть не длиннее 63 символов.
Пароль может содержать пробелы, кавычки, `$` и другие знаки; переносы строк не поддерживаются.

Переменная Actions **APP_PORT** необязательна: по умолчанию используется `18080`.
Она задаётся на вкладке **Variables**, если этот порт занят.
`DB_HOST=db` и `DB_PORT=5432` уже настроены для внутренней Docker-сети.
`APP_SECRET` и `API_KEY` из универсального примера PDF это приложение не использует.

Проект Actions имеет имя `praktika-3-ci`, собственную сеть и собственный том БД.
Жёсткие имена контейнеров убраны, поэтому он может работать рядом с контейнерами практической № 2.
Нельзя менять пользователя/пароль существующего тома PostgreSQL и ожидать автоматического пересоздания БД:
при необходимости используйте новый учебный проект/том, сохранив прежние данные.

### 3. Запуск

Workflow запускается при push в `main` или `codex/practical-3`, а также через **Actions → Run workflow**.
Для ручного запуска workflow должен находиться в основной ветке репозитория.

После запуска откройте job `deploy-and-test` и убедитесь, что указан ваш runner, а не GitHub-hosted машина.
Приложение на компьютере runner будет доступно по адресу <http://127.0.0.1:18080>.

## Проверка до GitHub Actions

На любой машине с Docker и Node.js 22+ можно проверить проект отдельно от runner.
Сначала настройте `.env` по `.env.example`, затем выполните:

```text
npm ci
npx playwright install --with-deps chromium
docker compose up -d --build --wait --wait-timeout 120
node scripts/ci.mjs verify
npm run test:e2e
node scripts/ci.mjs collect
```

Используйте те же `APP_PORT` и `COMPOSE_PROJECT_NAME`, что в `.env`; при изменении порта передайте `APP_PORT` и процессу тестов.
Повторно генерировать пароль для уже созданного тома не нужно: используйте существующий `.env`.

## Материалы для проверки

В завершённом запуске **Actions → Artifacts** скачайте архив `practical-3-<run_id>-<attempt>`.
Он содержит:

- `artifacts/.env` — только названия переменных и `<redacted>` вместо значений.
- `artifacts/deployment-logs.txt` — логи контейнеров проекта.
- `artifacts/docker-ps.txt` и `docker-ps.json` — снимок состояния контейнеров.
- `artifacts/docker-images.txt` — образы проекта.
- `artifacts/deployment-status.json` — результат проверки каждого сервиса и подключения к БД.
- `artifacts/test-report.md` — отчёт, составленный по реальным результатам.
- `test-results/results.json` и `junit.xml` — результаты двух тестов.
- `test-results/data-comparison.json` — записи SQL, ответ API и отображение в браузере.
- `test-results/web-interface.png` — страница с записями из БД.
- `playwright-report/index.html` — подробный HTML-отчёт.

При аварии на раннем шаге часть материалов может отсутствовать. Отчёт в этом случае не объявляет успех.
Логи собираются **до** загрузки артефактов. Для очищенного скрытого `.env` включён `include-hidden-files: true`.
Настоящий `.env` не входит в список загружаемых путей и исключён из Git.

## Чек-лист по критериям из задания

| Баллы | Что нужно подтвердить | Где проверять |
|---|---|---|
| 1 | Runner установлен и зарегистрирован | Settings → Actions → Runners |
| 1 | Runner подключён и готов к заданиям | Idle / Online и Listening for Jobs |
| 1 | Workflow выполнен на self-hosted runner | `runs-on: self-hosted` и данные реального job |
| 1 | Workflow выполнил запуск Compose | Шаг Start Docker Compose project |
| 1 | Оба контейнера работают | Шаг проверки и `docker-ps.*` |
| 1 | Используются GitHub Secrets | Три обращения `secrets.*` и настройки репозитория |
| 1 | `.env` создан из секретов перед запуском | Шаг Create .env from GitHub Secrets |
| 1 | Артефакты сохранены | Скачиваемый архив в завершённом запуске |
| 1 | Приложение и подключение к БД проверены | Первый тест, `/health`, SQL и API |
| 1 | Данные БД совпадают с веб-интерфейсом | Второй тест, JSON сравнения и снимок страницы |

Успешная локальная проверка не заменяет успешный запуск в GitHub Actions и проверку онлайн-статуса runner.

Официальные справки: [установка runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners),
[GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets),
[Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/),
[скрытые файлы в артефактах](https://github.com/actions/upload-artifact#uploading-hidden-files).
