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
import { OrganizationResponsibilityIntegrityError } from "@iam/organization-responsibility-resolution";
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
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Pause,
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
  expect(result?.document?.status).toBe(UserStatus.Disable);
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
  expect(results.slice(1).map((item) => item.document?.status)).toEqual([UserStatus.Pause, UserStatus.Disable]);
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

test("shares a source read while returning independently built documents and tombstones", async () => {
  const reads: Array<{ userIds: number[]; at: Date }> = [];
  const source = dataset({ users: [user(2, { isDelete: true }), user(1)] });
  const subject = createDocumentBuilder({
    buildRepository: {
      async loadByUserIds(userIds, at) {
        reads.push({ userIds, at });
        return source;
      },
    },
    clock: { nowDate: () => observedAt },
    config: { batchSize: 10 },
  });

  const results = await subject.buildManyResults([
    { userId: 1, sourceVersion: "9007199254740993" },
    { userId: 2, sourceVersion: "8" },
  ]);

  expect(reads).toEqual([{ userIds: [1, 2], at: observedAt }]);
  expect(results).toMatchObject([
    {
      userId: 1,
      sourceVersion: "9007199254740993",
      status: "built",
      document: { publishedAt: observedAt, document: { username: "user-1" } },
    },
    { userId: 2, sourceVersion: "8", status: "built", document: { document: null } },
  ]);
});

test("isolates a broken employment from healthy users in the same source read", async () => {
  const results = await builder(
    dataset({
      users: [user(1), user(2)],
      employments: [employment(1), employment(2, { userId: 2, posId: 2 })],
      positions: [position(1)],
      orgPathRows: [org()],
    }),
  ).buildManyResults([
    { userId: 1, sourceVersion: "8" },
    { userId: 2, sourceVersion: "9" },
  ]);

  expect(results[0]).toMatchObject({ userId: 1, status: "built" });
  expect(results[1]).toMatchObject({ userId: 2, status: "failed" });
  if (results[1]?.status !== "failed") throw new Error("Expected failed user");
  expect(results[1].error).toBeInstanceOf(UserDocumentEmploymentIntegrityError);
});

test("reports missing source users explicitly without inventing a tombstone", async () => {
  const results = await builder(dataset()).buildManyResults([
    { userId: 1, sourceVersion: "8" },
    { userId: 2, sourceVersion: "9" },
  ]);
  expect(results).toMatchObject([
    { userId: 1, sourceVersion: "8", status: "built" },
    { userId: 2, sourceVersion: "9", status: "failed" },
  ]);
  expect("document" in results[1]!).toBe(false);
  // The strict reader's established missing-source behavior is retained.
  expect(await builder(dataset({ users: [] })).buildOne({ userId: 2, sourceVersion: "9" })).toBeNull();
});

test.each([
  { users: [user(1), user(1)], reason: "duplicate" },
  { users: [user(1), user(3)], reason: "unexpected" },
])("rejects $reason source users rather than accepting ambiguous coverage", async ({ users }) => {
  let failure: unknown;
  try {
    await builder(dataset({ users: [...users] })).buildManyResults([{ userId: 1, sourceVersion: "8" }]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
});

test("splits only deterministic source integrity failures and preserves the observation time", async () => {
  const observations: Date[] = [];
  const integrityError = new OrganizationResponsibilityIntegrityError("target-organization-missing");
  const subject = createDocumentBuilder({
    buildRepository: {
      async loadByUserIds(userIds, at) {
        observations.push(at);
        if (userIds.includes(2)) throw integrityError;
        return dataset({ users: userIds.map((id) => user(id)) });
      },
    },
    clock: { nowDate: () => observedAt },
    config: { batchSize: 10 },
  });
  const results = await subject.buildManyResults([
    { userId: 1, sourceVersion: "8" },
    { userId: 2, sourceVersion: "9" },
    { userId: 3, sourceVersion: "10" },
  ]);
  expect(results).toMatchObject([
    { userId: 1, status: "built" },
    { userId: 2, status: "failed", error: integrityError },
    { userId: 3, status: "built" },
  ]);
  expect(observations.length).toBeGreaterThan(1);
  expect(observations.every((at) => at === observedAt)).toBe(true);
});

test("propagates shared source read failures without issuing more queries", async () => {
  const databaseFailure = new Error("ConnectionUnavailable");
  let reads = 0;
  const subject = createDocumentBuilder({
    buildRepository: {
      async loadByUserIds() {
        reads += 1;
        throw databaseFailure;
      },
    },
    clock: { nowDate: () => observedAt },
    config: { batchSize: 10 },
  });
  let failure: unknown;
  try {
    await subject.buildManyResults([
      { userId: 1, sourceVersion: "8" },
      { userId: 2, sourceVersion: "9" },
    ]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBe(databaseFailure);
  expect(reads).toBe(1);
});

test.each(["before-start", "after-read", "integrity-failure"])(
  "cancels %s without continuing build batches or source-integrity isolation",
  async (stage) => {
    const controller = new AbortController();
    const reason = new Error("Build cancelled");
    let reads = 0;
    const subject = createDocumentBuilder({
      buildRepository: {
        async loadByUserIds(userIds, _at, signal) {
          expect(signal).toBe(controller.signal);
          reads += 1;
          controller.abort(reason);
          if (stage === "integrity-failure")
            throw new OrganizationResponsibilityIntegrityError("target-organization-missing");
          return dataset({ users: userIds.map((id) => user(id)) });
        },
      },
      clock: { nowDate: () => observedAt },
      config: { batchSize: stage === "integrity-failure" ? 10 : 1 },
      signal: controller.signal,
    });
    if (stage === "before-start") controller.abort(reason);
    const error = await subject
      .buildManyResults([
        { userId: 1, sourceVersion: "8" },
        { userId: 2, sourceVersion: "9" },
      ])
      .catch((error: unknown) => error);
    expect(error).toBe(reason);
    expect(reads).toBe(stage === "before-start" ? 0 : 1);
  },
);

test.each([
  {
    targets: [
      { userId: 1, sourceVersion: "8" },
      { userId: 1, sourceVersion: "8" },
    ],
  },
  {
    targets: [
      { userId: 1, sourceVersion: "8" },
      { userId: 1, sourceVersion: "9" },
    ],
  },
])("rejects duplicate targets before reading source rows", async ({ targets }) => {
  let reads = 0;
  const subject = createDocumentBuilder({
    buildRepository: {
      async loadByUserIds() {
        reads += 1;
        return dataset();
      },
    },
    clock: { nowDate: () => observedAt },
    config: { batchSize: 10 },
  });
  let failure: unknown;
  try {
    await subject.buildManyResults([...targets]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(reads).toBe(0);
});
