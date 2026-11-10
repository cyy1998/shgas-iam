import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { RoleAssignmentCreateDtoSchema, RoleCreateDtoSchema } from "@admin-api/services/role/role.schema";
import { createRoleService } from "@admin-api/services/role/role.service";
import { RoleAssignmentTargetType, RoleStatus, RoleType } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

// Keep Admin's private wiring in its own process. The API test consumes the persisted Outbox.
const databaseUrl = z.url().parse(process.env.IAM_ADMIN_API_TEST_DATABASE_URL);
const now = z.coerce.date().parse(process.argv[2]);
const operation = z.enum(["grant", "disable"]).parse(process.argv[3]);
const globalRoleCode = "global:reviewer";
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
      { employmentId: primaryId, roleCode: globalRoleCode, roleName: "Reviewer", roleType: RoleType.Global },
      { employmentId: primaryId, roleCode: "alpha:reader", roleName: "Reader", clientCode: "alpha" },
      { employmentId: secondaryId, roleCode: "beta:editor", roleName: "Editor", clientCode: "beta" },
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
  } else {
    await service.updateRoleStatus(globalRoleCode, RoleStatus.Disable);
  }
} finally {
  await client.end();
}
