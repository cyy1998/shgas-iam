import { join } from "node:path";
import { buildCachedFrontend } from "./frontend-build.ts";
import { frontendApps, ssoTestLoginCredential } from "./frontend-config.ts";
import { startStaticFrontendServer } from "./static-frontend.ts";

const [name, portArgument] = process.argv.slice(2);
const app = frontendApps.find((candidate) => candidate === name);
const port = Number(portArgument);
if (!app || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Usage: integration-frontend.ts <admin|sso> <port>");
}

const repoRoot = join(import.meta.dirname, "../../../..");
const cacheRoot = join(repoRoot, ".cache", "integration-frontend");
const prefix = `IAM_${app.toUpperCase()}_WEB_`;
const buildEnvironment: Record<string, string> = app === "sso" ? { ...ssoTestLoginCredential } : {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith(prefix) && value !== undefined) buildEnvironment[key] = value;
}

const controller = new AbortController();
const interrupt = () => controller.abort(new Error("Integration frontend interrupted"));
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
const { directory, rebuilt } = await buildCachedFrontend({
  repoRoot,
  app,
  cacheRoot,
  buildEnvironment,
  signal: controller.signal,
});
controller.signal.throwIfAborted();
const server = startStaticFrontendServer({ [app]: directory }, port);
controller.signal.addEventListener("abort", () => server.stop(), { once: true });
console.log(`[integration-frontend] ${app} ${rebuilt ? "built" : "cache hit"} at ${server.origin}`);
