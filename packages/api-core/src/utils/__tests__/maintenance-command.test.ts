import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { runJsonMaintenanceCommand } from "../maintenance-command";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path =>
    rm(path, { force: true, recursive: true })));
});

describe("JSON maintenance command runner", () => {
  it("parses one operation and manifest, reports failure, and always shuts down", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-maintenance-command-"));
    temporaryDirectories.push(directory);
    const manifestPath = join(directory, "manifest.json");
    await writeFile(manifestPath, JSON.stringify({ version: 1 }), "utf8");
    const shutdown = mock(async () => undefined);
    const setFailed = mock(() => undefined);
    const execute = mock(async (_composition, options) => {
      expect(options).toEqual({ operation: "apply", manifest: { version: 1 } });
      return { status: "failed" as const };
    });

    await runJsonMaintenanceCommand({
      argv: ["apply", "--manifest", manifestPath],
      commandName: "test maintenance",
      createComposition: async () => ({ shutdown }),
      execute,
      failureMessage: "failed safely\n",
      parseManifest: value => value as { version: number },
      process: { setFailed, writeError: mock(() => undefined) },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("does not create a composition for invalid input and emits only the safe failure", async () => {
    const createComposition = mock(async () => ({ shutdown: async () => undefined }));
    const setFailed = mock(() => undefined);
    const writeError = mock((_message: string) => undefined);

    await runJsonMaintenanceCommand({
      argv: ["apply"],
      commandName: "test maintenance",
      createComposition,
      execute: async () => ({ status: "passed" as const }),
      failureMessage: "failed safely\n",
      parseManifest: value => value,
      process: { setFailed, writeError },
    });

    expect(createComposition).not.toHaveBeenCalled();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(writeError).toHaveBeenCalledWith("failed safely\n");
  });
});
