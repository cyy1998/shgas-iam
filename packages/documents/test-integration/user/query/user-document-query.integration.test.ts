import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { OrganizationResponsibilityTypeCode, OrganizationType, UserStatus, UserType } from "@iam/contracts";
import { sql } from "drizzle-orm";
import type { StoredUserDocument } from "../../../src/user/document";
import {
  compileUserDocumentFilter,
  createClientUserDocumentSql,
  projectUserDocument,
} from "../../../src/user/document-query";
import type { PostgresTestHarness } from "../support/postgres-test-harness";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

let harness: PostgresTestHarness;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
  await harness.sql.unsafe(
    "CREATE TABLE document_query_fixture (user_id integer PRIMARY KEY, document jsonb NOT NULL)",
  );
});

beforeEach(async () => {
  await harness.sql.unsafe("TRUNCATE TABLE document_query_fixture");
});

afterAll(async () => {
  await harness?.close();
});

test("role filtering and complete documents observe only the authenticated Client's ownership", async () => {
  await insertDocument(1, alice);
  const filter = {
    exists: { path: "employments", where: { field: "roles", op: "containsAny", value: ["alpha.secret"] } },
  };

  const hidden = await search("alpha", filter);
  const visible = await search("beta", filter);

  expect(hidden).toEqual([]);
  expect(visible).toHaveLength(1);
  expect(visible[0]?.employments.map((employment) => employment.roles)).toEqual([
    ["alpha.secret"],
    ["beta.secret"],
    [],
  ]);
  expect(projectUserDocument(alice, "alpha").employments.map((employment) => employment.roles)).toEqual([
    ["beta.owned"],
    ["operator"],
    [],
  ]);
});

test("boolean role predicates retain Client visibility and the same-employment scope", async () => {
  await insertDocument(1, alice);
  const north = { field: "organization.code", op: "eq", value: "north" };
  const operator = { field: "roles", op: "containsAny", value: ["operator"] };
  const secret = {
    exists: { path: "employments", where: { field: "roles", op: "containsAny", value: ["alpha.secret"] } },
  };

  const sameEmployment = await search("alpha", { exists: { path: "employments", where: { and: [north, operator] } } });
  const independentEmployments = await search("alpha", {
    and: [{ exists: { path: "employments", where: north } }, { exists: { path: "employments", where: operator } }],
  });
  const missingBothInOne = await search("alpha", {
    exists: { path: "employments", where: { field: "roles", op: "containsAll", value: ["beta.owned", "operator"] } },
  });
  const isolatedNegation = await search("alpha", {
    and: [{ not: secret }, { or: [secret, { exists: { path: "employments", where: operator } }] }],
  });
  const otherClientNegation = await search("beta", { not: secret });

  expect(sameEmployment).toEqual([]);
  expect(independentEmployments.map((document) => document.username)).toEqual(["alice"]);
  expect(missingBothInOne).toEqual([]);
  expect(isolatedNegation.map((document) => document.username)).toEqual(["alice"]);
  expect(otherClientNegation).toEqual([]);
});

