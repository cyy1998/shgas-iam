import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import {
  RoleAssignmentCreateDtoSchema,
  RoleAssignmentPaginationQueryDtoSchema,
  RoleCreateDtoSchema,
  RoleUpdateDtoSchema,
} from "@admin-api/services/role/role.schema";
import { createRoleService } from "@admin-api/services/role/role.service";
import { RoleAssignmentTargetType, RoleKind, RoleStatus, RoleType } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

// Keep Admin's private wiring in its own process. The API test consumes the persisted Outbox.
const databaseUrl = z.url().parse(process.env.IAM_ADMIN_API_TEST_DATABASE_URL);
const now = z.coerce.date().parse(process.argv[2]);
const operation = z
  .enum([
    "grant",
    "inclusions",
    "status",
    "delete-role",
    "assign-organization",
    "narrow-organization",
    "revoke-employment",
    "revoke-organization",
  ])
  .parse(process.argv[3]);
const globalRoleCode = "global:reviewer";
const rootRoleCode = "beta:root";
const client = postgres(databaseUrl, { max: 2 });
const db = drizzle({ client, relations });

try {
  const uow = createAdminApiUnitOfWork({
    db,
    logger: { error() {}, warn() {} },
    clock: { nowDate: () => now },
    organizationDocumentJobProducer: { enqueueOutboxEntries: async () => ({ enqueued: 0 }) },
    userDocumentJobProducer: { enqueueOutboxEntries: async () => ({ enqueued: 0, jobIds: [] }) },
  });
  const service = createRoleService({
    roleRepository: createAdminApiRepositories(db).role,
    uow: mapUnitOfWork(uow, (tx) => ({
      roleRepository: tx.repositories.role,
      auditService: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });

  if (operation === "grant") {
    const [primaryId, secondaryId] = z
      .tuple([z.coerce.number().int().positive(), z.coerce.number().int().positive()])
      .parse(process.argv.slice(4));
    for (const { employmentId, ...role } of [
      { employmentId: primaryId, roleCode: "alpha:reader", roleName: "Reader", clientCode: "alpha" },
      { employmentId: secondaryId, roleCode: "beta:editor", roleName: "Editor", clientCode: "beta" },
      {
        employmentId: primaryId,
        roleCode: rootRoleCode,
        roleName: "Root",
        clientCode: "beta",
        roleKind: RoleKind.Composite,
      },
    ]) {
      await service.createRole(RoleCreateDtoSchema.parse(role));
      await service.createAssignment(
        role.roleCode,
        RoleAssignmentCreateDtoSchema.parse({
          targetType: RoleAssignmentTargetType.Employment,
          employmentId,
        }),
      );
    }
    const bridge = await service.createRole(
      RoleCreateDtoSchema.parse({
        roleCode: "beta:bridge",
        roleName: "Bridge",
        clientCode: "beta",
        roleKind: RoleKind.Composite,
      }),
    );
    await service.createRole(
      RoleCreateDtoSchema.parse({
        roleCode: "beta:ancestor",
        roleName: "Ancestor",
        clientCode: "beta",
        roleKind: RoleKind.Composite,
      }),
    );
    await service.createRole(
      RoleCreateDtoSchema.parse({ roleCode: globalRoleCode, roleName: "Reviewer", roleType: RoleType.Global }),
    );
    await service.createRole(
      RoleCreateDtoSchema.parse({ roleCode: "alpha:approver", roleName: "Approver", clientCode: "alpha" }),
    );
    await service.updateRole(rootRoleCode, { inclusions: { addRoleIds: [bridge.result.id], removeRoleIds: [] } });
  } else if (operation === "inclusions") {
    const [containerCode, change, ...memberCodes] = process.argv.slice(4);
    const memberIds = await Promise.all(memberCodes.map(async (code) => (await service.getRoleDetailByCode(code)).id));
    const add = z.enum(["add", "remove"]).parse(change) === "add";
    await service.updateRole(
      z.string().parse(containerCode),
      RoleUpdateDtoSchema.parse({
        inclusions: { addRoleIds: add ? memberIds : [], removeRoleIds: add ? [] : memberIds },
      }),
    );
  } else if (operation === "status") {
    const roleCode = z.string().parse(process.argv[4]);
    const status = z.enum(["pause", "enable"]).parse(process.argv[5]);
    await service.updateRoleStatus(roleCode, status === "pause" ? RoleStatus.Pause : RoleStatus.Enable);
  } else if (operation === "delete-role") {
    await service.deleteRole(z.string().parse(process.argv[4]));
  } else if (operation === "assign-organization") {
    await service.createAssignment(
      rootRoleCode,
      RoleAssignmentCreateDtoSchema.parse({
        targetType: RoleAssignmentTargetType.Organization,
        orgCode: "ORG",
        includeDescendants: true,
      }),
    );
  } else {
    const targetType =
      operation === "revoke-employment" ? RoleAssignmentTargetType.Employment : RoleAssignmentTargetType.Organization;
    const page = await service.searchAssignments(
      rootRoleCode,
      RoleAssignmentPaginationQueryDtoSchema.parse({
        pageNum: 1,
        pageSize: 10,
        conditions: { fuzzyConditions: {}, exactConditions: { targetType } },
      }),
    );
    const [assignment] = page.result;
    if (!assignment || page.total !== 1) throw new Error("Expected a single assignment of the specified type");
    if (operation === "narrow-organization") {
      await service.updateAssignmentScope(rootRoleCode, assignment.id, false);
    } else {
      await service.deleteAssignment(rootRoleCode, assignment.id);
    }
  }
} finally {
  await client.end();
}
