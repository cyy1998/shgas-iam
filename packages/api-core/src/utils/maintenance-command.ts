import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

export type MaintenanceOperation = "dry-run" | "apply" | "verify";

interface MaintenanceReport {
  status: "failed" | "passed";
}

interface MaintenanceComposition {
  shutdown: () => Promise<void>;
}

export async function runJsonMaintenanceCommand<
  TManifest,
  TComposition extends MaintenanceComposition,
  TReport extends MaintenanceReport,
>(input: {
  argv: string[];
  commandName: string;
  createComposition: () => Promise<TComposition>;
  execute: (
    composition: TComposition,
    options: { operation: MaintenanceOperation; manifest: TManifest },
  ) => Promise<TReport>;
  failureMessage: string;
  parseManifest: (value: unknown) => TManifest;
  process: {
    setFailed: () => void;
    writeError: (message: string) => void;
  };
}) {
  try {
    const options = await readMaintenanceOptions(
      input.argv,
      input.commandName,
      input.parseManifest,
    );
    const composition = await input.createComposition();
    try {
      const report = await input.execute(composition, options);
      if (report.status === "failed")
        input.process.setFailed();
      return report;
    }
    finally {
      await composition.shutdown();
    }
  }
  catch {
    input.process.setFailed();
    input.process.writeError(input.failureMessage);
    return undefined;
  }
}

async function readMaintenanceOptions<TManifest>(
  argv: string[],
  commandName: string,
  parseManifest: (value: unknown) => TManifest,
) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { manifest: { type: "string" } },
    strict: true,
  });
  const operationInput = positionals[0];
  if (operationInput !== "dry-run" && operationInput !== "apply" && operationInput !== "verify")
    throw new Error(`${commandName} operation must be dry-run, apply, or verify`);
  if (positionals.length !== 1)
    throw new Error(`${commandName} accepts exactly one operation`);
  if (values.manifest === undefined)
    throw new Error("--manifest is required");
  const manifest = parseManifest(JSON.parse(await readFile(values.manifest, "utf8")));
  const operation: MaintenanceOperation = operationInput;
  return { operation, manifest };
}
