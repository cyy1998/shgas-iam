import { describe, expect, test } from "bun:test";
import { parseAuditActionMaintenanceArgs } from "../audit-action-maintenance";

describe("audit action maintenance arguments", () => {
  test.each([
    ["inventory", ["inventory"]],
    ["verify", ["verify"]],
    ["apply", ["apply", "--writers-stopped"]],
    ["apply", ["--", "apply", "--", "--writers-stopped"]],
  ] as const)("accepts %s with its required writer guard", (mode, args) => {
    expect(parseAuditActionMaintenanceArgs(args)).toBe(mode);
  });

  test.each([
    [[]],
    [["apply"]],
    [["verify", "--writers-stopped"]],
    [["inventory", "extra"]],
    [["apply", "--writers-stopped", "extra"]],
  ])("rejects invalid arguments %j before any resource is needed", (args) => {
    expect(parseAuditActionMaintenanceArgs(args)).toBeUndefined();
  });
});
