import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runOwnedCommand } from "../../../../scripts/owned-command.mjs";
import { managedIamFailure, readManagedIamInput, redactManagedIamText } from "./managed-iam-input.ts";

export async function runManagedIamJourney(signal?: AbortSignal) {
  const inputFile = process.env.IAM_MANAGED_ACCEPTANCE_INPUT_FILE;
  if (!inputFile) throw new Error("IAM_MANAGED_ACCEPTANCE_INPUT_FILE 必须指向本次正式初始化后的私有输入");
  const input = await readManagedIamInput(inputFile);
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const output = resolve(workspace, "test-results", `managed-iam-${randomUUID()}`);
  await mkdir(output, { recursive: true });
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["PATH", "HOME", "TMPDIR", "PLAYWRIGHT_BROWSERS_PATH"]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  Object.assign(environment, {
    IAM_E2E_ORIGIN: input.origin,
    IAM_E2E_PLAYWRIGHT_OUTPUT_DIR: resolve(output, "playwright"),
    IAM_MANAGED_ACCEPTANCE_INPUT_FILE: resolve(inputFile),
    DATABASE_URL: input.databaseUrl,
  });
  try {
    const result = await runOwnedCommand({
      executable: process.execPath,
      args: [
        resolve(workspace, "node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        resolve(workspace, "playwright.managed.config.ts"),
      ],
      cwd: workspace,
      env: environment,
      signal,
      timeoutMs: 300_000,
    });
    const text = redactManagedIamText(result.output, input);
    await writeFile(resolve(output, "playwright.log"), text, { mode: 0o600 });
    process.stdout.write(text);
    if (result.exitCode !== 0) throw new Error(`Managed Playwright exited with code ${result.exitCode}`);
    console.log(JSON.stringify({ scope: "managed-iam-login-and-workers", environment: input.environment, output }));
  } catch (error) {
    throw managedIamFailure(error, input);
  }
}
