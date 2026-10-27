import { expect, test } from "bun:test";
import { OrganizationType, UserStatus, UserType } from "@iam/contracts";
import type { PublishedUserDocument } from "../../document";
import { createDocumentFactsCacheRecord } from "../../document";
import {
  deriveDocumentLoginProfile,
  projectPublishedUserDocument,
  projectUserDocument,
  UserDocumentSearchRequestSchema,
} from "../../document-query";

test("published detail, login profile and Facts derive from one precise document version", () => {
  const document = projectPublishedUserDocument(published, "alpha");
  const login = deriveDocumentLoginProfile(published);
  const facts = createDocumentFactsCacheRecord(published);

  expect(document).toEqual({
    subjectIdentifier: "11111111-1111-4111-8111-111111111111",
    username: "alice",
    name: "Alice",
    mobile: null,
    wxId: null,
    userType: UserType.Formal,
    status: UserStatus.Disable,
    employments: [
      {
        isPrimary: true,
        organization,
        position: { code: "lead", name: "Lead" },
        responsibilities: [],
        roles: ["reader"],
      },
    ],
  });
  expect(login).toEqual({ username: "alice", name: "Alice", mobile: null });
  expect(facts).toMatchObject({
    kind: "document",
    userId: 42,
    sourceVersion: "9007199254740993",
    facts: {
      profile: { username: "alice", name: "Alice", phone: null },
      employments: [
        {
          clientAuthorizations: [
            { clientCode: "alpha", roles: [{ code: "reader" }] },
            { clientCode: "beta", roles: [{ code: "secret" }] },
          ],
        },
      ],
    },
  });
  expect(projectPublishedUserDocument({ ...published, document: null }, "alpha")).toBeNull();
  expect(deriveDocumentLoginProfile({ ...published, document: null })).toBeNull();
});

test("public requests cannot select a Client or query internal ownership and identity paths", () => {
  const byUsername = { filter: { field: "username", op: "eq", value: "alice" } };
  expect(UserDocumentSearchRequestSchema.safeParse(byUsername).success).toBe(true);
  expect(UserDocumentSearchRequestSchema.safeParse({ ...byUsername, clientCode: "beta" }).success).toBe(false);
  expect(UserDocumentSearchRequestSchema.safeParse({ filter: { field: "id", op: "eq", value: 42 } }).success).toBe(
    false,
  );
  expect(
    UserDocumentSearchRequestSchema.safeParse({
      filter: {
        exists: { path: "employments", where: { field: "clientAuthorizations.clientCode", op: "eq", value: "beta" } },
      },
    }).success,
  ).toBe(false);
  expect(
    UserDocumentSearchRequestSchema.safeParse({
      filter: {
        exists: { path: "employments.clientAuthorizations", where: { field: "clientCode", op: "eq", value: "beta" } },
      },
    }).success,
  ).toBe(false);
});

test("public projection strips storage-only fields from nested organization references", () => {
  const source = {
    ...published.document!,
    employments: published.document!.employments.map((employment) => ({
      ...employment,
      organization: { ...employment.organization, internalOrganizationId: 99 },
    })),
  };
  const projected = projectUserDocument(source, "unknown-client");
  expect(projected.employments[0]?.organization).toEqual(organization);
  expect(projected.employments[0]?.roles).toEqual([]);
});

const organization = {
  code: "root",
  name: "Root",
  type: OrganizationType.Department,
  path: [{ code: "root", name: "Root", type: OrganizationType.Department, level: 1, distanceToTarget: 0 }],
};
const published: PublishedUserDocument = {
  userId: 42,
  subjectIdentifier: "11111111-1111-4111-8111-111111111111",
  schemaVersion: 1,
  sourceVersion: "9007199254740993",
  publishedAt: new Date("2026-10-26T00:00:00Z"),
  document: {
    subjectIdentifier: "11111111-1111-4111-8111-111111111111",
    username: "alice",
    name: "Alice",
    mobile: null,
    wxId: null,
    userType: UserType.Formal,
    status: UserStatus.Disable,
    employments: [
      {
        isPrimary: true,
        organization,
        position: { code: "lead", name: "Lead" },
        responsibilities: [],
        clientAuthorizations: [
          { clientCode: "alpha", roles: [{ code: "reader" }] },
          { clientCode: "beta", roles: [{ code: "secret" }] },
        ],
      },
    ],
  },
};
