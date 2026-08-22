import { formatDirtyVersion } from "./dirty-version";

export interface VersionedUserProfileBuildTarget {
  userId: number;
  sourceDirtyVersion: string;
}

export function normalizeVersionedBuildTargets(
  targets: readonly VersionedUserProfileBuildTarget[],
) {
  const result = new Map<number, string>();
  for (const target of targets) {
    const sourceDirtyVersion = formatDirtyVersion(target.sourceDirtyVersion);
    const existingVersion = result.get(target.userId);
    if (existingVersion !== undefined && existingVersion !== sourceDirtyVersion) {
      throw new Error(`User Profile ${target.userId} cannot be built for multiple Dirty Versions`);
    }
    result.set(target.userId, sourceDirtyVersion);
  }
  return result;
}

export function groupItemsBy<T, K>(items: readonly T[], keyOf: (item: T) => K) {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

export function chunkItems<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

export function compareCodes(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
