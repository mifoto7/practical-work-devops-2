import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { compose, containerStates } from './docker.mjs';

const artifactDir = 'artifacts';
const requiredSecrets = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const port = process.env.APP_PORT || '18080';

function save(name, value) {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(`${artifactDir}/${name}`, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function envValues() {
  if (!existsSync('.env')) return {};
  const result = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_][A-Z_0-9]*)=(.*)$/.exec(line);
    if (!match) continue;
    result[match[1]] = match[2].startsWith('"')
      ? JSON.parse(match[2]).replace(/\$\$/g, '$') : match[2];
  }
  return result;
}

function redact(text, values) {
  let result = text;
  const secrets = requiredSecrets.map(key => values[key]).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const value of secrets) result = result.split(value).join('[REDACTED]');
  return result;
}

function prepareEnv() {
  const missing = requiredSecrets.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing GitHub Secrets: ${missing.join(', ')}`);
  for (const key of ['DB_USER', 'DB_NAME']) {
    if (!/^[a-zA-Z_][a-zA-Z_0-9]{0,62}$/.test(process.env[key])) throw new Error(`${key} must be a PostgreSQL identifier (letters, digits, underscore).`);
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('APP_PORT must be between 1 and 65535.');
  for (const key of requiredSecrets) {
    if (/[\r\n\0]/.test(process.env[key])) throw new Error(`${key} must be a single line.`);
  }
  const values = Object.fromEntries(requiredSecrets.map(key => [key, process.env[key]]));
  values.APP_PORT = port;
  values.COMPOSE_PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME || 'praktika-3';
  // JSON quotes protect spaces/quotes; doubled dollars suppress Compose interpolation.
  const text = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value).replace(/\$/g, () => '$$')}`).join('\n') + '\n';
  writeFileSync('.env', text, { mode: 0o600 });
  save('.env', Object.keys(values).map(key => `${key}=<redacted>`).join('\n') + '\n');
  save('environment-status.json', { source: process.env.GITHUB_ACTIONS === 'true' ? 'GitHub Secrets' : 'local environment', requiredKeys: requiredSecrets, valuesRemovedFromArtifact: true });
  console.log('.env created; artifact copy contains names only.');
}

async function verify() {
  const state = { ready: false, checkedAt: new Date().toISOString(), services: [] };
  try {
    state.services = containerStates();
    for (const service of ['app', 'db']) {
      const containers = state.services.filter(item => item.Service === service);
      if (containers.length !== 1 || containers[0].State !== 'running') throw new Error(`Service ${service} is not running.`);
      if (service === 'db' && containers[0].Health !== 'healthy') throw new Error('Database container is not healthy.');
    }
    const deadline = Date.now() + 90_000;
    let lastError;
    do {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(4000) });
        const health = await response.json();
        if (!response.ok || health.status !== 'ok' || health.database !== 'connected') throw new Error('Application is not connected to the database.');
        state.health = health;
        state.ready = true;
        console.log('Both services are running; application confirms a database connection.');
        return;
      } catch (error) {
        lastError = error;
        if (Date.now() < deadline) await delay(1000);
      }
    } while (Date.now() < deadline);
    throw lastError;
  } catch (error) {
    state.error = error.message;
    throw error;
  } finally {
    save('deployment-status.json', state);
  }
}

function collect() {
  const values = envValues();
  if (Object.keys(values).length) save('.env', Object.keys(values).map(key => `${key}=<redacted>`).join('\n') + '\n');
  const commands = [
    ['deployment-logs.txt', ['logs', '--no-color', '--timestamps']],
    ['docker-ps.txt', ['ps', '--all']],
    ['docker-ps.json', ['ps', '--all', '--format', 'json']],
    ['docker-images.txt', ['images']],
  ];
  const diagnostics = {};
  for (const [file, args] of commands) {
    const result = compose(args, { allowFailure: true });
    save(file, redact(result.output + (result.error ? '\n' + result.error : ''), values));
    diagnostics[file] = result.ok;
  }
  const deployment = readJson(`${artifactDir}/deployment-status.json`);
  const tests = readJson('test-results/results.json');
  const stats = tests?.stats;
  const passed = Boolean(deployment?.ready && stats?.expected === 2 && stats.unexpected === 0 && stats.skipped === 0);
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const report = [
    '# Отчёт о проверке практической работы № 3',
    '',
    `- Дата: ${new Date().toISOString()}`,
    `- Результат: ${passed ? 'ПРОВЕРКИ ПРОЙДЕНЫ' : 'НЕ ПОДТВЕРЖДЁН / ЕСТЬ ОШИБКИ'}`,
    `- Среда: ${inActions ? 'GitHub Actions' : 'локальная проверка'}`,
    `- Runner: ${inActions ? (process.env.RUNNER_NAME || 'unknown') : 'не проверялся в GitHub'}`,
    `- Тип runner: ${inActions ? (process.env.RUNNER_ENVIRONMENT || 'unknown') : 'локально'}`,
    `- Commit: ${process.env.GITHUB_SHA || 'локальная копия'}`,
    `- Контейнеры и подключение приложения к БД: ${deployment?.ready ? 'подтверждены' : 'не подтверждены'}`,
    `- Тесты: успешно ${stats?.expected ?? 0}; ошибок ${stats?.unexpected ?? 'нет результата'}; пропущено ${stats?.skipped ?? 'нет результата'}`,
    `- Источник настроек: ${readJson(`${artifactDir}/environment-status.json`)?.source || 'не подтверждён'}`,
    '',
    '## Материалы проверки',
    '- `.env`: копия только с именами переменных, все значения удалены.',
    '- `deployment-logs.txt`, `docker-ps.txt`, `docker-ps.json`, `docker-images.txt`: состояние проекта.',
    '- `test-results/results.json`, `test-results/junit.xml`: фактические результаты тестов.',
    '- `test-results/data-comparison.json`: записи из SQL, API и веб-интерфейса.',
    '- `test-results/web-interface.png`: снимок страницы после загрузки записей.',
    '- `playwright-report/index.html`: подробный отчёт браузерных тестов.',
    '',
    'Локальный успешный запуск не подтверждает регистрацию и онлайн-статус runner в GitHub.',
    '',
  ].join('\n');
  save('diagnostics-status.json', diagnostics);
  save('test-report.md', redact(report, values));
  console.log(`Artifacts collected. Result: ${passed ? 'passed' : 'not confirmed / failed'}.`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'prepare-env') prepareEnv();
  else if (command === 'verify') await verify();
  else if (command === 'collect') collect();
  else if (command === 'summary') {
    const text = existsSync(`${artifactDir}/test-report.md`) ? readFileSync(`${artifactDir}/test-report.md`, 'utf8') : 'Отчёт не создан. Проверьте ошибки предыдущих шагов.\n';
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    else console.log(text);
  } else if (command === 'cleanup-env') {
    if (existsSync('.env')) unlinkSync('.env');
  } else throw new Error('Use prepare-env, verify, collect, summary or cleanup-env.');
}

main().catch(error => {
  // Error messages never include environment values or the connection URL.
  console.error(error.message);
  process.exitCode = 1;
});
