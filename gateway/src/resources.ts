import type { ManifestObject, ResourceDefinition, ResourceKind } from "./types";

const generatedRemoteFields = ["create_time", "update_time", "modifiedIndex", "key"];

const commonCompare = {
  ignoreFields: generatedRemoteFields,
  defaultValues: {},
};

export const resourceDefinitions = [
  {
    kind: "upstreams",
    fileName: "upstreams.yaml",
    topKey: "upstreams",
    endpoint: "upstreams",
    idFields: ["id"],
    syncOrder: 10,
    references: [],
    compare: {
      ...commonCompare,
      defaultValues: {
        hash_on: "vars",
      },
    },
  },
  {
    kind: "plugin_configs",
    fileName: "plugin-configs.yaml",
    topKey: "plugin_configs",
    endpoint: "plugin_configs",
    idFields: ["id"],
    syncOrder: 20,
    references: [],
    compare: commonCompare,
  },
  {
    kind: "services",
    fileName: "services.yaml",
    topKey: "services",
    endpoint: "services",
    idFields: ["id"],
    syncOrder: 30,
    references: [
      { field: "upstream_id", targetKind: "upstreams", targetName: "upstream" },
    ],
    compare: commonCompare,
  },
  {
    kind: "consumers",
    fileName: "consumers.yaml",
    topKey: "consumers",
    endpoint: "consumers",
    idFields: ["username", "id"],
    syncOrder: 40,
    references: [],
    compare: commonCompare,
  },
  {
    kind: "ssls",
    fileName: "ssl.yaml",
    topKey: "ssls",
    endpoint: "ssls",
    idFields: ["id"],
    syncOrder: 50,
    references: [],
    compare: commonCompare,
  },
  {
    kind: "routes",
    fileName: "routes.yaml",
    topKey: "routes",
    endpoint: "routes",
    idFields: ["id"],
    syncOrder: 60,
    references: [
      { field: "service_id", targetKind: "services", targetName: "service" },
      { field: "upstream_id", targetKind: "upstreams", targetName: "upstream" },
      { field: "plugin_config_id", targetKind: "plugin_configs", targetName: "plugin_config" },
    ],
    compare: {
      ...commonCompare,
      defaultValues: {
        priority: 0,
        status: 1,
      },
    },
  },
] satisfies ResourceDefinition[];

export const writeOrder = [...resourceDefinitions]
  .sort((left, right) => left.syncOrder - right.syncOrder)
  .map(definition => definition.kind);

export const deleteOrder = [...writeOrder].reverse();

export function getDefinition(kind: ResourceKind): ResourceDefinition {
  const definition = resourceDefinitions.find(item => item.kind === kind);
  if (!definition) {
    throw new Error(`Unknown resource kind: ${kind}`);
  }
  return definition;
}

export function getResourceId(definition: ResourceDefinition, resource: ManifestObject): string | undefined {
  for (const field of definition.idFields) {
    const value = resource[field];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

export function createEmptyResourceMap(): Record<ResourceKind, ManifestObject[]> {
  return Object.fromEntries(
    resourceDefinitions.map(definition => [definition.kind, []]),
  ) as unknown as Record<ResourceKind, ManifestObject[]>;
}

export function countResources(resources: Record<ResourceKind, ManifestObject[]>): Record<ResourceKind, number> {
  return Object.fromEntries(
    resourceDefinitions.map(definition => [definition.kind, resources[definition.kind].length]),
  ) as Record<ResourceKind, number>;
}
