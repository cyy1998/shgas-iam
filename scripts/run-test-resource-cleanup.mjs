#!/usr/bin/env node
import "./require-linux.mjs";
import process from "node:process";
import {
  cleanupManagedResources,
  formatResourceFailure,
  readManagedResourceRun,
} from "./test-resources/managed-resources.mjs";

try {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.length !== 2 || args[0] !== "--record") throw new Error("Expected --record <repository-relative run.json>");
  const run = await readManagedResourceRun(process.cwd(), args[1]);
  await cleanupManagedResources(run);
  const projects = [run.record.project, run.record.apisix?.project].filter(Boolean);
  console.log(`[test-resources] Cleaned exact project ${projects.join(", ")}`);
} catch (error) {
  console.error(formatResourceFailure(error));
  process.exitCode = 1;
}
