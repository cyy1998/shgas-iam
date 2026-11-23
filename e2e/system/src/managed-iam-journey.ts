import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { managedIamFailure, readManagedIamInput, redactManagedIamText } from "./managed-iam-input.ts";
import { captureCommand } from "./system-boundaries.ts";

export async function runManagedIamJourney(signal?: AbortSignal) {
  const inputFile = process.env.IAM_MANAGED_ACCEPTANCE_INPUT_FILE;
  if (!inputFile) throw new Error("IAM_MANAGED_ACCEPTANCE_INPUT_FILE 必须指向本次正式初始化后的私有输入");
  const input = await readManagedIamInput(inputFile);
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const output = resolve(workspace, "test-results", `managed-iam-${randomUUID()}`);
  await mkdir(output, { recursive: true });
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [
    "PATH",
    "SystemRoot",
    "ComSpec",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PLAYWRIGHT_BROWSERS_PATH",
  ]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  Object.assign(environment, {
    IAM_E2E_ORIGIN: input.origin,
    IAM_E2E_JOURNEY: "managed",
    IAM_E2E_PLAYWRIGHT_OUTPUT_DIR: resolve(output, "playwright"),
    IAM_MANAGED_ACCEPTANCE_INPUT_FILE: resolve(inputFile),
    DATABASE_URL: input.databaseUrl,
  });
  const record = async (stdout: string, stderr: string) => {
    const text = redactManagedIamText(`${stdout}\n${stderr}`, input);
    await writeFile(resolve(output, "playwright.log"), text, { mode: 0o600 });
    process.stdout.write(text);
  };
  try {
    const result = await captureCommand(
      process.execPath,
      [
        resolve(workspace, "node_modules/@playwright/test/cli.js"),
        "test",
        "--config",
        resolve(workspace, "playwright.config.ts"),
      ],
      {
        cwd: workspace,
        env: environment,
        capture: { mode: "tail", maxBytes: 256 * 1024 },
        signal: AbortSignal.any([AbortSignal.timeout(300_000), ...(signal ? [signal] : [])]),
      },
    );
    await record(result.stdout, result.stderr);
    console.log(JSON.stringify({ scope: "managed-iam-login-and-workers", environment: input.environment, output }));
  } catch (error) {
    const captured = error as { stdout?: string; stderr?: string };
    if (captured.stdout || captured.stderr) await record(captured.stdout ?? "", captured.stderr ?? "");
    throw managedIamFailure(error, input);
  }
}
