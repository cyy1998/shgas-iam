import type { ChangePlan, LoadedManifest, ManifestObject, PlannedChange, ResourceKind } from "./types";
import { normalizeForCompare, stableStringify } from "./normalize";
import { isDynamicRegistryManaged, isInManifestScope, isRepoManaged } from "./ownership-policy";
import { getResourceId, resourceDefinitions } from "./resources";

export function planChanges(manifest: LoadedManifest, remote: Record<ResourceKind, ManifestObject[]>): ChangePlan {
  const plan: ChangePlan = {
    creates: [],
    updates: [],
    deletes: [],
    ignored: [],
  };

  for (const definition of resourceDefinitions) {
    const desired = new Map<string, ManifestObject>();

    for (const resource of manifest.resources[definition.kind]) {
      const id = getResourceId(definition, resource);
      if (id) {
        desired.set(id, resource);
      }
    }

    const remoteById = new Map<string, ManifestObject>();
    for (const resource of remote[definition.kind] ?? []) {
      const id = getResourceId(definition, resource);
      if (id) {
        remoteById.set(id, resource);
      }
    }

    for (const [id, desiredResource] of desired.entries()) {
      const remoteResource = remoteById.get(id);
      if (!remoteResource) {
        plan.creates.push({ kind: definition.kind, id, desired: desiredResource });
        continue;
      }

      const desiredNormalized = stableStringify(normalizeForCompare(definition.kind, desiredResource));
      const remoteNormalized = stableStringify(normalizeForCompare(definition.kind, remoteResource));
      if (desiredNormalized !== remoteNormalized) {
        plan.updates.push({ kind: definition.kind, id, desired: desiredResource, remote: remoteResource });
      }
    }

    for (const [id, remoteResource] of remoteById.entries()) {
      if (desired.has(id)) {
        continue;
      }

      if (isDynamicRegistryManaged(remoteResource)) {
        plan.ignored.push({ kind: definition.kind, id, remote: remoteResource, reason: "dynamic" });
      }
      else if (isRepoManaged(remoteResource)) {
        if (isInManifestScope(remoteResource, manifest.scope)) {
          plan.deletes.push({ kind: definition.kind, id, remote: remoteResource });
        }
        else {
          plan.ignored.push({ kind: definition.kind, id, remote: remoteResource, reason: "out_of_scope" });
        }
      }
      else {
        plan.ignored.push({ kind: definition.kind, id, remote: remoteResource, reason: "unmanaged" });
      }
    }
  }

  return plan;
}

export function sortChanges(changes: PlannedChange[], order: ResourceKind[]): PlannedChange[] {
  return [...changes].sort((left, right) => {
    const leftIndex = order.indexOf(left.kind);
    const rightIndex = order.indexOf(right.kind);
    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  });
}
