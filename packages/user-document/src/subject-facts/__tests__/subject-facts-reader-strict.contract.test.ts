import { expect, mock, test } from "bun:test";
import { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { organization, publication } from "../../__tests__/document-fixture";
import { createDocumentFactsCacheRecord } from "../../document";
import { createSubjectFactsReader } from "../../subject-facts";

function row(version = "7") {
  const value = publication(1, version);
  value.document.employments = [
    {
      isPrimary: true,
      organization: organization("org"),
      position: { code: "position", name: "Position" },
      clientAuthorizations: [],
      responsibilities: [
        {
          type: { code: OrganizationResponsibilityTypeCode.Head, name: "负责人" },
          targetOrganization: organization("target"),
        },
      ],
    },
  ];
  return value;
}
function record(version = "7") {
  const value = createDocumentFactsCacheRecord(row(version));
  if (value.kind !== "document") throw new Error("Complete fixture required");
  return value;
}
function database(rows: unknown[]) {
  return { select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }) };
}
test("reads cached canonical paths and responsibilities without PostgreSQL", async () => {
  const select = mock(() => {
    throw new Error("Unexpected PG read");
  });
  const reader = createSubjectFactsReader({
    db: { select } as never,
    cache: { read: async () => JSON.stringify(record()), publish: async () => ({ status: "published" }) },
  });
  const facts = await reader.read(row().subjectIdentifier);
  expect(facts).toMatchObject({
    sourceVersion: "7",
    employments: [
      {
        organization: { path: [{ code: "org", level: 1, distanceToTarget: 0 }] },
        responsibilities: [
          {
            type: { code: OrganizationResponsibilityTypeCode.Head },
            targetOrganization: { path: [{ code: "target", level: 1, distanceToTarget: 0 }] },
          },
        ],
      },
    ],
  });
  expect(select).not.toHaveBeenCalled();
});
test("replaces a previous cache generation with Facts derived from the canonical published document", async () => {
  const published = record("8");
  const publish = mock(async () => ({ status: "published" as const }));
  const reader = createSubjectFactsReader({
    db: database([row("8")]) as never,
    cache: { read: async () => JSON.stringify({ ...published, schemaVersion: 4 }), publish },
  });
  const facts = await reader.read(published.subjectIdentifier);
  expect(facts).toMatchObject({
    sourceVersion: "8",
    profile: { username: "user-1" },
    employments: [{ position: { code: "position" } }],
  });
  expect(publish).toHaveBeenCalledWith(published);
});
test("fails closed rather than filling a malformed canonical responsibility", async () => {
  const malformed = row("9");
  malformed.document.employments[0]!.responsibilities[0]!.type.name = "noncanonical";
  const publish = mock(async () => ({ status: "published" as const }));
  const reader = createSubjectFactsReader({
    db: database([malformed]) as never,
    cache: { read: async () => null, publish },
  });
  const facts = await reader.read(malformed.subjectIdentifier);
  expect(facts).toBeNull();
  expect(publish).not.toHaveBeenCalled();
});
