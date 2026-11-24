import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("the standalone supervisor initializes its embedded Job API before either launch or recovery", () => {
  const script = readFileSync(new URL("../windows-job-supervisor.ps1", import.meta.url), "utf8");
  const embeddedSource = /\$jobApiSource = @'\r?\n([\s\S]+?)\r?\n'@/u.exec(script);
  if (!embeddedSource) throw new Error("Windows Job API source is missing");
  expect(embeddedSource[1]).toContain("public static class JobApi");

  const statements = script.slice(embeddedSource.index + embeddedSource[0].length).replace(/<#[\s\S]*?#>/gu, "");
  const load = /^[ \t]*Import-JobApi -Source \$jobApiSource\b/mu.exec(statements);
  if (!load) throw new Error("Windows Job API initialization is missing");
  expect(load.index).toBeLessThan(statements.indexOf('if ($PSCmdlet.ParameterSetName -eq "Recover")'));
  expect(load.index).toBeLessThan(statements.indexOf("[IamOwnedProcess.JobApi]::CreateJobObject("));
});
