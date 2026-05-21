#!/usr/bin/env node
/**
 * probe-backend — диагностика готовности бэка КИП Спецтехники.
 *
 * Прогоняет ключевые endpoint'ы из ТЗ и печатает таблицу: что отвечает,
 * с каким кодом, за какое время и какие тела. Не делает мутаций (только GET +
 * один пробный логин).
 *
 * Запуск:
 *   node scripts/probe-backend.mjs <BASE_URL> [--phone +79001111111] [--pin 1111]
 *
 * Примеры:
 *   node scripts/probe-backend.mjs http://2.27.86.52:3500
 *   node scripts/probe-backend.mjs https://kip.example.com
 *   node scripts/probe-backend.mjs http://localhost:3500 --phone +79991234567 --pin 9999
 *
 * Через npm:
 *   npm run probe -- http://2.27.86.52:3500
 *
 * Требует Node 18+ (нативный fetch).
 */

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('-')) {
  console.error('Usage: node scripts/probe-backend.mjs <BASE_URL> [--phone PHONE] [--pin PIN]');
  process.exit(2);
}

const BASE = args[0].replace(/\/$/, '');
let phone = null;
let pin = null;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--phone') phone = args[++i];
  else if (args[i] === '--pin') pin = args[++i];
}

const TIMEOUT_MS = 8000;

function timed(label) {
  const start = Date.now();
  return () => Date.now() - start;
}

async function probe(method, path, opts = {}) {
  const url = BASE + path;
  const t = timed();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: opts.headers || (opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    const ms = t();
    const ct = res.headers.get('content-type') || '';
    let preview = '';
    let body = null;
    if (ct.includes('application/json')) {
      try {
        body = await res.json();
        preview = JSON.stringify(body).slice(0, 120);
      } catch {
        preview = '<bad json>';
      }
    } else {
      const txt = await res.text();
      preview = txt.slice(0, 120);
    }
    return { ok: res.ok, status: res.status, ms, ct, preview, body, err: null };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: t(),
      ct: '',
      preview: '',
      body: null,
      err: e.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function row(name, r) {
  const status = r.status === 0 ? '---' : String(r.status);
  const ok = r.ok ? 'OK ' : r.status === 0 ? 'ERR' : '!! ';
  const ms = r.ms.toString().padStart(5);
  const tail = r.err
    ? `  · ${r.err}`
    : r.preview
      ? `  · ${r.preview}`
      : '';
  console.log(`  ${ok} ${status.padStart(3)} · ${ms}ms · ${name.padEnd(34)}${tail}`);
}

function section(title) {
  console.log(`\n── ${title} ─────────────────────────────────────`);
}

// ──────────────────────────────────────────────────────────────────────────────

console.log(`\nprobe-backend → ${BASE}`);
console.log(`timeout: ${TIMEOUT_MS}ms\n`);

section('Reachability');
const health = await probe('GET', '/health');
row('GET /health', health);
const root = await probe('GET', '/');
row('GET /', root);

if (health.status === 0 && root.status === 0) {
  console.log(
    `\n  ✗ Сервер не отвечает (нет TCP-коннекта). Проверь адрес, порт, firewall.\n`,
  );
  process.exit(1);
}

section('Справочники (публичные)');
row('GET /api/public/drivers', await probe('GET', '/api/public/drivers'));

section('Авторизация');
let token = null;
if (phone && pin) {
  const r = await probe('POST', '/api/auth/driver/login', { body: { phone, pin } });
  row(`POST /api/auth/driver/login (${phone})`, r);
  if (r.ok && r.body?.token) {
    token = r.body.token;
    console.log(`     → токен получен (${String(token).slice(0, 24)}…)`);
  }
} else {
  console.log('  (пропущено — передай --phone и --pin, чтобы протестировать логин)');
}

section('Авторизованные ручки');
if (token) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  row('GET /api/shifts/my', await probe('GET', '/api/shifts/my', auth));
  row('GET /api/equipment', await probe('GET', '/api/equipment', auth));
  row('GET /api/objects', await probe('GET', '/api/objects', auth));
  row('GET /api/legal-entities', await probe('GET', '/api/legal-entities', auth));
  row('GET /api/work-days', await probe('GET', '/api/work-days', auth));
  row('GET /api/expenses', await probe('GET', '/api/expenses', auth));
  row('GET /api/incidents', await probe('GET', '/api/incidents', auth));
} else {
  console.log('  (нет токена — пропущено)');
}

console.log('\nГотово.\n');

if (health.status === 200) {
  process.exit(0);
} else {
  process.exit(0);
}
