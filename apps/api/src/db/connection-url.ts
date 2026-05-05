export interface NormalizedDatabaseUrl {
  url: string;
  schema?: string;
}

export function normalizeDatabaseUrl(connectionString: string): NormalizedDatabaseUrl {
  const url = new URL(connectionString);
  const schema = url.searchParams.get("schema") ?? undefined;

  url.searchParams.delete("schema");

  return {
    url: url.toString(),
    schema,
  };
}
