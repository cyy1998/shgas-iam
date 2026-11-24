import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("the standalone supervisor initializes its embedded Job API before either launch or recovery", () => {
  const script = readFileSync(new URL("../windows-job-supervisor.ps1", import.meta.url), "utf8");
  const source = /\$jobApiSource = @'\r?\n([\s\S]+?)\r?\n'@/u.exec(script)?.[1];
  expect(source).toContain("public static class JobApi");

  const loadIndex = script.indexOf("Import-JobApi -Source $jobApiSource");
  expect(loadIndex).toBeGreaterThan(script.indexOf("public static class JobApi"));
  expect(loadIndex).toBeLessThan(script.indexOf('if ($PSCmdlet.ParameterSetName -eq "Recover")'));
  expect(loadIndex).toBeLessThan(script.indexOf("[IamOwnedProcess.JobApi]::CreateJobObject("));
});
