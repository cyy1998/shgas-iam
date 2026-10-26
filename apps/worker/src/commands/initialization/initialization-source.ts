import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { hashSecret, verifySecret } from "@iam/api-core/security";
import {
  ClientStatus,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
  UserStatus,
} from "@iam/contracts";
import type { DbTransaction, db as database } from "@iam/db";
import { clients, employments, organizationClosures, organizations, positions, roles, users } from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { InitializationInput, InitializationSecrets } from "./initialization-input";

const conflict = () => new Error("初始化目标已有其他或不一致的源事实；不会覆盖账户、Client、凭据或授权");

async function readExisting(tx: DbTransaction, input: InitializationInput, secrets: InitializationSecrets) {
  const [user] = await tx.select().from(users).where(eq(users.username, input.admin.username));
  if (!user) return undefined;
  if (
    user.isDelete ||
    user.status !== UserStatus.Enable ||
    user.name !== input.admin.name ||
    user.userType !== input.admin.userType ||
    !user.password ||
    !(await verifySecret(secrets.adminPassword, user.password))
  )
    throw conflict();
  const existingClients = await tx
    .select()
    .from(clients)
    .where(
      inArray(
        clients.clientCode,
        input.clients.map((item) => item.clientCode),
      ),
    );
  for (const expected of input.clients) {
    const actual = existingClients.find((item) => item.clientCode === expected.clientCode);
    const credentials = secrets.clients[expected.clientCode];
    if (
      !actual ||
      actual.isDelete ||
      actual.status !== ClientStatus.Enable ||
      actual.clientName !== expected.clientName ||
      actual.url !== expected.url ||
      !actual.ssoEnabled ||
      actual.clientSecret !== credentials.clientSecret ||
      actual.ssoSecret !== credentials.ssoSecret ||
      !actual.ssoCredentialId ||
      !actual.ssoSecretUpdatedAt ||
      !isDeepStrictEqual(actual.ssoConfig, expected.ssoConfig)
    )
      throw conflict();
  }
  const [organization] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.orgCode, input.organization.orgCode));
  const [position] = await tx.select().from(positions).where(eq(positions.posCode, input.position.posCode));
  if (
    !organization ||
    organization.isDelete ||
    organization.status !== OrganizationStatus.Enable ||
    organization.orgName !== input.organization.orgName ||
    organization.orgType !== input.organization.orgType ||
    organization.isEntity !== input.organization.isEntity ||
    organization.isVirtual !== input.organization.isVirtual ||
    organization.level !== OrganizationLevel.One ||
    organization.parentId !== -1 ||
    organization.businessParentId !== -1 ||
    organization.path !== `/${organization.id}` ||
    !position ||
    position.isDelete ||
    position.status !== PositionStatus.Enable ||
    position.posName !== input.position.posName
  )
    throw conflict();
  const [closure] = await tx
    .select()
    .from(organizationClosures)
    .where(
      and(
        eq(organizationClosures.ancestorId, organization.id),
        eq(organizationClosures.descendantId, organization.id),
        eq(organizationClosures.depth, 0),
      ),
    );
  const [employment] = await tx
    .select()
    .from(employments)
    .where(
      and(
        eq(employments.userId, user.id),
        eq(employments.orgId, organization.id),
        eq(employments.posId, position.id),
        eq(employments.status, EmploymentStatus.Enable),
        eq(employments.isDelete, false),
        eq(employments.isPrimary, true),
        isNull(employments.endTime),
      ),
    );
  const adminClient = existingClients.find((item) => item.clientCode === "iam-admin")!;
  const [role] = await tx
    .select()
    .from(roles)
    .where(
      and(
        eq(roles.clientId, adminClient.id),
        eq(roles.roleCode, "iam:admin"),
        eq(roles.status, RoleStatus.Enable),
        eq(roles.isDelete, false),
      ),
    );
  if (!closure || !employment || !role || role.roleName !== input.adminRoleName) throw conflict();
  const [assignment] = await tx
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.roleId, role.id),
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
        eq(roleAssignments.targetId, employment.id),
        eq(roleAssignments.includeDescendants, false),
      ),
    );
  if (!assignment) throw conflict();
  return { userId: user.id, subjectIdentifier: user.subjectIdentifier };
}

export async function initializeSourceFacts(
  db: typeof database,
  input: InitializationInput,
  secrets: InitializationSecrets,
) {
  const password = await hashSecret(secrets.adminPassword, 12);
  return db.transaction(
    async (tx) => {
      const existing = await readExisting(tx, input, secrets);
      if (existing) return { created: false, ...existing };
      const [state] = await tx
        .select({
          occupied: sql<boolean>`exists(select 1 from ${users}) or exists(select 1 from ${clients})
      or exists(select 1 from ${organizations}) or exists(select 1 from ${positions}) or exists(select 1 from ${employments})
      or exists(select 1 from ${roles}) or exists(select 1 from ${roleAssignments}) or exists(select 1 from ${organizationClosures})`,
        })
        .from(sql`(values (1)) as initialization_input(value)`);
      if (state?.occupied) throw conflict();
      const transactionTime = new Date();
      const createdClients = await tx
        .insert(clients)
        .values(
          input.clients.map((client) => ({
            ...client,
            ...secrets.clients[client.clientCode],
            extAttributes: {},
            ssoEnabled: true,
            status: ClientStatus.Enable,
            ssoCredentialId: randomUUID(),
            ssoSecretUpdatedAt: transactionTime.toISOString(),
          })),
        )
        .returning({ id: clients.id, clientCode: clients.clientCode });
      const [organization] = await tx
        .insert(organizations)
        .values({
          ...input.organization,
          path: "/",
          level: OrganizationLevel.One,
          status: OrganizationStatus.Enable,
        })
        .returning({ id: organizations.id });
      await tx
        .update(organizations)
        .set({ path: `/${organization!.id}` })
        .where(eq(organizations.id, organization!.id));
      await tx
        .insert(organizationClosures)
        .values({ ancestorId: organization!.id, descendantId: organization!.id, depth: 0 });
      const [position] = await tx
        .insert(positions)
        .values({ ...input.position, status: PositionStatus.Enable })
        .returning({ id: positions.id });
      const [user] = await tx
        .insert(users)
        .values({ ...input.admin, password, status: UserStatus.Enable })
        .returning({ id: users.id, subjectIdentifier: users.subjectIdentifier });
      const [employment] = await tx
        .insert(employments)
        .values({
          userId: user!.id,
          posId: position!.id,
          orgId: organization!.id,
          isPrimary: true,
          startTime: transactionTime,
          status: EmploymentStatus.Enable,
        })
        .returning({ id: employments.id });
      const [role] = await tx
        .insert(roles)
        .values({
          clientId: createdClients.find((item) => item.clientCode === "iam-admin")!.id,
          roleCode: "iam:admin",
          roleName: input.adminRoleName,
          status: RoleStatus.Enable,
        })
        .returning({ id: roles.id });
      await tx.insert(roleAssignments).values({
        roleId: role!.id,
        targetType: RoleAssignmentTargetType.Employment,
        targetId: employment!.id,
        includeDescendants: false,
      });
      return { created: true, userId: user!.id, subjectIdentifier: user!.subjectIdentifier };
    },
    { isolationLevel: "serializable" },
  );
}

export async function verifyInitializationSource(
  db: typeof database,
  input: InitializationInput,
  secrets: InitializationSecrets,
) {
  return db.transaction(
    async (tx) => {
      const source = await readExisting(tx, input, secrets);
      if (!source) throw conflict();
      return source;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
