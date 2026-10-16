import { BAD_GATEWAY } from "@iam/api-core/core/http-status-codes";
import { z } from "zod";
import { isRecord } from "../../manifest";
import { getDefinition, getResourceId } from "../../resources";
import type { ManifestObject, PlannedChange } from "../../types";
import { GatewayError } from "./gateway.error";

const text = z.string().min(1);
const identity = z.union([
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  z.number().int().positive(),
]);
const plugins = z.record(z.string(), z.unknown());
const upstream = z
  .looseObject({
    nodes: z
      .union([
        z.record(z.string(), z.number().int().nonnegative()),
        z.array(
          z.looseObject({
            host: text,
            weight: z.number().int().nonnegative(),
            port: z.number().int().min(1).max(65535).optional(),
          }),
        ),
      ])
      .optional(),
    service_name: text.optional(),
    discovery_type: text.optional(),
  })
  .refine(
    (value) => (value.nodes !== undefined) !== (value.service_name !== undefined && value.discovery_type !== undefined),
  );
const route = z
  .looseObject({
    id: identity,
    uri: text.max(4096).optional(),
    uris: z.array(z.string()).min(1).optional(),
    plugins: plugins.optional(),
    upstream: upstream.optional(),
    upstream_id: identity.optional(),
    service_id: identity.optional(),
    plugin_config_id: identity.optional(),
    script: z.string().min(10).max(102400).optional(),
  })
  .refine((value) => (value.uri !== undefined) !== (value.uris !== undefined))
  .refine((value) =>
    [value.plugins, value.upstream, value.upstream_id, value.service_id, value.script].some(
      (item) => item !== undefined,
    ),
  )
  .refine(
    (value) => value.script === undefined || (value.plugins === undefined && value.plugin_config_id === undefined),
  );
const ssl = z
  .looseObject({
    id: identity,
    type: z.enum(["server", "client"]).optional(),
    cert: text,
    key: text,
    sni: text.optional(),
    snis: z.array(text).min(1).optional(),
    client: z.looseObject({ ca: text }).optional(),
  })
  .refine((value) => value.type === "client" || (value.sni !== undefined) !== (value.snis !== undefined));

// APISIX 3.16 schema_def.lua's required resource structure, including inline upstreams.
// Plugin schemas/metadata remain opaque, and SSL keys may already be encrypted by APISIX.
const writableShapes = {
  upstreams: upstream.and(z.looseObject({ id: identity })),
  routes: route,
  services: z.looseObject({
    id: identity,
    plugins: plugins.optional(),
    upstream: upstream.optional(),
    upstream_id: identity.optional(),
  }),
  plugin_configs: z.looseObject({ id: identity, plugins }),
  plugin_metadata: z.looseObject({ id: text }),
  consumers: z.looseObject({
    username: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[a-zA-Z0-9_-]+$/),
    plugins: plugins.optional(),
  }),
  ssls: ssl,
};

/** Construct every inverse before writing; validation never replaces or trims business values. */
export function writableSnapshot(change: PlannedChange, value: unknown): ManifestObject {
  if (!isRecord(value) || getResourceId(getDefinition(change.kind), value) !== change.id)
    throw new GatewayError("GATEWAY_SNAPSHOT_INVALID", "A writable resource snapshot is required", BAD_GATEWAY);
  let result: ManifestObject;
  try {
    result = structuredClone(value);
    JSON.stringify(result);
  } catch {
    throw new GatewayError("GATEWAY_SNAPSHOT_INVALID", "A serializable resource snapshot is required", BAD_GATEWAY);
  }
  for (const field of ["create_time", "update_time", "modifiedIndex"]) delete result[field];
  if (!writableShapes[change.kind].safeParse(result).success)
    throw new GatewayError(
      "GATEWAY_SNAPSHOT_INVALID",
      "A complete writable resource snapshot is required",
      BAD_GATEWAY,
    );
  return result;
}
