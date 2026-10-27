import { DocumentSourceVersionSchema, type PublishedUserDocument } from "../document";
import type { DocumentBuildRepository } from "./document-build.repository";
import { buildUserDocumentsFromDataset } from "./document-builder.core";
import { chunkItems } from "./user-document-build.helpers";

export interface DocumentBuilderDeps {
  buildRepository: DocumentBuildRepository;
  clock: { nowDate(): Date };
  config: { batchSize: number };
}
export interface DocumentBuildTarget {
  userId: number;
  sourceVersion: string;
}
export function createDocumentBuilder(deps: DocumentBuilderDeps) {
  if (!Number.isSafeInteger(deps.config.batchSize) || deps.config.batchSize < 1)
    throw new RangeError("Document build batch size must be a positive safe integer");
  async function buildMany(targets: DocumentBuildTarget[]) {
    const versions = new Map<number, string>();
    for (const target of targets) {
      if (!Number.isSafeInteger(target.userId) || target.userId < 1)
        throw new TypeError("Document target ID must be positive");
      const version = DocumentSourceVersionSchema.parse(target.sourceVersion);
      if (versions.has(target.userId) && versions.get(target.userId) !== version)
        throw new Error("Document build contains conflicting versions");
      versions.set(target.userId, version);
    }
    const output: PublishedUserDocument[] = [];
    const observedAt = deps.clock.nowDate();
    for (const userIds of chunkItems([...versions.keys()], deps.config.batchSize)) {
      const dataset = await deps.buildRepository.loadByUserIds(userIds, observedAt);
      output.push(...buildUserDocumentsFromDataset(dataset, observedAt, versions));
    }
    return output.sort((left, right) => left.userId - right.userId);
  }
  return {
    buildMany,
    async buildOne(target: DocumentBuildTarget) {
      return (await buildMany([target]))[0] ?? null;
    },
  };
}
