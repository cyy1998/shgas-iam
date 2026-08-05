import { resolve } from "node:path";
import { analyzeTestCollections } from "./test-collection-guard";

const repoRoot = resolve(process.argv[2] ?? import.meta.dirname, process.argv[2] ? "." : "..");
const issues = await analyzeTestCollections(repoRoot);

if (issues.length > 0) {
  for (const issue of issues)
    console.error(`[${issue.code}] ${issue.message}`);
  process.exit(1);
}

console.log("Test collection guard passed.");
