#!/usr/bin/env node
import "./require-linux.mjs";
import process from "node:process";
import {
  cleanupManagedResources,
  formatResourceFailure,
  readManagedResourceRegistry,
  readManagedResourceRun,
} from "./test-resources/managed-resources.mjs";

try {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.length !== 2 || args[0] !== "--record") throw new Error("Expected --record <repository-relative run.json>");
  const run = await readManagedResourceRun(process.cwd(), args[1]);
  const children = await readManagedResourceRegistry(run.root, `${run.record.artifactDirectory}/children.jsonl`);
  const failures = [];
  for (const path of [...children.reverse(), run.recordPath]) {
    try {
      await cleanupManagedResources(await readManagedResourceRun(run.root, path));
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `Cleanup failed for ${run.recordPath}`);
  console.log(`[test-resources] Cleaned exact project ${run.record.project}`);
} catch (error) {
  console.error(formatResourceFailure(error));
  process.exitCode = 1;
}
