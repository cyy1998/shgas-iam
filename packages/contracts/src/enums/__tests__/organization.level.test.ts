import { describe, expect, test } from "bun:test";
import { getChildOrganizationLevel, OrganizationLevel } from "../organization.level";

describe("getChildOrganizationLevel", () => {
  test("returns the first level for root organizations", () => {
    expect(getChildOrganizationLevel(null)).toBe(OrganizationLevel.One);
  });

  test("returns the next level for child organizations", () => {
    expect(getChildOrganizationLevel(OrganizationLevel.One)).toBe(OrganizationLevel.Two);
    expect(getChildOrganizationLevel(OrganizationLevel.Four)).toBe(OrganizationLevel.Five);
  });

  test("rejects children under the deepest organization level", () => {
    expect(() => getChildOrganizationLevel(OrganizationLevel.Five)).toThrow("组织层级已达到最大值");
  });
});
