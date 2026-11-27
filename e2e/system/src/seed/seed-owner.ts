import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  UserDocumentWorkStatus,
} from "@iam/contracts";
import type { db as database } from "@iam/db";
import {
  clients,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  roles,
  userDocumentRebuildStates,
  userDocuments,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { USER_DOCUMENT_SCHEMA_VERSION } from "@iam/documents/user/document";
import { createSubjectFactsRedisInspector } from "@iam/documents/user/subject-facts";
import type { CreateUserDocumentWorkerModuleInput } from "@iam/jobs/documents/user";
import { createUserDocumentWorkerModule } from "@iam/jobs/documents/user";
import { createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { hash as hashSecret } from "bcrypt-ts";
import { and, eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { E2EScenarioGeneratedReferences, E2EScenarioOwner, E2EScenarioSeedReferences } from "./seed.ts";
import { createE2ESeedSubjects } from "./seed.ts";
import {
  createSeedClients,
  createSeedPositions,
  createSeedUsers,
  seedEmployment,
  seedEmploymentRoleAssignment,
  seedRole,
} from "./seed-fixtures.ts";

export interface CreateProductionE2EScenarioOwnerInput {
  db: typeof database;
  redis: Redis;
  queueRedis: CreateUserDocumentWorkerModuleInput["redis"];
  clock: { nowDate: () => Date };
  random: { uuid: () => string };
  passwordHashCost: number;
}

export function createProductionE2EScenarioOwner(input: CreateProductionE2EScenarioOwnerInput): E2EScenarioOwner {
  const subjectAccess = createSubjectAccessBootstrap({
    redis: input.redis,
    random: input.random,
  });
  const subjectFactsInspector = createSubjectFactsRedisInspector(input.redis);

  async function establish(scenario: Parameters<E2EScenarioOwner["establish"]>[0]) {
    const { runId } = scenario;
    const passwordHash = await hashSecret(scenario.adminPassword, input.passwordHashCost);
    const generatedReferences = await input.db.transaction(async (tx): Promise<E2EScenarioGeneratedReferences> => {
      const clientRows = await tx
        .insert(clients)
        .values(createSeedClients(scenario, input))
        .returning({ id: clients.id, clientCode: clients.clientCode });
      const adminClient = clientRows.find((client) => client.clientCode === scenario.adminClientCode);
      const internalClient = clientRows.find((client) => client.clientCode === scenario.internalClientCode);
      if (!adminClient || !internalClient) throw new Error("E2E Admin or Internal Client was not created");

      async function insertOrg(
        orgCode: string,
        name: string,
        options: { parentId?: number; orgType?: OrganizationType } = {},
      ) {
        const { parentId, orgType = OrganizationType.Department } = options;
        const [organization] = await tx
          .insert(organizations)
          .values({
            orgCode,
            orgName: `E2E ${name} ${runId}`,
            parentId: parentId ?? -1,
            businessParentId: parentId ?? -1,
            path: "/pending",
            level: parentId === undefined ? OrganizationLevel.One : OrganizationLevel.Two,
            orgType,
            status: OrganizationStatus.Enable,
            isEntity: true,
          })
          .returning({ id: organizations.id });
        if (!organization) throw new Error(`E2E Organization ${orgCode} was not created`);
        const { id } = organization;
        const path = parentId === undefined ? `/${id}` : `/${parentId}/${id}`;
        await tx.update(organizations).set({ path }).where(eq(organizations.id, id));
        const closures = [{ ancestorId: id, descendantId: id, depth: 0 }];
        if (parentId !== undefined) closures.push({ ancestorId: parentId, descendantId: id, depth: 1 });
        await tx.insert(organizationClosures).values(closures);
        return id;
      }

      const organizationId = await insertOrg(scenario.organizationCode, "Organization", {
        orgType: OrganizationType.Company,
      });
      const holderOrgId = await insertOrg(scenario.responsibilityHolderOrganizationCode, "Responsibility Holder", {
        parentId: organizationId,
      });
      const targetOrgId = await insertOrg(scenario.responsibilityTargetOrganizationCode, "Responsibility Target");
      const secondScopeOrgId = await insertOrg(scenario.hrSecondScopeRootOrganizationCode, "HR Second Scope Root", {
        orgType: OrganizationType.Company,
      });
      const hrTargetOrgId = await insertOrg(
        scenario.hrResponsibilityTargetOrganizationCode,
        "HR Responsibility Target",
        {
          parentId: secondScopeOrgId,
        },
      );

      const positionRows = await tx
        .insert(positions)
        .values(createSeedPositions(scenario))
        .returning({ id: positions.id, posCode: positions.posCode });
      const positionIds = new Map(positionRows.map(({ posCode, id }) => [posCode, id]));
      const positionId = positionIds.get(scenario.positionCode);
      const holderPositionId = positionIds.get(scenario.responsibilityHolderPositionCode);
      const outsidePositionId = positionIds.get(scenario.outsideResponsibilityHolderPositionCode);
      if (!positionId || !holderPositionId || !outsidePositionId || !positionIds.has(scenario.globalPositionCode)) {
        throw new Error("E2E Positions were not created");
      }

      const userRows = await tx
        .insert(users)
        .values(createSeedUsers(scenario, passwordHash))
        .returning({ id: users.id, subjectIdentifier: users.subjectIdentifier });
      const userIds = new Map(userRows.map(({ subjectIdentifier, id }) => [subjectIdentifier, id]));
      const adminId = userIds.get(scenario.adminSubjectIdentifier);
      const hrAdminId = userIds.get(scenario.hrAdminSubjectIdentifier);
      const noScopeHrAdminId = userIds.get(scenario.noScopeHrAdminSubjectIdentifier);
      if (!adminId || !hrAdminId || !noScopeHrAdminId) throw new Error("E2E Admin subjects were not created");

      const employmentRows = await tx
        .insert(employments)
        .values([
          seedEmployment(adminId, organizationId, positionId, { isPrimary: true }),
          seedEmployment(adminId, holderOrgId, holderPositionId),
          seedEmployment(hrAdminId, holderOrgId, positionId, { isPrimary: true }),
          seedEmployment(hrAdminId, targetOrgId, outsidePositionId),
          seedEmployment(hrAdminId, secondScopeOrgId, positionId),
          seedEmployment(noScopeHrAdminId, organizationId, positionId, {
            isPrimary: true,
            status: EmploymentStatus.Pause,
          }),
        ])
        .returning({ id: employments.id, userId: employments.userId, orgId: employments.orgId });
      function employmentId(userId: number, orgId: number) {
        const row = employmentRows.find((employment) => employment.userId === userId && employment.orgId === orgId);
        if (!row) throw new Error(`E2E Employment for user ${userId} in organization ${orgId} was not created`);
        return row.id;
      }
      const adminEmploymentId = employmentId(adminId, organizationId);
      const responsibilityHolderEmploymentId = employmentId(adminId, holderOrgId);
      const hrRoleBearingEmploymentId = employmentId(hrAdminId, holderOrgId);
      const outsideResponsibilityHolderEmploymentId = employmentId(hrAdminId, targetOrgId);
      const hrSecondScopeEmploymentId = employmentId(hrAdminId, secondScopeOrgId);
      const noScopeHrEmploymentId = employmentId(noScopeHrAdminId, organizationId);

      const internalRoleCode = `${scenario.adminRoleCode}-internal`;
      const roleRows = await tx
        .insert(roles)
        .values([
          seedRole(scenario.adminRoleCode, "Admin", adminClient.id, runId),
          seedRole(scenario.hrAdminRoleCode, "HR Admin", adminClient.id, runId),
          seedRole(internalRoleCode, "Internal", internalClient.id, runId),
        ])
        .returning({ id: roles.id, roleCode: roles.roleCode });
      const roleIds = new Map(roleRows.map(({ roleCode, id }) => [roleCode, id]));
      const adminRoleId = roleIds.get(scenario.adminRoleCode);
      const hrRoleId = roleIds.get(scenario.hrAdminRoleCode);
      const internalRoleId = roleIds.get(internalRoleCode);
      if (!adminRoleId || !hrRoleId || !internalRoleId) throw new Error("E2E Roles were not created");

      const createdRoleAssignments = await tx
        .insert(roleAssignments)
        .values([
          seedEmploymentRoleAssignment(internalRoleId, adminEmploymentId),
          seedEmploymentRoleAssignment(adminRoleId, adminEmploymentId),
          seedEmploymentRoleAssignment(hrRoleId, hrRoleBearingEmploymentId),
          seedEmploymentRoleAssignment(hrRoleId, hrSecondScopeEmploymentId),
          seedEmploymentRoleAssignment(hrRoleId, adminEmploymentId),
          seedEmploymentRoleAssignment(hrRoleId, noScopeHrEmploymentId),
        ])
        .returning({ id: roleAssignments.id, roleId: roleAssignments.roleId, targetId: roleAssignments.targetId });
      const adminMixedRoleAssignment = createdRoleAssignments.find(
        (assignment) => assignment.roleId === hrRoleId && assignment.targetId === adminEmploymentId,
      );
      const hrSecondScopeRoleAssignment = createdRoleAssignments.find(
        (assignment) => assignment.targetId === hrSecondScopeEmploymentId,
      );
      if (!adminMixedRoleAssignment || !hrSecondScopeRoleAssignment) {
        throw new Error("E2E Admin mixed or HR second Scope Root Role Assignment was not created");
      }

      const [hiddenResponsibilityAssignment] = await tx
        .insert(organizationResponsibilityAssignments)
        .values({
          employmentId: outsideResponsibilityHolderEmploymentId,
          targetOrganizationId: hrTargetOrgId,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          status: OrganizationResponsibilityAssignmentStatus.Enable,
          startTime: input.clock.nowDate(),
          endTime: null,
        })
        .returning({ id: organizationResponsibilityAssignments.id });
      if (!hiddenResponsibilityAssignment) throw new Error("E2E hidden responsibility Assignment was not created");

      await tx.insert(userDocuments).values({
        userId: adminId,
        subjectIdentifier: scenario.adminSubjectIdentifier,
        // Deliberately noncurrent storage metadata exercises production backfill.
        schemaVersion: 2,
        sourceVersion: "1",
        document: {},
        publishedAt: input.clock.nowDate(),
      });

      return {
        adminMixedRoleAssignmentId: adminMixedRoleAssignment.id,
        hiddenResponsibilityAssignmentId: hiddenResponsibilityAssignment.id,
        hrSecondScopeRoleAssignmentId: hrSecondScopeRoleAssignment.id,
        outsideResponsibilityHolderEmploymentId,
        responsibilityHolderEmploymentId,
      };
    });

    const seedSubjects = createE2ESeedSubjects(scenario);
    await enqueueSeedUserDocuments(input, seedSubjects.length);

    await waitForPublishedUserDocuments(scenario);
    await seedSubjectAccess(seedSubjects);
    return generatedReferences;
  }

  async function seedSubjectAccess(subjects: ReturnType<typeof createE2ESeedSubjects>) {
    const access = await subjectAccess.seedMany(subjects, input.clock.nowDate());
    if (access.seeded !== subjects.length || access.retainedExisting !== 0) {
      throw new Error("E2E Subject Access bootstrap did not seed all users");
    }
  }

  async function waitForPublishedUserDocuments(references: E2EScenarioSeedReferences) {
    const deadline = Date.now() + 30_000;
    const subjectIdentifiers = createE2ESeedSubjects(references).map((subject) => subject.subjectIdentifier);
    while (Date.now() < deadline) {
      const rows = await readSeedDocumentStates(subjectIdentifiers);
      const documents = new Map(rows.map((row) => [row.subjectIdentifier, row]));
      const facts = await subjectFactsInspector.inspectMany(subjectIdentifiers);
      if (
        subjectIdentifiers.every((subjectIdentifier, index) => {
          const row = documents.get(subjectIdentifier);
          const result = facts[index];
          return (
            row !== undefined &&
            row.documentSchemaVersion === USER_DOCUMENT_SCHEMA_VERSION &&
            row.documentVersion === row.version &&
            row.rebuildStatus === UserDocumentWorkStatus.Processed &&
            result?.status === "valid" &&
            result.record.kind === "document" &&
            result.record.subjectIdentifier === subjectIdentifier &&
            result.record.sourceVersion === row.documentVersion
          );
        })
      ) {
        return;
      }
      await Bun.sleep(250);
    }
    throw new Error("E2E production Worker did not publish all v1 User Documents before the deadline");
  }

  async function readSeedDocumentStates(subjectIdentifiers: string[]) {
    return await input.db
      .select({
        subjectIdentifier: users.subjectIdentifier,
        documentVersion: userDocuments.sourceVersion,
        documentSchemaVersion: userDocuments.schemaVersion,
        version: userDocumentRebuildStates.version,
        rebuildStatus: userDocumentRebuildStates.status,
      })
      .from(users)
      .innerJoin(
        userDocuments,
        and(eq(userDocuments.userId, users.id), eq(userDocuments.subjectIdentifier, users.subjectIdentifier)),
      )
      .innerJoin(userDocumentRebuildStates, eq(userDocumentRebuildStates.userId, users.id))
      .where(inArray(users.subjectIdentifier, subjectIdentifiers));
  }

  return { establish };
}

async function enqueueSeedUserDocuments(
  input: Pick<CreateProductionE2EScenarioOwnerInput, "db" | "redis" | "queueRedis" | "clock">,
  count: number,
) {
  const documentModule = createUserDocumentWorkerModule({
    db: input.db,
    redis: input.queueRedis,
    subjectFactsRedis: input.redis,
    subjectAccessRepair: { repairSubject: async () => undefined },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    clock: input.clock,
    config: {
      concurrency: 1,
      rebuildBatchSize: 100,
      backfillBatchSize: 100,
    },
  });
  try {
    const backfill = await documentModule.maintenance.backfillAllUsers({ batchSize: 100 });
    if (backfill.enqueued !== count) throw new Error("E2E User Document backfill did not enqueue all seeded users");
  } finally {
    await documentModule.close();
  }
}
