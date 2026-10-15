import { describe, expect, test } from "bun:test";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { OrganizationCreateDtoSchema } from "@iam/domain/organization";

describe("organization creation schema", () => {
  for (const status of [OrganizationStatus.Pause, OrganizationStatus.Disable]) {
    test(`explicit non-Enable creation ${status} is rejected by the creation schema`, () => {
      const input = {
        orgCode: "INVALID",
        orgName: "Invalid",
        orgType: OrganizationType.Department,
        path: "",
        level: OrganizationLevel.One,
        status,
      };
      expect(OrganizationCreateDtoSchema.safeParse(input).success).toBe(false);
      expect(OrganizationCreateDtoSchema.safeParse({ ...input, status: OrganizationStatus.Enable }).success).toBe(true);
    });
  }
});
