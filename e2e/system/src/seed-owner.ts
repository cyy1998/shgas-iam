import type { db as database } from "@iam/db";
import type { CreateUserProfileWorkerModuleInput } from "@iam/user-profile-read-model/worker";
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
  PrivilegeStatus,
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
  privileges,
  rolePrivileges,
  roles,
  userProfileDirty,
  userProfiles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createSubjectFactsRedisInspector } from "@iam/user-profile-read-model/subject-facts";
import {
  createUserProfileWorkerModule,
} from "@iam/user-profile-read-model/worker";
import { and, eq } from "drizzle-orm";

export interface CreateProductionE2EScenarioOwnerInput {
  db: typeof database;
  redis: Redis;
  queueRedis: CreateUserProfileWorkerModuleInput["redis"];
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
    scenario: E2EScenarioReferences & {
      adminPassword: string;
      internalApiKey: string;
    },
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
        clientCode: scenario.internalClientCode,
        clientName: `E2E Internal Client ${scenario.runId}`,
        clientSecret: scenario.internalApiKey,
        url: `${scenario.canonicalOrigin}/e2e/internal`,
        status: ClientStatus.Enable,
        extAttributes: {},
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
          allowedScopes: [
            OidcScope.OpenId,
            OidcScope.Profile,
            OidcScope.IamEmployments,
          ],
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

      const [responsibilityHolderOrganization] = await tx
        .insert(organizations)
        .values({
          orgCode: scenario.responsibilityHolderOrganizationCode,
          orgName: `E2E Responsibility Holder ${scenario.runId}`,
          parentId: organization.id,
          businessParentId: organization.id,
          path: "/pending",
          level: OrganizationLevel.Two,
          orgType: OrganizationType.Department,
          status: OrganizationStatus.Enable,
          isEntity: true,
        })
        .returning({ id: organizations.id });
      if (responsibilityHolderOrganization === undefined) {
        throw new Error("E2E responsibility holder Organization was not created");
      }
      await tx.update(organizations)
        .set({
          path: `/${organization.id}/${responsibilityHolderOrganization.id}`,
        })
        .where(eq(organizations.id, responsibilityHolderOrganization.id));
      await tx.insert(organizationClosures).values([
        {
          ancestorId: responsibilityHolderOrganization.id,
          descendantId: responsibilityHolderOrganization.id,
          depth: 0,
        },
        {
          ancestorId: organization.id,
          descendantId: responsibilityHolderOrganization.id,
          depth: 1,
        },
      ]);

      const [responsibilityTargetOrganization] = await tx
        .insert(organizations)
        .values({
          orgCode: scenario.responsibilityTargetOrganizationCode,
          orgName: `E2E Responsibility Target ${scenario.runId}`,
          parentId: -1,
          businessParentId: -1,
          path: "/pending",
          level: OrganizationLevel.One,
          orgType: OrganizationType.Department,
          status: OrganizationStatus.Enable,
          isEntity: true,
        })
        .returning({ id: organizations.id });
      if (responsibilityTargetOrganization === undefined) {
        throw new Error("E2E responsibility target Organization was not created");
      }
      await tx.update(organizations)
        .set({ path: `/${responsibilityTargetOrganization.id}` })
        .where(eq(organizations.id, responsibilityTargetOrganization.id));
      await tx.insert(organizationClosures).values({
        ancestorId: responsibilityTargetOrganization.id,
        descendantId: responsibilityTargetOrganization.id,
        depth: 0,
      });

      const [position] = await tx.insert(positions).values({
        posCode: scenario.positionCode,
        posName: `E2E Position ${scenario.runId}`,
        status: PositionStatus.Enable,
      }).returning({ id: positions.id });
      if (position === undefined)
        throw new Error("E2E position was not created");

      const [responsibilityHolderPosition] = await tx.insert(positions).values({
        posCode: scenario.responsibilityHolderPositionCode,
        posName: `E2E Responsibility Holder ${scenario.runId}`,
        status: PositionStatus.Enable,
      }).returning({ id: positions.id });
      if (responsibilityHolderPosition === undefined) {
        throw new Error("E2E responsibility holder Position was not created");
      }

