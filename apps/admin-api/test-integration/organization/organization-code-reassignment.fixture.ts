import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { OrganizationType } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { OrganizationCreateDtoSchema } from "@iam/domain/organization";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

// Called by the API source-write contract in its random PostgreSQL schema.
// Keep Admin imports in the Admin package and exercise its actual mutation UoW.
const databaseUrl = z.url().parse(process.env.IAM_ADMIN_API_TEST_DATABASE_URL);
const mode = z.enum(["replace", "rename-only"]).parse(process.argv[2]);
const client = postgres(databaseUrl, { max: 2 });
const db = drizzle({ client, relations });
try {
  const repositories = createAdminApiRepositories(db);
  const uow = createAdminApiUnitOfWork({
    db,
    logger: { error() {}, warn() {} },
    clock: { nowDate: () => new Date("2026-10-14T00:00:00Z") },
    organizationSearchJobProducer: {
      async enqueueSourceChanges() {
        return { enqueued: 0 };
      },
    },
    userProfileJobProducer: {
      async enqueueRebuildJobs() {
        return { enqueued: 0, jobIds: [] };
      },
    },
  });
  const service = createOrganizationService({
    organizationRepository: repositories.organization,
    responsibilityReader: repositories.organizationResponsibility,
    uow: mapUnitOfWork(uow, (tx) => ({
      organizationRepository: tx.repositories.organization,
      auditService: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
      organizationSearchInvalidation: tx.organizationSearchInvalidation,
    })),
  });
  await service.updateOrganization("A", { orgCode: "B" });
  if (mode === "replace") {
    await service.setOrganization(
      OrganizationCreateDtoSchema.parse({
        orgCode: "A",
        orgName: "Replacement",
        orgType: OrganizationType.Company,
      }),
    );
    await service.setOrganization(
      OrganizationCreateDtoSchema.parse({
        orgCode: "A-CHILD",
        orgName: "Replacement child",
        orgType: OrganizationType.Department,
        parentCode: "A",
      }),
    );
  }
  process.stdout.write("Organization code reassignment committed\n");
} finally {
  await client.end();
}
