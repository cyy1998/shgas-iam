import type { FetchLike, ManifestObject, ResourceDefinition, ResourceKind } from "./types";
import { isRecord } from "./manifest";
import { createEmptyResourceMap, getDefinition, getResourceId, resourceDefinitions } from "./resources";

export class ApisixAdminClient {
  private readonly baseUrl: string;
  private readonly adminKey?: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: { adminUrl: string; adminKey?: string; fetch?: FetchLike }) {
    this.baseUrl = options.adminUrl.replace(/\/+$/, "");
    this.adminKey = options.adminKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async list(definition: ResourceDefinition): Promise<ManifestObject[]> {
    const body = await this.request("GET", definition.endpoint);
    return unwrapApisixList(definition, body);
  }

  async upsert(kind: ResourceKind, id: string, resource: ManifestObject): Promise<void> {
    const definition = getDefinition(kind);
    await this.request("PUT", `${definition.endpoint}/${encodeURIComponent(id)}`, resource);
  }

  async delete(kind: ResourceKind, id: string): Promise<void> {
    const definition = getDefinition(kind);
    await this.request("DELETE", `${definition.endpoint}/${encodeURIComponent(id)}`);
  }

  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.adminKey) {
      headers["X-API-KEY"] = this.adminKey;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchImpl(`${this.baseUrl}/${endpoint.replace(/^\/+/, "")}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`APISIX Admin API ${method} ${endpoint} failed: ${response.status} ${text}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}

export async function loadRemoteState(client: ApisixAdminClient): Promise<Record<ResourceKind, ManifestObject[]>> {
  const remote = createEmptyResourceMap();

  for (const definition of resourceDefinitions) {
    remote[definition.kind] = await client.list(definition);
  }

  return remote;
}

function unwrapApisixList(definition: ResourceDefinition, body: unknown): ManifestObject[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (!isRecord(body)) {
    return [];
  }

  const candidate = Array.isArray(body.list)
    ? body.list
    : isRecord(body.value) && Array.isArray(body.value.list)
      ? body.value.list
      : Array.isArray(body.value)
        ? body.value
        : [];

  return candidate
    .map((item) => {
      if (!isRecord(item)) {
        return undefined;
      }

      const value = isRecord(item.value) ? { ...item.value } : { ...item };
      if (!getResourceId(definition, value) && typeof item.key === "string") {
        const id = item.key.split("/").filter(Boolean).at(-1);
        const idField = definition.idFields[0];
        if (id && idField) {
          value[idField] = id;
        }
      }
      return value;
    })
    .filter(isRecord);
}
