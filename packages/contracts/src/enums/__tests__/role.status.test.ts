import { describe, expect, test } from "bun:test";
import { getRoleStatusOptions, RoleStatus, roleStatusToString } from "../role.status";

describe("RoleStatus helpers", () => {
  test("maps status values to display labels", () => {
    expect(roleStatusToString).toEqual({
      [RoleStatus.Enable]: "正常",
      [RoleStatus.Pause]: "暂停",
      [RoleStatus.Disable]: "停用",
    });
  });

  test("returns status options with stable values and colors", () => {
    expect(getRoleStatusOptions()).toEqual([
      { label: "正常", value: RoleStatus.Enable, color: "success" },
      { label: "暂停", value: RoleStatus.Pause, color: "warning" },
      { label: "停用", value: RoleStatus.Disable, color: "default" },
    ]);
  });
});
