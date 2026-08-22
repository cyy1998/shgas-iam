import type { APIRequestContext } from "@playwright/test";
import {
  EmploymentStatus,
  PrivilegeDelegationStatus,
  UserStatus,
} from "@iam/contracts";
import { expect } from "@playwright/test";

const publicationTimeoutMs = 45_000;

interface InternalSearchInput {
  adminPrivilegeCode: string;
  adminRoleCode: string;
  adminUsername: string;
  delegateeUsername: string;
  disabledUsername: string;
  internalApiKey: string;
  organizationCode: string;
  origin: string;
  pausedUsername: string;
  positionCode: string;
  request: APIRequestContext;
  responsibilityHolderPositionCode: string;
}

export async function expectInternalUserProfileSearchMatrix(
  input: InternalSearchInput,
) {
  const allUsernames = [
    input.adminUsername,
    input.delegateeUsername,
    input.pausedUsername,
    input.disabledUsername,
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
  expect(readUsernames(unavailableProfiles)).toEqual([
    input.pausedUsername,
    input.disabledUsername,
  ]);

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
    input.delegateeUsername,
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
  expect(sameEmployment).toEqual([
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
          roles: [input.adminRoleCode],
          status: EmploymentStatus.Enable,
        }),
      ]),
      id: expect.any(Number),
      name: expect.any(String),
      privileges: [input.adminPrivilegeCode],
      roles: [input.adminRoleCode],
      status: UserStatus.Enable,
      username: input.adminUsername,
    }),
  ]);

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

export async function expectLegacyUserSearchEquivalence(input: {
  adminPrivilegeCode: string;
  adminUsername: string;
  clientCode: string;
  delegateeUsername: string;
  disabledUsername: string;
  internalApiKey: string;
  localSession: string;
  organizationCode: string;
  origin: string;
  pausedUsername: string;
  request: APIRequestContext;
}) {
  const usernames = [
    input.adminUsername,
    input.pausedUsername,
    input.disabledUsername,
  ];
  const [internalResponse, publicResponse] = await Promise.all([
    input.request.post(`${input.origin}/api/iam/internal/users/search`, {
      headers: { apikey: input.internalApiKey },
      data: { usernames },
    }),
    input.request.post(`${input.origin}/api/iam/public/users/search`, {
      headers: {
        Authorization: input.localSession,
        Client: encodeURIComponent(input.clientCode),
      },
      data: { usernames },
    }),
  ]);
  expect(internalResponse.status()).toBe(200);
  expect(publicResponse.status()).toBe(200);
  const internalUsers = readData(await internalResponse.json());
  const publicUsers = readData(await publicResponse.json());
  expect(readUsernames(internalUsers)).toEqual(usernames);
  expect(readUsernames(publicUsers)).toEqual(usernames);
  expect(publicUsers).toEqual(internalUsers);
  expect(readRecords(internalUsers).every(user => !("employments" in user)))
    .toBe(true);
  expect(readRecords(publicUsers).every(user => !("employments" in user)))
    .toBe(true);

  const now = Date.now();
  const createDelegationResponse = await input.request.post(
    `${input.origin}/api/iam/internal/delegations`,
    {
      headers: { apikey: input.internalApiKey },
      data: {
        delegateeUsername: input.delegateeUsername,
        delegatorUsername: input.adminUsername,
        description: "Full-system live delegation evidence",
        endTime: new Date(now + 60 * 60 * 1000).toISOString(),
        orgCode: input.organizationCode,
        privilegeCodes: [input.adminPrivilegeCode],
        startTime: new Date(now - 60 * 1000).toISOString(),
      },
    },
  );
  expect(createDelegationResponse.status()).toBe(200);
  const createdDelegation = readRecord(readData(
    await createDelegationResponse.json(),
  ));
  expect(createdDelegation).toMatchObject({
    delegateeUsername: input.delegateeUsername,
    delegatorUsername: input.adminUsername,
  });
  const delegationId = createdDelegation?.id;
  expect(delegationId).toEqual(expect.any(Number));

  const queryLiveDelegations = async () => {
    const response = await input.request.post(
      `${input.origin}/api/iam/internal/users/search-with-delegation`,
      {
        headers: { apikey: input.internalApiKey },
        data: {
          usernames: [input.adminUsername],
          ancestorOrgCodes: [input.organizationCode],
          privilegeCode: input.adminPrivilegeCode,
        },
      },
    );
    expect(response.status()).toBe(200);
    const data = readRecord(readData(await response.json()));
    expect(readUsernames(data?.users)).toEqual([input.adminUsername]);
    return readRecords(data?.delegations);
  };

  expect(await queryLiveDelegations()).toEqual([
    expect.objectContaining({
      delegateeUsername: input.delegateeUsername,
      delegatorUsername: input.adminUsername,
    }),
  ]);

  const pauseDelegationResponse = await input.request.patch(
    `${input.origin}/api/iam/internal/delegations/${String(delegationId)}`,
    {
      headers: { apikey: input.internalApiKey },
      data: { status: PrivilegeDelegationStatus.Pause },
    },
  );
  expect(pauseDelegationResponse.status()).toBe(200);

  expect(await queryLiveDelegations()).toEqual([]);
}

export async function waitForEmploymentSearchVisibility(input: {
  adminUsername: string;
  expected: boolean;
  internalApiKey: string;
  origin: string;
  positionCode: string;
  request: APIRequestContext;
}) {
  await expect.poll(async () => {
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
  }, { timeout: publicationTimeoutMs }).toBe(input.expected);
}

async function searchDsl(
  input: {
    internalApiKey: string;
    origin: string;
    request: APIRequestContext;
  },
  filter: unknown,
) {
  const response = await input.request.post(
    `${input.origin}/api/iam/internal/users/search-dsl`,
    {
      headers: { apikey: input.internalApiKey },
      data: { filter },
    },
  );
  expect(response.status()).toBe(200);
  return readData(await response.json());
}

function readData(value: unknown) {
  return readRecord(value)?.data;
}

function readUsernames(value: unknown) {
  const usernames = readRecords(value).map(item => item.username);
  return usernames.filter(
    (username): username is string => typeof username === "string",
  );
}

function readRecords(value: unknown) {
  if (!Array.isArray(value))
    return [];
  return value.map(readRecord)
    .filter((record): record is Record<string, unknown> => record !== undefined);
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
