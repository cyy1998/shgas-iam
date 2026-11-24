import { expect, test } from "bun:test";
import { parsePlaywrightArguments } from "../playwright-arguments.ts";

test("strips runtime switches while forwarding native filters and flags in order", () => {
  expect(
    parsePlaywrightArguments([
      "--fresh",
      "hr-admin-user-management.spec.ts",
      "-g",
      "HR Admin",
      "--dev-frontend",
      "-x",
      "--keep",
      "--last-failed",
      "--ui",
    ]),
  ).toEqual({
    runtime: { fresh: true, devFrontend: true, keep: true },
    playwright: ["hr-admin-user-management.spec.ts", "-g", "HR Admin", "-x", "--last-failed", "--ui"],
  });
});

test("preserves the delimiter and every subsequent argument as a Playwright positional filter", () => {
  expect(parsePlaywrightArguments(["--keep", "--", "--fresh", "--dev-frontend", "--keep"])).toEqual({
    runtime: { fresh: false, devFrontend: false, keep: true },
    playwright: ["--", "--fresh", "--dev-frontend", "--keep"],
  });
});