      const [globalPosition] = await tx.insert(positions).values({
        posCode: scenario.globalPositionCode,
        posName: `E2E Global Position ${scenario.runId}`,
        status: PositionStatus.Enable,
      }).returning({ id: positions.id });
      if (globalPosition === undefined)
        throw new Error("E2E global unassigned Position was not created");

      const [admin] = await tx.insert(users).values({
        subjectIdentifier: scenario.adminSubjectIdentifier,
        username: scenario.adminUsername,
        name: `E2E Admin ${scenario.runId}`,
        password: passwordHash,
        status: UserStatus.Enable,
      }).returning({ id: users.id });
      if (admin === undefined)
        throw new Error("E2E admin subject was not created");

      const [hrAdmin] = await tx.insert(users).values({
        subjectIdentifier: scenario.hrAdminSubjectIdentifier,
        username: scenario.hrAdminUsername,
        name: `E2E HR Admin ${scenario.runId}`,
        password: passwordHash,
        status: UserStatus.Enable,
      }).returning({ id: users.id });
      if (hrAdmin === undefined)
        throw new Error("E2E HR Admin subject was not created");

      await tx.insert(users).values([
        {
          subjectIdentifier: scenario.delegateeSubjectIdentifier,
          username: scenario.delegateeUsername,
          name: `E2E Delegatee ${scenario.runId}`,
          status: UserStatus.Enable,
        },
        {
          subjectIdentifier: scenario.pausedSubjectIdentifier,
          username: scenario.pausedUsername,
          name: `E2E Paused User ${scenario.runId}`,
          status: UserStatus.Pause,
        },
        {
          subjectIdentifier: scenario.disabledSubjectIdentifier,
          username: scenario.disabledUsername,
          name: `E2E Disabled User ${scenario.runId}`,
          status: UserStatus.Disable,
        },
      ]);

      const [employment] = await tx.insert(employments).values({
        userId: admin.id,
        orgId: organization.id,
        posId: position.id,
        isPrimary: true,
        status: EmploymentStatus.Enable,
      }).returning({ id: employments.id });
      if (employment === undefined)
        throw new Error("E2E employment was not created");

      const [responsibilityHolderEmployment] = await tx.insert(employments)
        .values({
          userId: admin.id,
          orgId: responsibilityHolderOrganization.id,
          posId: responsibilityHolderPosition.id,
          isPrimary: false,
          status: EmploymentStatus.Enable,
        })
        .returning({ id: employments.id });
      if (responsibilityHolderEmployment === undefined) {
        throw new Error("E2E responsibility holder Employment was not created");
      }

      const [hrRoleBearingEmployment] = await tx.insert(employments).values({
        userId: hrAdmin.id,
        orgId: responsibilityHolderOrganization.id,
        posId: position.id,
        isPrimary: true,
        status: EmploymentStatus.Enable,
      }).returning({ id: employments.id });
      if (hrRoleBearingEmployment === undefined)
        throw new Error("E2E HR role-bearing Employment was not created");

      const [hrOrdinaryEmployment] = await tx.insert(employments).values({
        userId: hrAdmin.id,
        orgId: responsibilityTargetOrganization.id,
        posId: responsibilityHolderPosition.id,
        isPrimary: false,
        status: EmploymentStatus.Enable,
      }).returning({ id: employments.id });
      if (hrOrdinaryEmployment === undefined)
        throw new Error("E2E HR ordinary Employment was not created");

