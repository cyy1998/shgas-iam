import { describe, expect, it, mock } from "bun:test";
import { runJsonMaintenanceCommand } from "../maintenance-command";

describe("JSON maintenance command runner", () => {
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
      parseManifest: (value) => value,
      process: { setFailed, writeError },
    });

    expect(createComposition).not.toHaveBeenCalled();
    expect(setFailed).toHaveBeenCalledTimes(1);
    expect(writeError).toHaveBeenCalledWith("failed safely\n");
  });
});
