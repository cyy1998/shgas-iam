import type { EnvMap } from "./types";
import { readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvFile(filePath: string): void {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const content = readFileSync(absolutePath, "utf8");

  for (const [lineIndex, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      throw new Error(`${filePath}:${lineIndex + 1} is not a valid env assignment`);
    }

    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) {
      throw new Error(`${filePath}:${lineIndex + 1} is not a valid env assignment`);
    }

    process.env[key] = parseEnvValue(rawValue);
  }
}

export function renderEnvPlaceholders(
  content: string,
  env: EnvMap = process.env,
  source = "manifest",
): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/g, (_placeholder, name: string) => {
    const value = env[name];
    if (value === undefined) {
      throw new Error(`${source} references missing environment variable ${name}`);
    }
    return value;
  });
}

export function renderEnvValue(value: unknown, env: EnvMap, source: string): unknown {
  if (typeof value === "string") {
    return renderEnvPlaceholders(value, env, source);
  }

  if (Array.isArray(value)) {
    return value.map(item => renderEnvValue(item, env, source));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      renderEnvPlaceholders(key, env, source),
      renderEnvValue(child, env, source),
    ]),
  );
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
