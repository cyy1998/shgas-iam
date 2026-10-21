import { EmploymentStatus, UserStatus } from "@iam/contracts";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { expectClientDelegationJourney } from "./delegation-journey.ts";

const publicationTimeoutMs = 45_000;

interface InternalSearchInput {
  adminPrivilegeCode: string;
  adminRoleCode: string;
  adminUsername: string;
  delegateeUsername: string;
  disabledUsername: string;
  hrAdminUsername: string;
  hrAdminRoleCode: string;
  internalApiKey: string;
  noScopeHrAdminUsername: string;
  organizationCode: string;
  origin: string;
  pausedUsername: string;
  positionCode: string;
  request: APIRequestContext;
  responsibilityHolderPositionCode: string;
}

type InternalRequestInput = Pick<InternalSearchInput, "internalApiKey" | "origin" | "request">;

export async function expectInternalUserProfileSearchMatrix(input: InternalSearchInput) {
  const allUsernames = [
    input.adminUsername,
    input.hrAdminUsername,
    input.delegateeUsername,
    input.pausedUsername,
    input.disabledUsername,
    input.noScopeHrAdminUsername,
  ];
  const allProfiles = await searchDsl(input, {
    field: "user.username",
    op: "in",
    value: allUsernames,
  });
  expect(readUsernames(allProfiles)).toEqual(allUsernames);

  const unavailableProfiles = await searchDsl(input, {
    field: "user.status",
    op: "in",
    value: [UserStatus.Pause, UserStatus.Disable],
  });
  expect(readUsernames(unavailableProfiles)).toEqual([input.pausedUsername, input.disabledUsername]);

  const enabledProfile = await searchDsl(input, {
    and: [
      {
        field: "user.username",
        op: "in",
        value: allUsernames,
      },
      {
        field: "user.status",
        op: "eq",
        value: UserStatus.Enable,
      },
    ],
  });
  expect(readUsernames(enabledProfile)).toEqual([
    input.adminUsername,
    input.hrAdminUsername,
    input.delegateeUsername,
    input.noScopeHrAdminUsername,
  ]);

  const sameEmployment = await searchDsl(input, {
    exists: {
      path: "employments",
      where: {
        and: [
          {
            field: "organization.code",
            op: "eq",
            value: input.organizationCode,
          },
          {
            field: "position.code",
            op: "eq",
            value: input.positionCode,
          },
          {
            field: "roles",
            op: "containsAll",
            value: [input.adminRoleCode],
          },
          {
            field: "privileges",
            op: "containsAny",
            value: [input.adminPrivilegeCode],
          },
        ],
      },
    },
  });
  expectUserProfileBases(sameEmployment, [input.adminUsername]);

  const adminDetail = await readInternalUserDetail(input, input.adminUsername);
  expect(adminDetail).toEqual(
    expect.objectContaining({
      employments: expect.arrayContaining([
        expect.objectContaining({
          isPrimary: true,
          organization: expect.objectContaining({
            assignedOrg: expect.objectContaining({
              orgCode: input.organizationCode,
            }),
            companyNodes: expect.any(Array),
            fullOrgPath: expect.any(Array),
          }),
          position: expect.objectContaining({
            posCode: input.positionCode,
          }),
          privileges: [input.adminPrivilegeCode],
          responsibilities: expect.any(Array),
          roles: [input.adminRoleCode, input.hrAdminRoleCode],
          status: EmploymentStatus.Enable,
        }),
      ]),
      id: expect.any(Number),
      name: expect.any(String),
      privileges: [input.adminPrivilegeCode],
      roles: [input.adminRoleCode, input.hrAdminRoleCode],
      status: UserStatus.Enable,
      username: input.adminUsername,
    }),
  );

  const crossEmployment = await searchDsl(input, {
    exists: {
      path: "employments",
      where: {
        and: [
          {
            field: "position.code",
            op: "eq",
            value: input.responsibilityHolderPositionCode,
          },
          {
            field: "roles",
            op: "containsAny",
            value: [input.adminRoleCode],
          },
        ],
      },
    },
  });
  expect(crossEmployment).toEqual([]);

  const subtree = await searchDsl(input, {
    exists: {
      path: "employments",
      where: {
        and: [
          {
            field: "organization",
            op: "withinSubtreeOf",
            value: input.organizationCode,
          },
          {
            field: "position.code",
            op: "eq",
            value: input.responsibilityHolderPositionCode,
          },
        ],
      },
    },
  });
  expect(readUsernames(subtree)).toEqual([input.adminUsername]);

  const notExists = await searchDsl(input, {
    not: {
      exists: {
        path: "employments",
        where: {
          field: "position.code",
          op: "eq",
          value: "e2e-position-that-does-not-exist",
        },
      },
    },
  });
  expect(readUsernames(notExists)).toEqual(allUsernames);
}