test("organization paths and responsibility targets use the same public level and distance facts", async () => {
  const responsible = structuredClone(alice);
  responsible.employments[0]!.responsibilities = [
    {
      type: { code: OrganizationResponsibilityTypeCode.Head, name: "负责人" },
      targetOrganization: organization("target"),
    },
  ];
  await insertDocument(1, responsible);
  const byPath = await search("alpha", {
    exists: {
      path: "employments",
      where: {
        and: [
          { exists: { path: "organization.path", where: { field: "code", op: "eq", value: "root" } } },
          {
            exists: {
              path: "organization.path",
              where: {
                and: [
                  { field: "code", op: "eq", value: "root" },
                  { field: "level", op: "eq", value: 1 },
                  { field: "distanceToTarget", op: "eq", value: 1 },
                ],
              },
            },
          },
          {
            exists: {
              path: "responsibilities",
              where: {
                and: [
                  { field: "type.code", op: "eq", value: "head" },
                  { exists: { path: "targetOrganization.path", where: { field: "code", op: "eq", value: "target" } } },
                  {
                    exists: {
                      path: "targetOrganization.path",
                      where: {
                        and: [
                          { field: "code", op: "eq", value: "target" },
                          { field: "level", op: "eq", value: 2 },
                          { field: "distanceToTarget", op: "eq", value: 0 },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  const outsidePath = await search("alpha", {
    exists: {
      path: "employments",
      where: {
        exists: { path: "organization.path", where: { field: "distanceToTarget", op: "eq", value: 99 } },
      },
    },
  });

  expect(byPath.map((document) => document.username)).toEqual(["alice"]);
  expect(byPath[0]?.employments[0]?.responsibilities).toEqual([
    {
      type: { code: OrganizationResponsibilityTypeCode.Head, name: "负责人" },
      targetOrganization: organization("target"),
    },
  ]);
  expect(outsidePath).toEqual([]);
});

test("null predicates remain two-valued and Client or filter strings cannot change SQL meaning", async () => {
  await insertDocument(1, alice);
  const equalsMissingMobile = { field: "mobile", op: "eq", value: "13800000000" };
  const positive = await search("alpha", equalsMissingMobile);
  const negative = await search("alpha", { not: equalsMissingMobile });
  const injectedClient = await search("alpha' OR TRUE --", {
    exists: { path: "employments", where: { field: "roles", op: "containsAny", value: ["alpha.secret"] } },
  });
  const injectedValue = await search("alpha", { field: "username", op: "eq", value: "alice' OR TRUE --" });

  expect(positive).toEqual([]);
  expect(negative.map((document) => document.username)).toEqual(["alice"]);
  expect(injectedClient).toEqual([]);
  expect(injectedValue).toEqual([]);
});

async function insertDocument(userId: number, document: StoredUserDocument) {
  await harness.sql`INSERT INTO document_query_fixture (user_id, document) VALUES (${userId}, ${JSON.stringify(document)}::jsonb)`;
}

async function search(clientCode: string, filter: unknown) {
  const document = sql`document`;
  const visibleDocument = createClientUserDocumentSql(document, clientCode);
  const condition = compileUserDocumentFilter(filter, document, clientCode);
  const rows = await harness.db.execute<{ document: StoredUserDocument; visible: unknown }>(sql`
    SELECT document, ${visibleDocument} AS visible
    FROM document_query_fixture
    WHERE ${condition}
    ORDER BY user_id
  `);
  return rows.map((row) => {
    const projected = projectUserDocument(row.document, clientCode);
    expect(row.visible).toEqual(projected);
    return projected;
  });
}

function organization(code: string) {
  return {
    code,
    name: code,
    type: OrganizationType.Department,
    path: [
      { code: "root", name: "Root", type: OrganizationType.Department, level: 1, distanceToTarget: 1 },
      { code, name: code, type: OrganizationType.Department, level: 2, distanceToTarget: 0 },
    ],
  };
}

const alice: StoredUserDocument = {
  subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
  username: "alice",
  name: "Alice",
  mobile: null,
  wxId: null,
  userType: UserType.Formal,
  status: UserStatus.Pause,
  employments: [
    {
      isPrimary: true,
      organization: organization("north"),
      position: { code: "lead", name: "Lead" },
      responsibilities: [],
      clientAuthorizations: [
        { clientCode: "alpha", roles: [{ code: "beta.owned" }] },
        { clientCode: "beta", roles: [{ code: "alpha.secret" }] },
      ],
    },
    {
      isPrimary: false,
      organization: organization("south"),
      position: { code: "staff", name: "Staff" },
      responsibilities: [],
      clientAuthorizations: [
        { clientCode: "alpha", roles: [{ code: "operator" }] },
        { clientCode: "beta", roles: [{ code: "beta.secret" }] },
      ],
    },
    {
      isPrimary: false,
      organization: organization("west"),
      position: { code: "guest", name: "Guest" },
      responsibilities: [],
      clientAuthorizations: [],
    },
  ],
};
