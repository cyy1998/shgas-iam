import { readFileSync } from "node:fs";
import { createE2EStubsServer } from "../../src/e2e-stubs-server.ts";

const token = process.env.IAM_E2E_STUBS_TOKEN?.trim();
if (!token) throw new Error("IAM_E2E_STUBS_TOKEN is required");

const httpPort = Number(process.env.IAM_E2E_STUBS_HTTP_PORT ?? "8080");
const httpsPort = Number(process.env.IAM_E2E_STUBS_HTTPS_PORT ?? "443");
const runId = process.env.IAM_E2E_WECOM_RUN_ID ?? "";

const rpTerminalHtml = readFileSync(new URL("../rp-terminal.html", import.meta.url), "utf8");
const cert = readFileSync(new URL("../../test-assets/e2e-stubs-cert.pem", import.meta.url), "utf8");
const key = readFileSync(new URL("../../test-assets/e2e-stubs-key.pem", import.meta.url), "utf8");

const stubs = createE2EStubsServer({ runId, token, rpTerminalHtml });

const wecomServer = Bun.serve({
  hostname: "0.0.0.0",
  port: httpsPort,
  tls: { cert, key },
  fetch: stubs.handleWecom,
});

const httpServer = Bun.serve({
  hostname: "0.0.0.0",
  port: httpPort,
  fetch: stubs.handleHttp,
});

const shutdown = () => {
  httpServer.stop(true);
  wecomServer.stop(true);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[e2e-stubs] listening on http://0.0.0.0:${httpServer.port} and https://0.0.0.0:${wecomServer.port}`);
