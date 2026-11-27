#!/usr/bin/env node
import "./require-linux.mjs";
import process from "node:process";
import {
  cleanupManagedResources,
  formatResourceFailure,
  readManagedResourceRun,
} from "./test-resources/managed-resources.mjs";
import { cleanupNativeResourceRun } from "./test-resources/native-provider.mjs";

try {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.length !== 2 || args[0] !== "--record") throw new Error("Expected --record <repository-relative run.json>");
  const run = await readManagedResourceRun(process.cwd(), args[1]);
  const provider = run.record.provider ?? "docker";
  if (provider === "native") {
    await cleanupNativeResourceRun(run, { respectKeep: false });
    console.log(`[test-resources] Cleaned native run ${run.record.runId}`);
  } else {
    await cleanupManagedResources(run);
    if (provider === "docker") {
      const projects = [run.record.project, run.record.apisix?.project].filter(Boolean);
      console.log(`[test-resources] Cleaned exact project ${projects.join(", ")}`);
    } else {
      console.log(`[test-resources] Marked ${provider} run ${run.record.runId} cleaned (no Docker project to remove)`);
    }
  }
} catch (error) {
  console.error(formatResourceFailure(error));
  process.exitCode = 1;
}
