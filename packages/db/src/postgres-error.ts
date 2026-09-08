export interface PostgresErrorInfo {
  code: string;
  constraint: string | null;
}

/** Read driver metadata through Drizzle wrappers without guessing from SQL or error messages. */
export function extractPostgresError(error: unknown): PostgresErrorInfo | null {
  const visited = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) {
      return {
        code: current.code,
        constraint: "constraint_name" in current && typeof current.constraint_name === "string"
          ? current.constraint_name
          : "constraint" in current && typeof current.constraint === "string" ? current.constraint : null,
      };
    }
    current = "cause" in current ? current.cause : null;
  }
  return null;
}
