import { expect, test } from "bun:test";
import { OrganizationDocumentSchema, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createOrganizationDocumentQueryService } from "../organization-document.service";

test("directory detail and search expose the same published paused organization and strip storage fields", async () => {
  const document = {
    code: "ROOT",
    name: "Published name",
    type: OrganizationType.Department,
    level: 1,
    status: OrganizationStatus.Pause,
    isVirtual: false,
    isEntity: true,
    path: [{ code: "ROOT", name: "Published name", type: OrganizationType.Department, level: 1, distanceToTarget: 0 }],
  };
  const query = createOrganizationDocumentQueryService({
    repository: {
      async searchCurrentDocuments() {
        return { rows: [{ id: 42, document }], total: 1 };
      },
      async getCurrentDocumentByCode() {
        return { id: 42, document };
      },
    },
  });
  const result = await query.getByCode("ROOT");
  const matches = await query.search({
    select: Object.keys(OrganizationDocumentSchema.shape),
    filter: { field: "code", op: "eq", value: "ROOT" },
  });
  expect(matches.items).toEqual([result]);
  expect(result).not.toHaveProperty("id");
  expect(result.path[0]).not.toHaveProperty("id");
  expect(result.status).toBe(OrganizationStatus.Pause);
});
