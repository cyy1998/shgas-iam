export function requireDedicatedPostgresTestUrl(input: {
  readonly forbidden: ReadonlyArray<{
    readonly name: string;
    readonly value: string | undefined;
  }>;
  readonly name: string;
  readonly value: string;
}): string {
  const parsed = parseUrl(input);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${input.name} must use the postgres or postgresql protocol`);
  }
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName || ["postgres", "template0", "template1"].includes(databaseName.toLowerCase())) {
    throw new Error(`${input.name} must name a dedicated, non-system test database`);
  }

  const identity = postgresDatabaseIdentity(parsed);
  for (const forbidden of input.forbidden) {
    const value = forbidden.value?.trim();
    if (value && postgresDatabaseIdentity(parseUrl({ name: forbidden.name, value })) === identity) {
      throw new Error(`${input.name} must not identify the same database as ${forbidden.name}`);
    }
  }
  return input.value;
}

function parseUrl(input: { name: string; value: string }): URL {
  let parsed: URL;
  try {
    parsed = new URL(input.value);
  } catch {
    throw new Error(`${input.name} must be a valid PostgreSQL URL`);
  }
  const host = decodeURIComponent(parsed.hostname);
  if (
    !host ||
    /[,/]/u.test(host) ||
    ["database", "dbname", "host", "hostaddr", "port"].some((key) => parsed.searchParams.has(key))
  ) {
    throw new Error(`${input.name} must identify PostgreSQL through its URL host and path`);
  }
  return parsed;
}

function postgresDatabaseIdentity(parsed: URL) {
  const host = decodeURIComponent(parsed.hostname).toLowerCase().replace(/\.$/u, "");
  const port = Number(parsed.port || "5432");
  return `${host}:${port}/${decodeURIComponent(parsed.pathname.slice(1))}`;
}
