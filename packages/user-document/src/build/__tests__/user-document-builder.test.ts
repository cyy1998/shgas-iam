import { expect, test } from "bun:test";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { organization } from "../../__tests__/document-fixture";
import { UserDocumentEmploymentIntegrityError } from "../document-builder.core";
import { createDocumentBuilder } from "../document-builder.service";
import { at, builder, dataset, employment, org, position, user } from "./document-source.fixture";

const observedAt = new Date("2026-10-26T10:00:00.000Z");

test("builds one canonical document without management or duplicated business fields", async () => {
  const builder = createDocumentBuilder({
    buildRepository: {
      async loadByUserIds() {
        return {
          users: [
            {
              id: 1,
              subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
              username: "alice",
              name: "Alice",
              mobile: null,
              wxId: null,
              userType: UserType.Formal,
              status: UserStatus.Pause,
              isDelete: false,
              password: "must-not-publish",
              orderNum: 9,
              createTime: observedAt,
              updateTime: observedAt,
            },
          ],
          employments: [],
          positions: [],
          orgPathRows: [],
          roleRows: [],
          responsibilityRows: [],
        };
      },
    },
    clock: { nowDate: () => observedAt },
    config: { batchSize: 10 },
  });
  const publication = await builder.buildOne({ userId: 1, sourceVersion: "9007199254740993" });
  expect(publication).toEqual({
    userId: 1,
    subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
    schemaVersion: 1,
    sourceVersion: "9007199254740993",
    publishedAt: observedAt,
    document: {
      user: {
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Pause,
      },
      employments: [],
    },
  });
});

test("freezes effective employments at the half-open period and retains unavailable account documents", async () => {
  const source = dataset({
    users: [user(1, { status: UserStatus.Disable })],
    positions: [position()],
    orgPathRows: [org()],
    employments: [
      employment(1, { isPrimary: true }),
      employment(2, { startTime: new Date(at.getTime() + 1) }),
      employment(3, { endTime: at }),
      employment(4, { status: EmploymentStatus.Pause }),
      employment(5, { status: EmploymentStatus.Disable }),
      employment(6, { isDelete: true }),
    ],
  });
  const result = await builder(source).buildOne({ userId: 1, sourceVersion: "7" });
  expect(result?.document?.user.status).toBe(UserStatus.Disable);
  expect(result?.document?.employments).toHaveLength(1);
  expect(result?.document?.employments[0]).toMatchObject({ isPrimary: true, clientAuthorizations: [] });
});

test.each([
  { positions: [], orgPathRows: [org()], reason: "position-not-effective" },
  { positions: [position(1, { isDelete: true })], orgPathRows: [org()], reason: "position-not-effective" },
  { positions: [position()], orgPathRows: [], reason: "organization-not-effective" },
  {
    positions: [position()],
    orgPathRows: [org(1, { status: OrganizationStatus.Disable })],
    reason: "organization-not-effective",
  },
])("rejects the whole document when an open employment has $reason", async ({ positions, orgPathRows, reason }) => {
  const failure = await builder(
    dataset({
      positions: [...positions],
      orgPathRows: [...orgPathRows],
      employments: [employment(1, { status: EmploymentStatus.Pause })],
    }),
  )
    .buildOne({ userId: 1, sourceVersion: "7" })
    .catch((error) => error);
  expect(failure).toBeInstanceOf(UserDocumentEmploymentIntegrityError);
  expect(failure).toMatchObject({ userId: 1, employmentId: 1, reason });
});

