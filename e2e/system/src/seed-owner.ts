import type { db as database } from "@iam/db";
import type { Redis } from "ioredis";
import type { E2EScenarioOwner, E2EScenarioReferences } from "./seed.ts";
import { hashSecret } from "@iam/api-core/security";
import { createSubjectAccessBootstrap } from "@iam/api-core/subject-access";
import {
  ClientStatus,
  CustomSsoClientMode,
  EmploymentStatus,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
  SubjectClaim,
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import {
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
  userProfileDirty,
  userProfiles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createSubjectFactsRedisInspector } from "@iam/user-profile-read-model/subject-facts";
import {
  createSubjectFactsRedisPublisher,
  createSubjectProjectionCutoverBackfill,
  createSubjectProjectionCutoverRepository,
  createUserProfileBuilder,
  createUserProfileBuildRepository,
} from "@iam/user-profile-read-model/worker";
import { and, eq } from "drizzle-orm";

export interface CreateProductionE2EScenarioOwnerInput {
  db: typeof database;
  redis: Redis;
  clock: { nowDate: () => Date };
  random: { uuid: () => string };
  passwordHashCost: number;
}

export function createProductionE2EScenarioOwner(
  input: CreateProductionE2EScenarioOwnerInput,
): E2EScenarioOwner {
  const subjectAccess = createSubjectAccessBootstrap({
    redis: input.redis,
    random: input.random,
  });
  const roleAssignmentResolver = createRoleAssignmentResolver(input.db);
  const subjectFactsInspector = createSubjectFactsRedisInspector(input.redis);

  async function establish(
    scenario: E2EScenarioReferences & { adminPassword: string },
  ) {
    const passwordHash = await hashSecret(
      scenario.adminPassword,
      input.passwordHashCost,
    );
    await input.db.transaction(async (tx) => {
      const [adminClient] = await tx.insert(clients).values({
        clientCode: scenario.adminClientCode,
        clientName: `E2E Admin ${scenario.runId}`,
        clientSecret: input.random.uuid(),
        url: `${scenario.canonicalOrigin}/iam-admin`,
        status: ClientStatus.Enable,
        extAttributes: {},
        customSsoEnabled: true,
        customSsoConfigVersion: 1,
        customSsoConfig: {
          mode: CustomSsoClientMode.Gateway,
          validRedirectUrls: [scenario.adminRedirectUri],
          subjectClaimCatalogVersion: 1,
          subjectClaims: [
            SubjectClaim.SubjectIdentifier,
            SubjectClaim.ProfileUsername,
            SubjectClaim.ProfileName,
            SubjectClaim.IamAuthorization,
          ],
          orcas: { enabled: false },
        },
        customSsoSecretHash: null,
      }).returning({ id: clients.id });
      if (adminClient === undefined)
        throw new Error("E2E Admin client was not created");

      await tx.insert(clients).values({
        clientCode: scenario.customSsoClientCode,
        clientName: `E2E Custom SSO Target ${scenario.runId}`,
        clientSecret: input.random.uuid(),
        url: scenario.customSsoRedirectUri,
        status: ClientStatus.Enable,
        extAttributes: {},
        customSsoEnabled: false,
        customSsoConfigVersion: 0,
        customSsoConfig: null,
        customSsoSecretHash: null,
      });

      await tx.insert(clients).values({
        clientCode: scenario.oidcClientCode,
        clientName: `E2E OIDC RP ${scenario.runId}`,
        clientSecret: input.random.uuid(),
        url: scenario.oidcRedirectUri,
        status: ClientStatus.Enable,
        extAttributes: {},
        oidcEnabled: true,
        oidcConfigVersion: 1,
        oidcConfig: {
          clientType: OidcClientType.Public,
          tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
          redirectUris: [scenario.oidcRedirectUri],
          postLogoutRedirectUris: [scenario.oidcPostLogoutRedirectUri],
          allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
        },
        oidcSecretHash: null,
      });

      const [organization] = await tx.insert(organizations).values({
        orgCode: scenario.organizationCode,
        orgName: `E2E Organization ${scenario.runId}`,
        parentId: -1,
        businessParentId: -1,
        path: "/pending",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
        status: OrganizationStatus.Enable,
        isEntity: true,
      }).returning({ id: organizations.id });
      if (organization === undefined)
        throw new Error("E2E organization was not created");
      await tx.update(organizations)
        .set({ path: `/${organization.id}` })
        .where(eq(organizations.id, organization.id));
      await tx.insert(organizationClosures).values({
        ancestorId: organization.id,
        descendantId: organization.id,
        depth: 0,
      });

      const [position] = await tx.insert(positions).values({
        posCode: scenario.positionCode,
        posName: `E2E Position ${scenario.runId}`,
        status: PositionStatus.Enable,
      }).returning({ id: positions.id });
      if (position === undefined)
        throw new Error("E2E position was not created");

      const [admin] = await tx.insert(users).values({
        subjectIdentifier: scenario.adminSubjectIdentifier,
        username: scenario.adminUsername,
        name: `E2E Admin ${scenario.runId}`,
        password: passwordHash,
        status: UserStatus.Enable,
      }).returning({ id: users.id });
      if (admin === undefined)
        throw new Error("E2E admin subject was not created");

      const [employment] = await tx.insert(employments).values({
        userId: admin.id,
        orgId: organization.id,
        posId: position.id,
        isPrimary: true,
        status: EmploymentStatus.Enable,
      }).returning({ id: employments.id });
      if (employment === undefined)
        throw new Error("E2E employment was not created");

      const [role] = await tx.insert(roles).values({
        roleCode: scenario.adminRoleCode,
        roleName: `E2E Admin Role ${scenario.runId}`,
        clientId: adminClient.id,
        status: RoleStatus.Enable,
      }).returning({ id: roles.id });
      if (role === undefined)
        throw new Error("E2E admin role was not created");
      await tx.insert(roleAssignments).values({
        roleId: role.id,
        targetType: RoleAssignmentTargetType.Employment,
        targetId: employment.id,
        includeDescendants: false,
      });
    });

    const cutover = createSubjectProjectionCutoverBackfill({
      repository: createSubjectProjectionCutoverRepository(input.db),
      builder: createUserProfileBuilder({
        buildRepository: createUserProfileBuildRepository(
          input.db,
          roleAssignmentResolver,
        ),
        clock: input.clock,
        config: { batchSize: 100 },
      }),
      subjectFacts: createSubjectFactsRedisPublisher(input.redis),
      subjectAccess,
      clock: input.clock,
    });
    const publication = await cutover.backfillBatch({
      version: 1,
      afterUserId: 0,
      batchSize: 100,
    });
    if (!publication.complete || publication.scanned !== 1)
      throw new Error("E2E Subject Profile publication did not cover exactly the seeded admin");
  }

  async function readBack(references: E2EScenarioReferences) {
    const [
      admin,
      organization,
      position,
      adminClient,
      customSsoClient,
      oidcClient,
      role,
    ] = await Promise.all([
      input.db.query.users.findFirst({
        where: { username: references.adminUsername, isDelete: false },
      }),
      input.db.query.organizations.findFirst({
        where: { orgCode: references.organizationCode, isDelete: false },
      }),
      input.db.query.positions.findFirst({
        where: { posCode: references.positionCode, isDelete: false },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.adminClientCode, isDelete: false },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.customSsoClientCode, isDelete: false },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.oidcClientCode, isDelete: false },
      }),
      input.db.query.roles.findFirst({
        where: { roleCode: references.adminRoleCode, isDelete: false },
      }),
    ]);
    const employment = admin === undefined || organization === undefined || position === undefined
      ? undefined
      : await input.db.query.employments.findFirst({
          where: {
            userId: admin.id,
            orgId: organization.id,
            posId: position.id,
            isDelete: false,
          },
        });
    const effectiveRoles = employment === undefined || adminClient === undefined
      ? []
      : (await roleAssignmentResolver.resolveEffectiveRoles({
          employmentIds: [employment.id],
          clientId: adminClient.id,
        })).get(employment.id) ?? [];
    const profileState = admin === undefined
      ? undefined
      : (await input.db.select({
          profileVersion: userProfiles.sourceDirtyVersion,
          dirtyVersion: userProfileDirty.dirtyVersion,
          dirtyStatus: userProfileDirty.status,
        })
          .from(userProfiles)
          .innerJoin(userProfileDirty, eq(userProfileDirty.userId, userProfiles.userId))
          .where(and(
            eq(userProfiles.userId, admin.id),
            eq(userProfiles.subjectIdentifier, references.adminSubjectIdentifier),
          ))
          .limit(1))[0];
    const barrier = await subjectAccess.inspectMany([
      references.adminSubjectIdentifier,
    ]);
    const barrierResult = barrier[0];
    const facts = await subjectFactsInspector.inspectMany([
      references.adminSubjectIdentifier,
    ]);
    const factsResult = facts[0];
    const factEmployments = factsResult?.status === "valid"
      ? factsResult.record.facts.employments
      : [];

    return {
      admin: {
        active: admin?.status === UserStatus.Enable && admin.isDelete === false,
        passwordConfigured: typeof admin?.password === "string" && admin.password.length > 0,
        subjectIdentifier: admin?.subjectIdentifier ?? "",
        username: admin?.username ?? "",
      },
      organization: {
        active: organization?.status === OrganizationStatus.Enable && organization.isDelete === false,
        code: organization?.orgCode ?? "",
      },
      position: {
        active: position?.status === PositionStatus.Enable && position.isDelete === false,
        code: position?.posCode ?? "",
      },
      employment: {
        active: employment?.status === EmploymentStatus.Enable && employment.isDelete === false,
      },
      role: {
        active: role?.status === RoleStatus.Enable && role.isDelete === false,
        assigned: effectiveRoles.some(
          effectiveRole => effectiveRole.id === role?.id
            && effectiveRole.roleCode === references.adminRoleCode,
        ),
        code: role?.roleCode ?? "",
      },
      adminClient: {
        active: adminClient?.status === ClientStatus.Enable
          && adminClient.isDelete === false,
        customSsoEnabled: adminClient?.customSsoEnabled ?? false,
        clientCode: adminClient?.clientCode ?? "",
        mode: adminClient?.customSsoConfig?.mode ?? null,
        redirectUris: adminClient?.customSsoConfig?.validRedirectUrls ?? [],
      },
      customSsoClient: {
        active: customSsoClient?.status === ClientStatus.Enable
          && customSsoClient.isDelete === false,
        customSsoEnabled: customSsoClient?.customSsoEnabled ?? false,
        clientCode: customSsoClient?.clientCode ?? "",
        mode: customSsoClient?.customSsoConfig?.mode ?? null,
        redirectUris: customSsoClient?.customSsoConfig?.validRedirectUrls ?? [],
      },
      oidcClient: {
        active: oidcClient?.status === ClientStatus.Enable
          && oidcClient.oidcEnabled
          && oidcClient.isDelete === false,
        clientCode: oidcClient?.clientCode ?? "",
        clientType: oidcClient?.oidcConfig?.clientType ?? null,
        redirectUris: oidcClient?.oidcConfig?.redirectUris ?? [],
      },
      subjectAccess: barrierResult?.status === "valid"
        ? barrierResult.record.state
        : barrierResult?.status ?? "missing",
      subjectFacts: {
        ready: factsResult?.status === "valid",
        subjectIdentifier: factsResult?.status === "valid"
          ? factsResult.record.subjectIdentifier
          : "",
        sourceDirtyVersion: factsResult?.status === "valid"
          ? factsResult.record.sourceDirtyVersion
          : "",
        profileUsername: factsResult?.status === "valid"
          ? factsResult.record.profile.username
          : "",
        organizationCodes: unique(factEmployments.map(
          fact => fact.organization.code,
        )),
        positionCodes: unique(factEmployments.map(fact => fact.position.code)),
        clientCodes: unique(factEmployments.flatMap(fact =>
          fact.clientAuthorizations.map(authorization => authorization.clientCode))),
        roleCodes: unique(factEmployments.flatMap(fact =>
          fact.clientAuthorizations.flatMap(authorization =>
            authorization.roles.map(factRole => factRole.code)))),
      },
      subjectProfileReady: profileState !== undefined
        && profileState.dirtyStatus === UserProfileDirtyStatus.Processed
        && profileState.profileVersion === profileState.dirtyVersion,
      subjectProfileVersion: profileState?.profileVersion ?? "",
    };
  }

  return { establish, readBack };
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}
