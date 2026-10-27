import { expect, test } from "bun:test";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { createOrganizationDocumentQueryService } from "../organization-document.service";

test("directory detail and search expose the same published paused organization and strip storage fields", async () => {
  const document = {
    organization: {
      code: "ROOT",
      name: "Published name",
      type: OrganizationType.Department,
      level: 1,
      status: OrganizationStatus.Pause,
      isVirtual: false,
      isEntity: true,
      path: [
        { code: "ROOT", name: "Published name", type: OrganizationType.Department, level: 1, distanceToTarget: 0 },
      ],
    },
  };
  const query = createOrganizationDocumentQueryService({
    repository: {
      async searchCurrentDocuments() {
        return [{ id: 42, document }];
      },
      async getCurrentDocumentByCode() {
        return { id: 42, document };
      },
    },
  });
  const result = await query.getByCode("ROOT");
  const matches = await query.search({ filter: { field: "organization.code", op: "eq", value: "ROOT" } });
  expect(matches).toEqual([result]);
  expect(result.organization).not.toHaveProperty("id");
  expect(result.organization.path[0]).not.toHaveProperty("id");
  expect(result.organization.status).toBe(OrganizationStatus.Pause);
});
