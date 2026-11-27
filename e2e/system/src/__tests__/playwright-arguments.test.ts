import { expect, test } from "bun:test";
import { parsePlaywrightArguments } from "../runtime/cli.ts";

test("strips runtime switches while forwarding native filters and flags in order", () => {
  expect(
    parsePlaywrightArguments([
      "--skip-build",
      "hr-admin-user-management.spec.ts",
      "-g",
      "HR Admin",
      "-x",
      "--keep",
      "--last-failed",
      "--ui",
    ]),
  ).toEqual({
    runtime: { skipBuild: true, keep: true },
    playwright: ["hr-admin-user-management.spec.ts", "-g", "HR Admin", "-x", "--last-failed", "--ui"],
  });
});

test("preserves the delimiter and every subsequent argument as a Playwright positional filter", () => {
  expect(parsePlaywrightArguments(["--keep", "--", "--skip-build", "--keep"])).toEqual({
    runtime: { skipBuild: false, keep: true },
    playwright: ["--", "--skip-build", "--keep"],
  });
});
