import { OrganizationResponsibilityIntegrityError } from "@iam/organization-responsibility-resolution";
import { DocumentSourceVersionSchema, type PublishedUserDocument } from "../document";
import { UserDocumentSourceIntegrityError } from "./document-build.error";
import type { DocumentBuildRepository } from "./document-build.repository";
import {
  buildUserDocumentResultsFromDataset,
  buildUserDocumentsFromDataset,
  type DocumentBuildResult,
} from "./document-builder.core";
import { chunkItems } from "./user-document-build.helpers";

export type { DocumentBuildResult } from "./document-builder.core";

export interface DocumentBuilderDeps {
  buildRepository: DocumentBuildRepository;
  clock: { nowDate(): Date };
  config: { batchSize: number };
  signal?: AbortSignal;
}
export interface DocumentBuildTarget {
  userId: number;
  sourceVersion: string;
}
export function createDocumentBuilder(deps: DocumentBuilderDeps) {
  if (!Number.isSafeInteger(deps.config.batchSize) || deps.config.batchSize < 1)
    throw new RangeError("Document build batch size must be a positive safe integer");
  function targetVersions(targets: DocumentBuildTarget[], rejectDuplicates = false) {
    const versions = new Map<number, string>();
    for (const target of targets) {
      if (!Number.isSafeInteger(target.userId) || target.userId < 1)
        throw new TypeError("Document target ID must be positive");
      const version = DocumentSourceVersionSchema.parse(target.sourceVersion);
      if (versions.has(target.userId) && versions.get(target.userId) !== version)
        throw new Error("Document build contains conflicting versions");
      if (rejectDuplicates && versions.has(target.userId)) throw new Error("Document build contains duplicate targets");
      versions.set(target.userId, version);
    }
    return versions;
  }
  async function buildMany(targets: DocumentBuildTarget[]) {
    deps.signal?.throwIfAborted();
    const versions = targetVersions(targets);
    const output: PublishedUserDocument[] = [];
    const observedAt = deps.clock.nowDate();
    for (const userIds of chunkItems([...versions.keys()], deps.config.batchSize)) {
      deps.signal?.throwIfAborted();
      const dataset = await deps.buildRepository.loadByUserIds(userIds, observedAt, deps.signal);
      deps.signal?.throwIfAborted();
      output.push(...buildUserDocumentsFromDataset(dataset, observedAt, versions));
    }
    return output.sort((left, right) => left.userId - right.userId);
  }

  async function buildManyResults(targets: DocumentBuildTarget[]): Promise<DocumentBuildResult[]> {
    deps.signal?.throwIfAborted();
    const versions = targetVersions(targets, true);
    const observedAt = deps.clock.nowDate();
    async function buildBatch(userIds: number[]): Promise<DocumentBuildResult[]> {
      deps.signal?.throwIfAborted();
      let dataset: Awaited<ReturnType<DocumentBuildRepository["loadByUserIds"]>>;
      try {
        dataset = await deps.buildRepository.loadByUserIds(userIds, observedAt, deps.signal);
      } catch (error) {
        deps.signal?.throwIfAborted();
        // These errors are raised by pure validation after successful reads, so
        // the caller's snapshot remains usable. SQL/connection failures escape.
        if (
          !(error instanceof UserDocumentSourceIntegrityError) &&
          !(error instanceof OrganizationResponsibilityIntegrityError)
        )
          throw error;
        if (userIds.length === 1)
          return [{ userId: userIds[0]!, sourceVersion: versions.get(userIds[0]!)!, status: "failed", error }];
        const middle = Math.floor(userIds.length / 2);
        return [...(await buildBatch(userIds.slice(0, middle))), ...(await buildBatch(userIds.slice(middle)))];
      }
      deps.signal?.throwIfAborted();
      return buildUserDocumentResultsFromDataset(
        dataset,
        observedAt,
        new Map(userIds.map((userId) => [userId, versions.get(userId)!])),
      );
    }
    const results: DocumentBuildResult[] = [];
    for (const userIds of chunkItems([...versions.keys()], deps.config.batchSize))
      results.push(...(await buildBatch(userIds)));
    return results.sort((left, right) => left.userId - right.userId);
  }
  return {
    buildMany,
    buildManyResults,
    async buildOne(target: DocumentBuildTarget) {
      return (await buildMany([target]))[0] ?? null;
    },
  };
}