test("orders current employments and Client-owned roles while preserving complete ancestor facts", async () => {
  const source = dataset({
    positions: [position(1), position(2)],
    employments: [employment(2, { orgId: 2, posId: 2 }), employment(1, { isPrimary: true })],
    orgPathRows: [
      org(1, { parentId: 10, level: OrganizationLevel.Two }),
      org(10, { descendantId: 1, depth: 1, status: OrganizationStatus.Pause }),
      org(2),
    ],
    roleRows: [
      { employmentId: 1, roleId: 3, roleCode: "beta-looking", clientCode: "alpha" },
      { employmentId: 1, roleId: 1, roleCode: "a", clientCode: "alpha" },
      { employmentId: 1, roleId: 2, roleCode: "alpha-looking", clientCode: "beta" },
    ],
  });
  const result = await builder(source).buildOne({ userId: 1, sourceVersion: "9007199254740993" });
  expect(result?.sourceVersion).toBe("9007199254740993");
  expect(result?.document?.employments.map((item) => item.position.code)).toEqual(["POS-1", "POS-2"]);
  expect(result?.document?.employments[0]?.clientAuthorizations).toEqual([
    { clientCode: "alpha", roles: [{ code: "a" }, { code: "beta-looking" }] },
    { clientCode: "beta", roles: [{ code: "alpha-looking" }] },
  ]);
  expect(result?.document?.employments[1]?.clientAuthorizations).toEqual([]);
  expect(result?.document?.employments[0]?.organization.path).toEqual([
    {
      code: "ORG-10",
      name: "Organization 10",
      type: OrganizationType.Department,
      level: OrganizationLevel.One,
      distanceToTarget: 1,
    },
    {
      code: "ORG-1",
      name: "Organization 1",
      type: OrganizationType.Department,
      level: OrganizationLevel.Two,
      distanceToTarget: 0,
    },
  ]);
});

test("publishes canonical responsibility facts and rejects a malformed complete path", async () => {
  const source = dataset({
    positions: [position()],
    orgPathRows: [org()],
    employments: [employment()],
    responsibilityRows: [
      {
        employmentId: 1,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganization: organization("target"),
      },
    ],
  });
  const result = await builder(source).buildOne({ userId: 1, sourceVersion: "8" });
  expect(result?.document?.employments[0]?.responsibilities).toEqual([
    {
      type: { code: OrganizationResponsibilityTypeCode.Head, name: "负责人" },
      targetOrganization: organization("target"),
    },
  ]);
  source.responsibilityRows[0]!.targetOrganization.path[0]!.code = "wrong";
  const failure = await builder(source)
    .buildOne({ userId: 1, sourceVersion: "8" })
    .catch((error) => error);
  expect(failure).toBeInstanceOf(Error);
});

test("only deleted users publish versioned tombstones", async () => {
  const results = await builder(
    dataset({
      users: [
        user(1, { isDelete: true }),
        user(2, { status: UserStatus.Pause }),
        user(3, { status: UserStatus.Disable }),
      ],
    }),
  ).buildMany([
    { userId: 1, sourceVersion: "9" },
    { userId: 2, sourceVersion: "9" },
    { userId: 3, sourceVersion: "9" },
  ]);
  expect(results[0]).toMatchObject({ userId: 1, sourceVersion: "9", document: null });
  expect(results.slice(1).map((item) => item.document?.user.status)).toEqual([UserStatus.Pause, UserStatus.Disable]);
});

test("rejects conflicting requested versions before building", async () => {
  const failure = await builder(dataset())
    .buildMany([
      { userId: 1, sourceVersion: "8" },
      { userId: 1, sourceVersion: "9" },
    ])
    .catch((error) => error);
  expect(failure).toBeInstanceOf(Error);
});

test("rejects invalid batch configuration before reading source rows", () => {
  for (const batchSize of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() =>
      createDocumentBuilder({
        buildRepository: { loadByUserIds: async () => dataset() },
        clock: { nowDate: () => at },
        config: { batchSize },
      }),
    ).toThrow(RangeError);
  }
});

test("orders publication results independently of source physical row order", async () => {
  const result = await builder(dataset({ users: [user(2), user(1)] })).buildMany([
    { userId: 1, sourceVersion: "1" },
    { userId: 2, sourceVersion: "1" },
  ]);
  expect(result.map((row) => row.userId)).toEqual([1, 2]);
});
