export const TEST_POSTGRES_URL_ENV = "IAM_TEST_POSTGRES_URL";

const SYSTEM_DATABASES = new Set(["postgres", "template0", "template1"]);
const RUNTIME_DATABASE_ENV_PATTERN = /^IAM_(?:[A-Z0-9_]+_)?DATABASE_URL$/u;
const TEST_DATABASE_MARKER_PATTERN = /(?:^|[_-])test(?:$|[_-])/iu;

export function requireDedicatedPostgresTestUrl(input) {
  const name = input.name ?? TEST_POSTGRES_URL_ENV;
  const parsed = parseUrl({ name, value: input.value });
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} must use the postgres or postgresql protocol`);
  }
  const databaseName = decodeDatabaseName(parsed, name);
  if (!databaseName || SYSTEM_DATABASES.has(databaseName.toLowerCase())) {
    throw new Error(`${name} must name a dedicated, non-system test database`);
  }

  const identity = postgresDatabaseIdentity(parsed, name);
  for (const forbidden of collectForbiddenEntries(name, input.environment, input.forbidden)) {
    const value = forbidden.value?.trim();
    if (value && postgresDatabaseIdentity(parseUrl({ name: forbidden.name, value }), forbidden.name) === identity) {
      throw new Error(`${name} must not identify the same database as ${forbidden.name}`);
    }
  }

  if (!TEST_DATABASE_MARKER_PATTERN.test(databaseName)) {
    throw new Error(`${name} must name a database containing a test marker (such as iam_test or *_test)`);
  }

  return input.value;
}

function collectForbiddenEntries(name, environment, explicitForbidden) {
  const entries = [];
  const seen = new Set();
  const add = (entryName, value) => {
    if (!entryName || entryName === name) return;
    const trimmed = value?.trim();
    if (!trimmed) return;
    const dedupeKey = `${entryName}\0${trimmed}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push({ name: entryName, value: trimmed });
  };

  for (const entry of explicitForbidden ?? []) {
    add(entry.name, entry.value);
  }

  if (environment) {
    add("DATABASE_URL", environment.DATABASE_URL);
    for (const [key, value] of Object.entries(environment)) {
      if (RUNTIME_DATABASE_ENV_PATTERN.test(key)) {
        add(key, value);
      }
    }
  }

  return entries;
}

function parseUrl(input) {
  let parsed;
  try {
    parsed = new URL(input.value);
  } catch {
    throw new Error(`${input.name} must be a valid PostgreSQL URL`);
  }
  const host = decodeComponent(parsed.hostname, input.name);
  if (
    !host ||
    /[,/]/u.test(host) ||
    ["database", "dbname", "host", "hostaddr", "port"].some((key) => parsed.searchParams.has(key))
  ) {
    throw new Error(`${input.name} must identify PostgreSQL through its URL host and path`);
  }
  return parsed;
}

function decodeComponent(raw, name) {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
}

function decodeDatabaseName(parsed, name) {
  const databaseName = decodeComponent(parsed.pathname.slice(1), name);
  if (databaseName.includes("/")) {
    throw new Error(`${name} must identify PostgreSQL through its URL host and path`);
  }
  return databaseName;
}

function postgresDatabaseIdentity(parsed, name) {
  const host = decodeComponent(parsed.hostname, name).toLowerCase().replace(/\.$/u, "");
  const port = Number(parsed.port || "5432");
  return `${host}:${port}/${decodeDatabaseName(parsed, name)}`;
}