      const [role] = await tx.insert(roles).values({
        roleCode: scenario.adminRoleCode,
        roleName: `E2E Admin Role ${scenario.runId}`,
        clientId: adminClient.id,
        status: RoleStatus.Enable,
      }).returning({ id: roles.id });
      if (role === undefined)
        throw new Error("E2E admin role was not created");
      const [hrRole] = await tx.insert(roles).values({
        roleCode: scenario.hrAdminRoleCode,
        roleName: `E2E HR Admin Role ${scenario.runId}`,
        clientId: adminClient.id,
        status: RoleStatus.Enable,
      }).returning({ id: roles.id });
      if (hrRole === undefined)
        throw new Error("E2E HR Admin role was not created");
      const [privilege] = await tx.insert(privileges).values({
        privilegeCode: scenario.adminPrivilegeCode,
        privilegeName: `E2E Admin Privilege ${scenario.runId}`,
        status: PrivilegeStatus.Enable,
      }).returning({ id: privileges.id });
      if (privilege === undefined)
        throw new Error("E2E admin privilege was not created");
      await tx.insert(rolePrivileges).values({
        roleId: role.id,
        privilegeId: privilege.id,
      });
      await tx.insert(roleAssignments).values([
        {
          roleId: role.id,
          targetType: RoleAssignmentTargetType.Employment,
          targetId: employment.id,
          includeDescendants: false,
        },
        {
          roleId: hrRole.id,
          targetType: RoleAssignmentTargetType.Employment,
          targetId: hrRoleBearingEmployment.id,
          includeDescendants: false,
        },
      ]);

