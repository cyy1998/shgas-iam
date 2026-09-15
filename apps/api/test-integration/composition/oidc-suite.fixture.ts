import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnOwnedProcessTree, terminateProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { withOidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";
import { createOidcConformanceCandidate } from "./oidc-conformance.fixture";

async function main() {
  await withOidcConformanceLifecycle(async (lifecycle) => {
    const options = JSON.parse(await readFile(process.argv[2]!, "utf8"));
    const output = String(options.outputDirectory);
    const suite = String(options.suiteOrigin);
    await mkdir(output, { recursive: true });
    const candidate = await createOidcConformanceCandidate({
      redirectUris: [
        `${suite}/test/a/iam195/callback`,
        `${suite}/test/a/iam195/callback?dummy1=lorem&dummy2=ipsum`,
      ],
      postLogoutRedirectUris: [`${suite}/test/a/iam195/post_logout_redirect`],
      tls: options.tls,
      logPath: join(output, "candidate-api.log"),
      lifecycle,
    });
    const configPath = join(output, "driver-input.json");
    await writeFile(
      configPath,
      JSON.stringify({ ...options, candidateRuntime: candidate, loginCredential: candidate.loginCredential }),
    );
    await lifecycle.checkpoint("before-driver-start");
    lifecycle.signal.throwIfAborted();
    const child = spawnOwnedProcessTree({
      executable: "node",
      args: ["--import", "tsx", "test-integration/composition/oidc-suite-runner.ts", configPath],
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: { ...process.env, NODE_EXTRA_CA_CERTS: options.tls.certPath },
    });
    child.stdout?.on("data", chunk => process.stdout.write(String(chunk)));
    child.stderr?.on("data", chunk => process.stderr.write(String(chunk)));
    const interruptDriver = () => child.kill("SIGTERM");
    lifecycle.signal.addEventListener("abort", interruptDriver);
    if (lifecycle.signal.aborted)
      interruptDriver();
    lifecycle.own(async () => {
      lifecycle.signal.removeEventListener("abort", interruptDriver);
      await terminateProcessTree(child, { timeoutMs: 5000 });
    });
    await writeFile(
      join(output, "driver-owner.json"),
      JSON.stringify({
        pid: child.pid,
        executable: "node",
        args: ["--import", "tsx", "test-integration/composition/oidc-suite-runner.ts", configPath],
      }),
    );
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    if (exitCode !== 0)
      throw new Error(`OIDC suite driver exited ${exitCode}`);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
