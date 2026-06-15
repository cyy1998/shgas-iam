import type { EnvMap, LoadedManifest, ManifestObject, ManifestScope } from "./types";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderEnvValue } from "./env";
import { createEmptyResourceMap, resourceDefinitions } from "./resources";

export const packageRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
export const repoRoot = path.resolve(packageRoot, "..");

const scopeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/;

export async function loadManifest(
  env: string,
  manifestDir = defaultManifestDir(env),
  options: { renderEnv?: boolean; env?: EnvMap } = {},
): Promise<LoadedManifest> {
  const resources = createEmptyResourceMap();
  const scope = parseManifestScope(env);

  for (const definition of resourceDefinitions) {
    const filePath = path.join(manifestDir, definition.fileName);
    const parsed = await readYamlFile(filePath, options);
    const value = parsed[definition.topKey] ?? [];

    if (!Array.isArray(value)) {
      throw new Error(`${relativePath(filePath)} must contain an array at ${definition.topKey}`);
    }

    resources[definition.kind] = value.map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(`${relativePath(filePath)} ${definition.topKey}[${index}] must be an object`);
      }
      return item;
    });
  }

  return { env, scope, manifestDir, resources };
}

export function defaultManifestDir(env: string): string {
  const scope = parseManifestScope(env);
  return path.join(packageRoot, "manifests", scope.env, scope.app);
}

export function resolveManifestScope(explicitEnv?: string): string {
  const env = explicitEnv ?? process.env.APISIX_MANIFEST_ENV;
  if (!env) {
    throw new Error("Missing manifest scope. Provide --env <env:app> or APISIX_MANIFEST_ENV.");
  }

  parseManifestScope(env);
  return env;
}

export function parseManifestScope(env: string): ManifestScope {
  const parts = env.split(":");
  if (parts.length !== 2 || parts.some(part => part.length === 0)) {
    throw new Error(`Invalid manifest scope: ${env}. Scope must use <env>:<app> format.`);
  }

  const stage = parts[0];
  const app = parts[1];
  if (!stage || !app) {
    throw new Error(`Invalid manifest scope: ${env}. Scope must use <env>:<app> format.`);
  }

  if (!scopeSegmentPattern.test(stage) || !scopeSegmentPattern.test(app)) {
    throw new Error(
      `Invalid manifest scope: ${env}. env and app may only use lowercase letters, digits, and hyphens.`,
    );
  }

  return { env: stage, app };
}

export function formatScope(scope: ManifestScope): string {
  return `${scope.env}:${scope.app}`;
}

export function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath);
}

async function readYamlFile(
  filePath: string,
  options: { renderEnv?: boolean; env?: EnvMap } = {},
): Promise<ManifestObject> {
  const content = await readFile(filePath, "utf8");
  const parsed = parseYaml(content) ?? {};
  const rendered = options.renderEnv
    ? renderEnvValue(parsed, options.env ?? process.env, relativePath(filePath))
    : parsed;

  if (!isRecord(rendered)) {
    throw new Error(`${relativePath(filePath)} must contain a YAML object`);
  }

  return rendered;
}

export function isRecord(value: unknown): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