      await tx.insert(userProfiles).values({
        userId: admin.id,
        subjectIdentifier: scenario.adminSubjectIdentifier,
        username: scenario.adminUsername,
        name: `E2E Admin ${scenario.runId}`,
        mobile: null,
        wxId: null,
        status: UserStatus.Enable,
        isDelete: false,
        searchVisible: true,
        profileSchemaVersion: 2,
        sourceDirtyVersion: "1",
        detail: {},
        searchDoc: {},
        subjectFacts: {},
        rebuiltAt: input.clock.nowDate(),
      });
    });

    const legacyProfile = await input.db.query.userProfiles.findFirst({
      columns: { profileSchemaVersion: true },
      where: {
        subjectIdentifier: scenario.adminSubjectIdentifier,
      },
    });
    if (legacyProfile?.profileSchemaVersion !== 2) {
      throw new Error(
        "E2E User Profile cutover did not start from a stored v2 row",
      );
    }

    const profileModule = createUserProfileWorkerModule({
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
      const backfill = await profileModule.maintenance.backfillAllUsers({ batchSize: 100 });
      if (backfill.enqueued !== 5) {
        throw new Error(
          "E2E User Profile backfill did not enqueue all five seeded users",
        );
      }
    }
    finally {
      await profileModule.close();
    }

    await waitForPublishedProfiles(scenario);
    const access = await subjectAccess.seedMany([
      {
        subjectIdentifier: scenario.adminSubjectIdentifier,
        state: "enabled",
      },
      {
        subjectIdentifier: scenario.hrAdminSubjectIdentifier,
        state: "enabled",
      },
      {
        subjectIdentifier: scenario.delegateeSubjectIdentifier,
        state: "enabled",
      },
      {
        subjectIdentifier: scenario.pausedSubjectIdentifier,
        state: "disabled",
      },
      {
        subjectIdentifier: scenario.disabledSubjectIdentifier,
        state: "disabled",
      },
    ], input.clock.nowDate());
    if (access.seeded !== 5 || access.retainedExisting !== 0) {
      throw new Error(
        "E2E Subject Access bootstrap did not seed all five users",
      );
    }
  }

  async function waitForPublishedProfiles(references: E2EScenarioReferences) {
    const deadline = Date.now() + 30_000;
    const subjectIdentifiers = [
      references.adminSubjectIdentifier,
      references.hrAdminSubjectIdentifier,
      references.delegateeSubjectIdentifier,
      references.pausedSubjectIdentifier,
      references.disabledSubjectIdentifier,
    ];
    while (Date.now() < deadline) {
      const rows = await input.db.select({
        subjectIdentifier: userProfiles.subjectIdentifier,
        profileSchemaVersion: userProfiles.profileSchemaVersion,
        profileVersion: userProfiles.sourceDirtyVersion,
        dirtyVersion: userProfileDirty.dirtyVersion,
        dirtyStatus: userProfileDirty.status,
      })
        .from(userProfiles)
        .innerJoin(
          userProfileDirty,
          eq(userProfileDirty.userId, userProfiles.userId),
        );
      const selectedRows = rows.filter(row =>
        subjectIdentifiers.includes(row.subjectIdentifier));
      const facts = await subjectFactsInspector.inspectMany(subjectIdentifiers);
      if (
        selectedRows.length === subjectIdentifiers.length
        && selectedRows.every(row =>
          row.profileSchemaVersion === 3
          && row.profileVersion === row.dirtyVersion
          && row.dirtyStatus === UserProfileDirtyStatus.Processed)
        && facts.every(result => result.status === "valid")
      ) {
        return;
      }
      await Bun.sleep(250);
    }
    throw new Error(
      "E2E production Worker did not publish all v3 User Profiles before the deadline",
    );
  }

  async function readBack(references: E2EScenarioReferences) {
    const [
      admin,
      hrAdmin,
      delegatee,
      organization,
      responsibilityHolderOrganization,
      responsibilityTargetOrganization,
      position,
      globalPosition,
      responsibilityHolderPosition,
      adminClient,
      customSsoClient,
      internalClient,
      oidcClient,
      role,
      hrRole,
    ] = await Promise.all([
      input.db.query.users.findFirst({
        where: { username: references.adminUsername, isDelete: false },
      }),
      input.db.query.users.findFirst({
        where: { username: references.hrAdminUsername, isDelete: false },
      }),
      input.db.query.users.findFirst({
        where: { username: references.delegateeUsername, isDelete: false },
      }),
      input.db.query.organizations.findFirst({
        where: { orgCode: references.organizationCode, isDelete: false },
      }),
      input.db.query.organizations.findFirst({
        where: {
          orgCode: references.responsibilityHolderOrganizationCode,
          isDelete: false,
        },
      }),
      input.db.query.organizations.findFirst({
        where: {
          orgCode: references.responsibilityTargetOrganizationCode,
          isDelete: false,
        },
      }),
      input.db.query.positions.findFirst({
        where: { posCode: references.positionCode, isDelete: false },
      }),
      input.db.query.positions.findFirst({
        where: { posCode: references.globalPositionCode, isDelete: false },
      }),
      input.db.query.positions.findFirst({
        where: {
          posCode: references.responsibilityHolderPositionCode,
          isDelete: false,
        },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.adminClientCode, isDelete: false },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.customSsoClientCode, isDelete: false },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.internalClientCode, isDelete: false },
      }),
      input.db.query.clients.findFirst({
        where: { clientCode: references.oidcClientCode, isDelete: false },
      }),
      input.db.query.roles.findFirst({
        where: { roleCode: references.adminRoleCode, isDelete: false },
      }),
      input.db.query.roles.findFirst({
        where: { roleCode: references.hrAdminRoleCode, isDelete: false },
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
    const responsibilityHolderEmployment = admin === undefined
      || responsibilityHolderOrganization === undefined
      || responsibilityHolderPosition === undefined
      ? undefined
      : await input.db.query.employments.findFirst({
          where: {
            userId: admin.id,
            orgId: responsibilityHolderOrganization.id,
            posId: responsibilityHolderPosition.id,
            isDelete: false,
          },
        });
    const hrRoleBearingEmployment = hrAdmin === undefined
      || responsibilityHolderOrganization === undefined
      || position === undefined
      ? undefined
      : await input.db.query.employments.findFirst({
          where: {
            userId: hrAdmin.id,
            orgId: responsibilityHolderOrganization.id,
            posId: position.id,
            isDelete: false,
          },
        });
    const hrOrdinaryEmployment = hrAdmin === undefined
      || responsibilityTargetOrganization === undefined
      || responsibilityHolderPosition === undefined
      ? undefined
      : await input.db.query.employments.findFirst({
          where: {
            userId: hrAdmin.id,
            orgId: responsibilityTargetOrganization.id,
            posId: responsibilityHolderPosition.id,
            isDelete: false,
          },
        });
    const effectiveRoles = employment === undefined || adminClient === undefined
      ? []
      : (await roleAssignmentResolver.resolveEffectiveRoles({
          employmentIds: [employment.id],
          clientId: adminClient.id,
        })).get(employment.id) ?? [];
    const hrEffectiveRoles = hrRoleBearingEmployment === undefined
      || adminClient === undefined
      ? []
      : (await roleAssignmentResolver.resolveEffectiveRoles({
          employmentIds: [hrRoleBearingEmployment.id],
          clientId: adminClient.id,
        })).get(hrRoleBearingEmployment.id) ?? [];
    const profileState = admin === undefined
      ? undefined
      : (await input.db.select({
          profileVersion: userProfiles.sourceDirtyVersion,
          profileSchemaVersion: userProfiles.profileSchemaVersion,
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
    const hrProfileState = hrAdmin === undefined
      ? undefined
      : (await input.db.select({
          profileVersion: userProfiles.sourceDirtyVersion,
          profileSchemaVersion: userProfiles.profileSchemaVersion,
          dirtyVersion: userProfileDirty.dirtyVersion,
          dirtyStatus: userProfileDirty.status,
        })
          .from(userProfiles)
          .innerJoin(userProfileDirty, eq(userProfileDirty.userId, userProfiles.userId))
          .where(and(
            eq(userProfiles.userId, hrAdmin.id),
            eq(userProfiles.subjectIdentifier, references.hrAdminSubjectIdentifier),
          ))
          .limit(1))[0];
    const barriers = await subjectAccess.inspectMany([
      references.adminSubjectIdentifier,
      references.hrAdminSubjectIdentifier,
    ]);
    const barrierResult = barriers[0];
    const hrBarrierResult = barriers[1];
    const facts = await subjectFactsInspector.inspectMany([
      references.adminSubjectIdentifier,
      references.hrAdminSubjectIdentifier,
    ]);
    const factsResult = facts[0];
    const hrFactsResult = facts[1];
    const factEmployments = factsResult?.status === "valid"
      ? factsResult.record.facts.employments
      : [];
    const hrFactEmployments = hrFactsResult?.status === "valid"
      ? hrFactsResult.record.facts.employments
      : [];

    return {
      admin: {
        active: admin?.status === UserStatus.Enable && admin.isDelete === false,
        passwordConfigured: typeof admin?.password === "string" && admin.password.length > 0,
        subjectIdentifier: admin?.subjectIdentifier ?? "",
        username: admin?.username ?? "",
      },
      hrAdmin: {
        active: hrAdmin?.status === UserStatus.Enable && hrAdmin.isDelete === false,
        passwordConfigured: typeof hrAdmin?.password === "string"
          && hrAdmin.password.length > 0,
        subjectIdentifier: hrAdmin?.subjectIdentifier ?? "",
        username: hrAdmin?.username ?? "",
      },
      delegatee: {
        active: delegatee?.status === UserStatus.Enable && delegatee.isDelete === false,
        subjectIdentifier: delegatee?.subjectIdentifier ?? "",
        username: delegatee?.username ?? "",
      },
      organization: {
        active: organization?.status === OrganizationStatus.Enable && organization.isDelete === false,
        code: organization?.orgCode ?? "",
      },
      responsibilityHolderOrganization: {
        active: responsibilityHolderOrganization?.status
          === OrganizationStatus.Enable
          && responsibilityHolderOrganization.isDelete === false,
        code: responsibilityHolderOrganization?.orgCode ?? "",
      },
      responsibilityTargetOrganization: {
        active: responsibilityTargetOrganization?.status === OrganizationStatus.Enable
          && responsibilityTargetOrganization.isDelete === false,
        code: responsibilityTargetOrganization?.orgCode ?? "",
      },
      position: {
        active: position?.status === PositionStatus.Enable && position.isDelete === false,
        code: position?.posCode ?? "",
      },
      globalPosition: {
        active: globalPosition?.status === PositionStatus.Enable
          && globalPosition.isDelete === false,
        code: globalPosition?.posCode ?? "",
      },
      employment: {
        active: employment?.status === EmploymentStatus.Enable && employment.isDelete === false,
      },
      responsibilityHolderEmployment: {
        active: responsibilityHolderEmployment?.status === EmploymentStatus.Enable
          && responsibilityHolderEmployment.isDelete === false,
      },
      role: {
        active: role?.status === RoleStatus.Enable && role.isDelete === false,
        assigned: effectiveRoles.some(
          effectiveRole => effectiveRole.id === role?.id
            && effectiveRole.roleCode === references.adminRoleCode,
        ),
        code: role?.roleCode ?? "",
      },
      hrRole: {
        active: hrRole?.status === RoleStatus.Enable && hrRole.isDelete === false,
        assigned: hrEffectiveRoles.some(
          effectiveRole => effectiveRole.id === hrRole?.id
            && effectiveRole.roleCode === references.hrAdminRoleCode,
        ),
        code: hrRole?.roleCode ?? "",
      },
      hrRoleBearingEmployment: {
        active: hrRoleBearingEmployment?.status === EmploymentStatus.Enable
          && hrRoleBearingEmployment.isDelete === false,
      },
      hrOrdinaryEmployment: {
        active: hrOrdinaryEmployment?.status === EmploymentStatus.Enable
          && hrOrdinaryEmployment.isDelete === false,
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
      internalClient: {
        active: internalClient?.status === ClientStatus.Enable
          && internalClient.isDelete === false,
        clientCode: internalClient?.clientCode ?? "",
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
        responsibilityTypeCodes: unique(factEmployments.flatMap(fact =>
          fact.responsibilities.map(responsibility => responsibility.type.code))),
        responsibilityTargetOrganizationCodes: unique(
          factEmployments.flatMap(fact => fact.responsibilities.map(
            responsibility => responsibility.targetOrganization.code,
          )),
        ),
      },
      subjectProfileReady: profileState !== undefined
        && profileState.dirtyStatus === UserProfileDirtyStatus.Processed
        && profileState.profileVersion === profileState.dirtyVersion,
      subjectProfileVersion: profileState?.profileVersion ?? "",
      subjectProfileSchemaVersion: profileState?.profileSchemaVersion ?? 0,
      hrSubjectAccess: hrBarrierResult?.status === "valid"
        ? hrBarrierResult.record.state
        : hrBarrierResult?.status ?? "missing",
      hrSubjectFacts: {
        ready: hrFactsResult?.status === "valid",
        subjectIdentifier: hrFactsResult?.status === "valid"
          ? hrFactsResult.record.subjectIdentifier
          : "",
        sourceDirtyVersion: hrFactsResult?.status === "valid"
          ? hrFactsResult.record.sourceDirtyVersion
          : "",
        profileUsername: hrFactsResult?.status === "valid"
          ? hrFactsResult.record.profile.username
          : "",
        organizationCodes: unique(hrFactEmployments.map(
          fact => fact.organization.code,
        )),
        positionCodes: unique(hrFactEmployments.map(fact => fact.position.code)),
        clientCodes: unique(hrFactEmployments.flatMap(fact =>
          fact.clientAuthorizations.map(authorization => authorization.clientCode))),
        roleCodes: unique(hrFactEmployments.flatMap(fact =>
          fact.clientAuthorizations.flatMap(authorization =>
            authorization.roles.map(factRole => factRole.code)))),
      },
      hrSubjectProfileReady: hrProfileState !== undefined
        && hrProfileState.dirtyStatus === UserProfileDirtyStatus.Processed
        && hrProfileState.profileVersion === hrProfileState.dirtyVersion,
      hrSubjectProfileVersion: hrProfileState?.profileVersion ?? "",
      hrSubjectProfileSchemaVersion: hrProfileState?.profileSchemaVersion ?? 0,
    };
  }

  return { establish, readBack };
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}
