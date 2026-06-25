import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type AppEnvSchemaCheck = {
  file: string;
  prefix: string;
};

type EnvExampleCheck = {
  file: string;
  allowedPrefixes: string[];
  allowedKeys?: string[];
};

type FrontendCheck = {
  appDir: string;
  boundaryFile: string;
  prefix: string;
};

type Violation = {
  file: string;
  line: number;
  message: string;
};

const repoRoot = join(import.meta.dirname, "..");

const appEnvSchemaChecks: AppEnvSchemaCheck[] = [
  { file: "apps/api/src/env.ts", prefix: "IAM_API_" },
  { file: "apps/admin-api/src/env.ts", prefix: "IAM_ADMIN_API_" },
  { file: "apps/oidc-provider/src/env.ts", prefix: "IAM_OIDC_PROVIDER_" },
];

const envExampleChecks: EnvExampleCheck[] = [
  { file: "apps/api/.env.example", allowedPrefixes: ["IAM_API_"], allowedKeys: ["NODE_ENV"] },
  { file: "apps/admin-api/.env.example", allowedPrefixes: ["IAM_ADMIN_API_"], allowedKeys: ["NODE_ENV"] },
  { file: "apps/oidc-provider/.env.example", allowedPrefixes: ["IAM_OIDC_PROVIDER_"], allowedKeys: ["NODE_ENV"] },
  { file: "apps/admin/.env.example", allowedPrefixes: ["UMI_APP_ADMIN_"], allowedKeys: ["PORT"] },
  { file: "apps/sso/.env.example", allowedPrefixes: ["UMI_APP_SSO_"], allowedKeys: ["PORT"] },
];

const frontendChecks: FrontendCheck[] = [
  {
    appDir: "apps/admin/src",
    boundaryFile: "apps/admin/src/constants/config.ts",
    prefix: "UMI_APP_ADMIN_",
  },
  {
    appDir: "apps/sso/src",
    boundaryFile: "apps/sso/src/constants/config.ts",
    prefix: "UMI_APP_SSO_",
  },
];

const dockerFiles = [
  "docker/.env.dev.example",
  "docker/.env.prod.example",
  "docker/docker-compose-dev.yml",
  "docker/docker-compose-prod.yml",
  "docker/docker-compose-frontend-prod.yml",
  "apps/admin/Dockerfile",
  "apps/sso/Dockerfile",
];

const retiredDockerNames = [
  "DATABASE_URL",
  "REDIS_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "LOG_LEVEL",
  "LOG_FORMAT",
  "PASSWORD_HASH_ROUNDS",
  "MAGIC_CODE",
  "CAP_ENABLED",
  "CAP_SITE_KEY",
  "CAP_SECRET",
  "CAP_CHALLENGE_TTL_MS",
  "CAP_TOKEN_TTL_SECONDS",
  "HUMAN_VERIFICATION_WINDOW_SECONDS",
  "HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD",
  "HUMAN_VERIFICATION_LOOKUP_THRESHOLD",
  "LOGIN_CREDENTIAL_ACTIVE_KID",
  "LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON",
  "LOGIN_CREDENTIAL_MAX_SKEW_MS",
  "LOGIN_CREDENTIAL_NONCE_TTL_SECONDS",
  "AUTH_CODE_EXPIRE_TIME",
  "REDIS_EXPIRE_TIME",
  "LOGIN_ENDPOINT",
  "SSO_INTERNAL_ORIGIN",
  "SSO_EXTERNAL_ORIGIN",
  "AUTHORIZATION_ENDPOINT",
  "LOGOUT_ENDPOINT",
  "THIRDPARTY_OA_ENDPOINT",
  "ADMIN_CLIENT_CODES",
  "ADMIN_ROLE_CODES",
  "OIDC_ISSUER",
  "OIDC_PUBLIC_ORIGIN",
  "OIDC_SSO_LOGIN_PATH",
  "OIDC_COOKIE_KEYS",
  "OIDC_CURRENT_JWK_JSON",
  "OIDC_PREVIOUS_JWK_JSON",
  "OIDC_GLOBAL_SESSION_COOKIE",
  "OIDC_GLOBAL_SESSION_TTL_SECONDS",
  "OIDC_AUTHORIZATION_CODE_TTL_SECONDS",
  "OIDC_INTERACTION_TTL_SECONDS",
  "OIDC_ACCESS_TOKEN_TTL_SECONDS",
  "OIDC_ID_TOKEN_TTL_SECONDS",
  "OIDC_CLIENT_CACHE_TTL_SECONDS",
  "OIDC_BCRYPT_COST",
  "OIDC_CLIENT_AUTH_FAILURE_LIMIT",
  "OIDC_CLIENT_AUTH_FAILURE_WINDOW_SECONDS",
  "OIDC_TRUST_PROXY",
  "SESSION_KERNEL_NAMESPACE",
  "SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS",
  "SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS",
  "SESSION_KERNEL_TOMBSTONE_TTL_SECONDS",
  "SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS",
  "SESSION_LOOKUP_HMAC_CURRENT_ID",
  "SESSION_LOOKUP_HMAC_CURRENT_SECRET",
  "SESSION_LOOKUP_HMAC_PREVIOUS_ID",
  "SESSION_LOOKUP_HMAC_PREVIOUS_SECRET",
  "UMI_APP_API_PREFIX",
  "UMI_APP_SSO_AUTHORIZE_URL",
  "UMI_APP_SSO_LOGOUT_URL",
  "UMI_APP_WELL_KNOWN_URL",
  "UMI_APP_CAP_SITE_KEY",
  "UMI_APP_CAP_ENDPOINT",
  "UMI_APP_CAP_WASM_URL",
  "UMI_APP_CAP_PAKO_URL",
  "UMI_APP_LOGIN_CREDENTIAL_KID",
  "UMI_APP_LOGIN_CREDENTIAL_PUBLIC_KEY",
  "UMI_APP_GRAFANA_URL",
  "UMI_APP_SYSTEM_LOG_ENV",
  "SSO_UMI_APP_SSO_CLIENT_CODE",
];

