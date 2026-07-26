import { join, resolve } from "node:path";
import process from "node:process";
import { analyzeRepositoryArchitecture } from "./architecture-guard";

const repoRoot = resolve(process.argv[2] ?? join(import.meta.dirname, ".."));
const violations = analyzeRepositoryArchitecture(repoRoot);

if (violations.length === 0) {
  console.log("Architecture guard passed: no violations.");
}
else {
  console.error(`Architecture guard failed with ${violations.length} ${
    violations.length === 1 ? "violation" : "violations"
  }:`);
  for (const violation of violations) {
    console.error(
      `- [${violation.ruleId}] ${violation.file}:${violation.line} ${violation.message}`,
    );
  }
  process.exitCode = 1;
}
