import type {
  ProfileBuildDataset,
  ProfileBuildRepository,
} from "./profile-build.repository";
import type { BuiltProfileDocuments } from "./profile-document-builder.core";
import type { V3UserProfileSearchDocument } from "./profile-v3-search.schema";
import type { PublishedProfile } from "./profile.schema";
import {
  EmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
} from "@iam/contracts";
import { buildProfileDocumentsFromDataset } from "./profile-document-builder.core";
import {
  PublishedProfileSchema,
  USER_PROFILE_SCHEMA_VERSION,
} from "./profile.schema";
import {
  chunkItems,
  compareCodes,
  groupItemsBy,
  normalizeVersionedBuildTargets,
} from "./user-profile-build.helpers";

export interface ProfileBuilderDeps {
  buildRepository: ProfileBuildRepository;
  clock: { nowDate: () => Date };
  config: { batchSize: number };
}

export interface ProfileBuildTarget {
  userId: number;
  sourceDirtyVersion: string;
}

export function createProfileBuilder(
  deps: ProfileBuilderDeps,
) {
  async function buildOne(target: ProfileBuildTarget) {
    return (await buildMany([target]))[0] ?? null;
  }

  async function buildMany(targets: ProfileBuildTarget[]) {
    const targetsByUserId = normalizeVersionedBuildTargets(targets);
    const profiles: PublishedProfile[] = [];
    for (const userIds of chunkItems([...targetsByUserId.keys()], deps.config.batchSize)) {
      const rebuiltAt = deps.clock.nowDate();
      const dataset = await deps.buildRepository.loadByUserIds(userIds, rebuiltAt);
      const baseBuilds = buildProfileDocumentsFromDataset(
        dataset,
        rebuiltAt,
        targetsByUserId,
      );
      profiles.push(...baseBuilds.map(build => toPublishedProfile(
        build.profile,
        dataset,
        build.subjectFactsEmploymentIds,
      )));
    }
    return profiles;
  }

  return { buildOne, buildMany };
}

function toPublishedProfile(
  profile: BuiltProfileDocuments["profile"],
  dataset: ProfileBuildDataset,
  subjectFactsEmploymentIds: number[],
) {
  const responsibilitiesByEmploymentId = buildResponsibilitiesByEmploymentId(dataset);
  const detailEmployments = profile.detail.employments.map(employment => ({
    ...employment,
    responsibilities: responsibilitiesByEmploymentId.get(employment.id) ?? [],
  }));
  if (subjectFactsEmploymentIds.length !== profile.subjectFacts.employments.length) {
    throw new Error("User Profile Subject Facts employment mapping is inconsistent");
  }

  const detail = { ...profile.detail, employments: detailEmployments };
  return PublishedProfileSchema.parse({
    ...profile,
    profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
    detail,
    searchDoc: buildV3SearchDocument({ ...profile, detail }),
    subjectFacts: {
      employments: profile.subjectFacts.employments.map((employment, index) => ({
        ...employment,
        responsibilities: responsibilitiesByEmploymentId.get(subjectFactsEmploymentIds[index]!) ?? [],
      })),
    },
  });
}

function buildV3SearchDocument(
  profile: Omit<PublishedProfile, "profileSchemaVersion" | "searchDoc" | "subjectFacts">
    & Pick<PublishedProfile, "detail">,
): V3UserProfileSearchDocument {
  return {
    user: {
      subjectIdentifier: profile.subjectIdentifier,
      username: profile.username,
      name: profile.name,
      mobile: profile.mobile,
      wxId: profile.wxId,
      userType: profile.detail.userType,
      status: profile.status,
    },
    employments: profile.detail.employments
      .filter(employment => isEffectiveEmployment(employment, profile.rebuiltAt))
      .map(employment => ({
        isPrimary: employment.isPrimary,
        organization: toSearchOrganization({
          code: employment.organization.assignedOrg.orgCode,
          name: employment.organization.assignedOrg.orgName,
          type: employment.organization.assignedOrg.orgType,
          path: employment.organization.fullOrgPath.map(node => ({
            code: node.orgCode,
            name: node.orgName,
            type: node.orgType,
            distanceToTarget: node.distanceToAssignedOrg,
          })),
        }),
        position: {
          code: employment.position.posCode,
          name: employment.position.posName,
        },
        roles: uniqueSorted(employment.roles),
        privileges: uniqueSorted(employment.privileges),
        responsibilities: employment.responsibilities.map(responsibility => ({
          type: responsibility.type,
          targetOrganization: toSearchOrganization(responsibility.targetOrganization),
        })),
      })),
  };
}

type SearchOrganization = V3UserProfileSearchDocument["employments"][number]["organization"];
type SearchOrganizationInput = Omit<SearchOrganization, "path"> & {
  readonly path: readonly (
    Omit<SearchOrganization["path"][number], "distanceToTarget">
    & Partial<Pick<SearchOrganization["path"][number], "distanceToTarget">>
  )[];
};

function toSearchOrganization(input: SearchOrganizationInput): SearchOrganization {
  return {
    code: input.code,
    name: input.name,
    type: input.type,
    path: input.path.map((node, index, path) => ({
      code: node.code,
      name: node.name,
      type: node.type,
      distanceToTarget: node.distanceToTarget ?? path.length - index - 1,
    })),
  };
}

function isEffectiveEmployment(
  employment: PublishedProfile["detail"]["employments"][number],
  rebuiltAt: Date,
) {
  return employment.status === EmploymentStatus.Enable
    && !employment.isDelete
    && employment.startTime.getTime() <= rebuiltAt.getTime()
    && employment.endTime === null;
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function buildResponsibilitiesByEmploymentId(dataset: ProfileBuildDataset) {
  const employmentIds = new Set(dataset.employments.map(employment => employment.id));
  for (const row of dataset.responsibilityRows) {
    if (!employmentIds.has(row.employmentId))
      throw new Error("Organization Responsibility Snapshot references an unexpected Employment");
  }
  const typeByCode = new Map(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(type => [type.code, type]));
  const grouped = groupItemsBy(dataset.responsibilityRows, row => row.employmentId);
  return new Map([...grouped].map(([employmentId, rows]) => {
    const seen = new Set<string>();
    const responsibilities = rows.map((row) => {
      const type = typeByCode.get(row.typeCode);
      if (type === undefined)
        throw new Error("Organization Responsibility Snapshot type is unknown");
      const identity = `${row.typeCode}\0${row.targetOrganization.code}`;
      if (seen.has(identity))
        throw new Error("Organization Responsibility Snapshot contains a duplicate identity");
      seen.add(identity);
      return {
        displayOrder: type.displayOrder,
        snapshot: {
          type: { code: type.code, name: type.name },
          targetOrganization: row.targetOrganization,
        },
      };
    });
    responsibilities.sort((left, right) =>
      left.displayOrder - right.displayOrder
      || compareCodes(left.snapshot.type.code, right.snapshot.type.code)
      || compareCodes(
        left.snapshot.targetOrganization.code,
        right.snapshot.targetOrganization.code,
      ));
    return [employmentId, responsibilities.map(item => item.snapshot)] as const;
  }));
}
