import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";

const children = new Set<ChildProcessWithoutNullStreams>();
const entryReadyTimeoutMs = 15_000;
const entrySmokeTimeoutMs = 25_000;

afterEach(async () => {
  await Promise.all([...children].map(stopChild));
  children.clear();
});

async function reservePort() {
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (address === null || typeof address === "string")
    throw new Error("failed to reserve OIDC smoke port");
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForOutput(child: ChildProcessWithoutNullStreams, expected: string) {
  let output = "";
  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`OIDC entry did not start:\n${output}`)),
      entryReadyTimeoutMs,
    );
    const onData = (data: Buffer) => {
      output += data.toString();
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolve(output);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", code => reject(new Error(`OIDC entry exited with ${code}:\n${output}`)));
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null)
    return;
  child.kill();
  await Promise.race([
    new Promise<void>(resolve => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);
    }),
  ]);
}

describe("oIDC provider entry", () => {
  it("starts through the tsx loader, parsed environment, and real composition root", async () => {
    const port = await reservePort();
    const { privateKey } = await generateKeyPair("RS256", { modulusLength: 2048, extractable: true });
    const currentJwkJson = JSON.stringify({
      ...await exportJWK(privateKey),
      alg: "RS256",
      kid: "entry-smoke",
      use: "sig",
    });
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        IAM_OIDC_PROVIDER_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
        IAM_OIDC_PROVIDER_REDIS_HOST: "127.0.0.1",
        IAM_OIDC_PROVIDER_REDIS_PORT: "1",
        IAM_OIDC_PROVIDER_PORT: String(port),
        IAM_OIDC_PROVIDER_LOG_FORMAT: "json",
        IAM_OIDC_PROVIDER_ISSUER: `${origin}/oidc`,
        IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: origin,
        IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
        IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: currentJwkJson,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);

    await waitForOutput(child, "OIDC provider listening");
    const discovery = await fetch(`${origin}/oidc/.well-known/openid-configuration`);

    expect(discovery.status).toBe(200);
    await expect(discovery.json()).resolves.toMatchObject({ issuer: `${origin}/oidc` });

    await stopChild(child);
    children.delete(child);
  }, entrySmokeTimeoutMs);
});
