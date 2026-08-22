import type {
  ProfileBuildDataset,
  ProfileBuildRepository,
} from "./profile-build.repository";
import type { BuiltProfileDocuments } from "./profile-document-builder.core";
import type { PublishedProfile } from "./profile.schema";
import { ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG } from "@iam/contracts";
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
  const searchEmployments = profile.searchDoc.employments.map(employment => ({
    ...employment,
    responsibilities: responsibilitiesByEmploymentId.get(employment.id) ?? [],
  }));
  if (subjectFactsEmploymentIds.length !== profile.subjectFacts.employments.length) {
    throw new Error("User Profile V2 Subject Facts employment mapping is inconsistent");
  }

  return PublishedProfileSchema.parse({
    ...profile,
    profileSchemaVersion: USER_PROFILE_SCHEMA_VERSION,
    detail: { ...profile.detail, employments: detailEmployments },
    searchDoc: { ...profile.searchDoc, employments: searchEmployments },
    subjectFacts: {
      employments: profile.subjectFacts.employments.map((employment, index) => ({
        ...employment,
        responsibilities: responsibilitiesByEmploymentId.get(subjectFactsEmploymentIds[index]!) ?? [],
      })),
    },
  });
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