export async function expectUserSearchDelegationResolution(input: {
  adminPassword: string;
  adminUsername: string;
  adminClientCode: string;
  delegateeUsername: string;
  hrAdminUsername: string;
  internalApiKey: string;
  internalClientCode: string;
  organizationCode: string;
  origin: string;
  page: Page;
  request: APIRequestContext;
}) {
  const profiles = await searchDsl(input, {
    field: "user.username",
    op: "eq",
    value: input.adminUsername,
  });
  expectUserProfileBases(profiles, [input.adminUsername]);
  await expectClientDelegationJourney(input);
}

export async function waitForEmploymentSearchVisibility(input: {
  adminUsername: string;
  expected: boolean;
  internalApiKey: string;
  origin: string;
  positionCode: string;
  request: APIRequestContext;
}) {
  await expect
    .poll(
      async () => {
        const profiles = await searchDsl(input, {
          exists: {
            path: "employments",
            where: {
              field: "position.code",
              op: "eq",
              value: input.positionCode,
            },
          },
        });
        return readUsernames(profiles).includes(input.adminUsername);
      },
      { timeout: publicationTimeoutMs },
    )
    .toBe(input.expected);
}

async function searchDsl(input: InternalRequestInput, filter: unknown) {
  const response = await input.request.post(`${input.origin}/api/iam/internal/users/search-dsl`, {
    headers: { apikey: input.internalApiKey },
    data: { filter },
  });
  expect(response.status()).toBe(200);
  const data = readData(await response.json());
  expect(Array.isArray(data)).toBe(true);
  if (!Array.isArray(data)) throw new Error("Internal user search requires a profile array");
  for (const profile of data) expect(typeof readRecord(profile)?.username).toBe("string");
  return data;
}

async function readInternalUserDetail(input: InternalRequestInput, username: string) {
  const response = await input.request.get(`${input.origin}/api/iam/internal/users/${encodeURIComponent(username)}`, {
    headers: { apikey: input.internalApiKey },
  });
  expect(response.status()).toBe(200);
  return readData(await response.json());
}

function expectUserProfileBases(value: unknown, usernames: string[]) {
  const profiles = readRecords(value);
  expect(readUsernames(profiles)).toEqual(usernames);
  expect(profiles).toHaveLength(usernames.length);
  for (const profile of profiles) {
    expect(Object.keys(profile).sort()).toEqual(["mobile", "name", "subjectIdentifier", "username", "wxId"]);
    expect(typeof profile.name).toBe("string");
    expect(typeof profile.subjectIdentifier).toBe("string");
    expect(profile.mobile === null || typeof profile.mobile === "string").toBe(true);
    expect(profile.wxId === null || typeof profile.wxId === "string").toBe(true);
  }
}

function readData(value: unknown) {
  return readRecord(value)?.data;
}

export function readUsernames(value: unknown) {
  return readRecords(value).map((item) => {
    if (typeof item.username !== "string") throw new Error("User profile requires a string username");
    return item.username;
  });
}

export function readRecords(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Expected a response data array");
  return value.map((item) => {
    const record = readRecord(item);
    if (record === undefined) throw new Error("Expected an object in the response data array");
    return record;
  });
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
