import { spawnSync } from 'node:child_process';

export function compose(args, { allowFailure = false } = {}) {
  const result = spawnSync('docker', ['compose', ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const output = result.stdout || '';
  const error = result.error?.message || result.stderr || '';
  if ((result.error || result.status !== 0) && !allowFailure) {
    throw new Error(`docker compose ${args[0]} failed: ${error.trim()}`);
  }
  return { ok: !result.error && result.status === 0, output, error };
}

export function databaseItems() {
  const query = "SELECT COALESCE(json_agg(t ORDER BY t.id), '[]'::json) FROM (SELECT id, name FROM items ORDER BY id) AS t;";
  // Credentials stay inside the database container; only the SQL is an argument.
  const result = compose([
    'exec', '-T', 'db', 'sh', '-c',
    'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -v ON_ERROR_STOP=1 -c "$1"',
    'sh', query,
  ]);
  return JSON.parse(result.output.trim());
}

export function containerStates() {
  const text = compose(['ps', '--all', '--format', 'json']).output.trim();
  if (!text) return [];
  // Compose versions return either one JSON array or one JSON object per line.
  return text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).map(line => JSON.parse(line));
}
