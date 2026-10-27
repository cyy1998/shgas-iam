import { expect, test } from "bun:test";
import { OrganizationReferenceSchema, UserDocumentSchema } from "../document";
import { OrganizationType } from "../enums/organization.type";
import { UserStatus } from "../enums/user.status";
import { UserType } from "../enums/user.type";

test("published organization references retain complete path coordinates and remove storage fields", () => {
  const organization = OrganizationReferenceSchema.parse({
    id: 31,
    code: "DEPT",
    name: "Department",
    type: OrganizationType.Department,
    path: [
      { id: 20, code: "ROOT", name: "Root", type: OrganizationType.Company, level: 1, distanceToTarget: 1 },
      { id: 31, code: "DEPT", name: "Department", type: OrganizationType.Department, level: 2, distanceToTarget: 0 },
    ],
  });
  expect(organization).toEqual({
    code: "DEPT",
    name: "Department",
    type: OrganizationType.Department,
    path: [
      { code: "ROOT", name: "Root", type: OrganizationType.Company, level: 1, distanceToTarget: 1 },
      { code: "DEPT", name: "Department", type: OrganizationType.Department, level: 2, distanceToTarget: 0 },
    ],
  });
});

test("public user documents expose an explicit field set, including null contact values", () => {
  const result = UserDocumentSchema.parse({
    userId: 42,
    user: {
      id: 42,
      subjectIdentifier: "11111111-1111-4111-8111-111111111111",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Disable,
      password: "private",
      futureStorageField: "private",
    },
    employments: [],
  });
  expect(result).toEqual({
    user: {
      subjectIdentifier: "11111111-1111-4111-8111-111111111111",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Disable,
    },
    employments: [],
  });
});

test("organization references reject incomplete or inconsistent path coordinates", () => {
  const reference = {
    code: "DEPT",
    name: "Department",
    type: OrganizationType.Department,
    path: [{ code: "DEPT", name: "Department", type: OrganizationType.Department, level: 2, distanceToTarget: 0 }],
  };
  expect(OrganizationReferenceSchema.safeParse(reference).success).toBe(false);
  expect(
    OrganizationReferenceSchema.safeParse({
      ...reference,
      path: [{ ...reference.path[0], level: 1, distanceToTarget: 1 }],
    }).success,
  ).toBe(false);
});