const violations: Violation[] = [];

for (const check of appEnvSchemaChecks) {
  checkRawEnvSchema(check);
  checkBackendProcessEnvBoundary(check.file);
}

for (const check of envExampleChecks) {
  checkEnvExample(check);
}

for (const check of frontendChecks) {
  checkFrontendEnvReads(check);
}

for (const file of dockerFiles) {
  checkDockerRetiredNames(file);
}

if (violations.length > 0) {
  console.error("Env name guard failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
  }
  process.exit(1);
}

console.log("Env name guard passed.");

function checkRawEnvSchema(check: AppEnvSchemaCheck): void {
  const text = read(check.file);
  const block = extractRawEnvSchemaBlock(text, check.file);
  if (!block) return;

  for (const match of block.text.matchAll(/^\s{2}([A-Z][A-Z0-9_]*)\s*:/gm)) {
    const key = match[1];
    if (key !== "NODE_ENV" && !key.startsWith(check.prefix)) {
      add(check.file, lineNumber(text, block.start + match.index!), `${key} must use ${check.prefix} in RawEnvSchema`);
    }
  }
}

function checkBackendProcessEnvBoundary(envFile: string): void {
  const appSrcDir = envFile.replace(/\/env\.ts$/, "");
  for (const file of listFiles(appSrcDir, isTypeScriptFile)) {
    if (file === envFile || file.includes("/__tests__/")) continue;
    const text = read(file);
    for (const match of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g)) {
      add(file, lineNumber(text, match.index!), "backend process.env reads must stay inside src/env.ts");
    }
  }
}

function checkEnvExample(check: EnvExampleCheck): void {
  const text = read(check.file);
  const allowedKeys = new Set(check.allowedKeys ?? []);

  text.split("\n").forEach((line, index) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match) return;

    const key = match[1];
    if (allowedKeys.has(key) || check.allowedPrefixes.some(prefix => key.startsWith(prefix))) return;

    add(check.file, index + 1, `${key} must use one of ${check.allowedPrefixes.join(", ")}`);
  });
}

function checkFrontendEnvReads(check: FrontendCheck): void {
  for (const file of listFiles(check.appDir, isTypeScriptFile)) {
    const text = read(file);
    for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const key = match[1];

      if (file !== check.boundaryFile) {
        add(file, lineNumber(text, match.index!), "frontend process.env reads must stay inside constants/config.ts");
      }

      if (key.startsWith("UMI_APP_") && !key.startsWith(check.prefix)) {
        add(file, lineNumber(text, match.index!), `${key} must use ${check.prefix}`);
      }
    }
  }
}

function checkDockerRetiredNames(file: string): void {
  const text = read(file);

  for (const name of retiredDockerNames) {
    const pattern = new RegExp(`(?<![A-Z0-9_])${escapeRegExp(name)}(?![A-Z0-9_])`, "g");
    for (const match of text.matchAll(pattern)) {
      add(file, lineNumber(text, match.index!), `${name} is a retired app env contract name`);
    }
  }

  const frontendDockerPrefix = file.includes("apps/admin/")
    ? "UMI_APP_ADMIN_"
    : file.includes("apps/sso/")
      ? "UMI_APP_SSO_"
      : undefined;

  if (frontendDockerPrefix) {
    for (const match of text.matchAll(/\b(UMI_APP_[A-Z0-9_]+)\b/g)) {
      const key = match[1];
      if (!key.startsWith(frontendDockerPrefix)) {
        add(file, lineNumber(text, match.index!), `${key} must use ${frontendDockerPrefix}`);
      }
    }
  }
}

function extractRawEnvSchemaBlock(text: string, file: string): { start: number; text: string } | undefined {
  const schemaStartMatch = text.match(/const Raw[A-Za-z]*EnvSchema = z\.object\(\{/);
  const start = schemaStartMatch?.index;
  if (start === undefined) {
    add(file, 1, "Raw env schema was not found");
    return undefined;
  }

  const endMarkers = [").superRefine", "});"];
  const end = endMarkers
    .map(marker => text.indexOf(marker, start))
    .filter(index => index !== -1)
    .sort((a, b) => a - b)[0];

  if (end === undefined) {
    add(file, lineNumber(text, start), "RawEnvSchema end was not found");
    return undefined;
  }

  return { start, text: text.slice(start, end) };
}

function listFiles(dir: string, predicate: (file: string) => boolean): string[] {
  const absoluteDir = join(repoRoot, dir);
  if (!existsSync(absoluteDir)) return [];

  const result: string[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".umi" || entry === ".umi-production") continue;

    const absolutePath = join(absoluteDir, entry);
    const relativePath = relative(repoRoot, absolutePath);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      result.push(...listFiles(relativePath, predicate));
    }
    else if (predicate(relativePath)) {
      result.push(relativePath);
    }
  }

  return result;
}

function isTypeScriptFile(file: string): boolean {
  return /\.(?:ts|tsx)$/.test(file) && !file.endsWith(".d.ts");
}

function read(file: string): string {
  return readFileSync(join(repoRoot, file), "utf8");
}

function add(file: string, line: number, message: string): void {
  violations.push({ file, line, message });
}

function lineNumber(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
