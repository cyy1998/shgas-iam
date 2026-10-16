import { ApisixReadError, ApisixWriteError } from "./apisix.error";
import { isRecord } from "./manifest";
import { createEmptyResourceMap, getDefinition, getResourceId, resourceDefinitions } from "./resources";
import type { FetchLike, ManifestObject, ResourceDefinition, ResourceKind } from "./types";

export class ApisixAdminClient {
  private readonly baseUrl: string;
  private readonly adminKey?: string;
  private readonly fetchImpl: FetchLike;
  private readonly requestTimeoutMs: number;
  private readonly pageSize: number;

  constructor(options: {
    adminUrl: string;
    adminKey?: string;
    fetch?: FetchLike;
    requestTimeoutMs?: number;
    pageSize?: number;
  }) {
    this.baseUrl = options.adminUrl.replace(/\/+$/, "");
    this.adminKey = options.adminKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.pageSize = options.pageSize ?? 500;
    if (
      !Number.isInteger(this.pageSize) ||
      this.pageSize < 10 ||
      this.pageSize > 500 ||
      !Number.isFinite(this.requestTimeoutMs) ||
      this.requestTimeoutMs <= 0
    )
      throw new Error("Invalid APISIX read budget or page size");
  }

  async list(definition: ResourceDefinition, signal?: AbortSignal): Promise<ManifestObject[]> {
    const resources: ManifestObject[] = [];
    const identities = new Set<string>();
    let total: number | undefined;
    for (let page = 1; ; page++) {
      let body: unknown;
      try {
        body = await this.readPage(`${definition.endpoint}?page=${page}&page_size=${this.pageSize}`, signal);
      } catch {
        throw new ApisixReadError("APISIX_READ_UNAVAILABLE");
      }
      if (!isRecord(body) || !Number.isSafeInteger(body.total) || Number(body.total) < 0) {
        throw new ApisixReadError("APISIX_READ_INVALID");
      }
      // Lua's empty table is encoded as {} by APISIX for a zero-item collection.
      const items = Array.isArray(body.list)
        ? body.list
        : body.total === 0 && isRecord(body.list) && Object.keys(body.list).length === 0
          ? []
          : undefined;
      if (!items) throw new ApisixReadError("APISIX_READ_INVALID");
      total ??= Number(body.total);
      // APISIX's default Admin mode may return the complete inventory without applying pagination.
      const completeFirstResponse = page === 1 && items.length === total;
      if (
        body.total !== total ||
        (!completeFirstResponse && items.length !== Math.min(this.pageSize, total - resources.length))
      ) {
        throw new ApisixReadError("APISIX_READ_INVALID");
      }
      for (const item of items) {
        const value = unwrapApisixItem(definition, item);
        const id = getResourceId(definition, value);
        if (!id || identities.has(id)) throw new ApisixReadError("APISIX_READ_INVALID");
        identities.add(id);
        resources.push(value);
      }
      if (resources.length === total) return resources;
    }
  }

  async read(signal?: AbortSignal): Promise<Record<ResourceKind, ManifestObject[]>> {
    return loadRemoteState(this, signal);
  }

  async assertRestorableDeletions(targets: ReadonlyArray<{ kind: ResourceKind; id: string }>, signal?: AbortSignal) {
    for (const target of targets) {
      if (target.kind !== "consumers") continue;
      // Consumer DELETE also removes credential children, which are outside the seven-kind snapshot.
      const body = await this.readPage(`consumers/${encodeURIComponent(target.id)}/credentials`, signal, true);
      if (
        !isRecord(body) ||
        body.total !== 0 ||
        !(Array.isArray(body.list)
          ? body.list.length === 0
          : isRecord(body.list) && Object.keys(body.list).length === 0)
      )
        throw new ApisixReadError("APISIX_READ_INVALID");
    }
  }

  private async readPage(endpoint: string, operationSignal?: AbortSignal, absentCredentials = false): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const signal = operationSignal ? AbortSignal.any([operationSignal, controller.signal]) : controller.signal;
    let onAbort: (() => void) | undefined;
    try {
      signal.throwIfAborted();
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new ApisixReadError("APISIX_READ_UNAVAILABLE"));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      return await Promise.race([this.request("GET", endpoint, undefined, signal, absentCredentials), aborted]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  async upsert(kind: ResourceKind, id: string, resource: ManifestObject, signal?: AbortSignal): Promise<void> {
    await this.writeRequest("PUT", kind, id, resource, signal);
  }

  async delete(kind: ResourceKind, id: string, signal?: AbortSignal): Promise<void> {
    await this.writeRequest("DELETE", kind, id, undefined, signal);
  }

  private async writeRequest(
    method: "PUT" | "DELETE",
    kind: ResourceKind,
    id: string,
    body?: ManifestObject,
    operationSignal?: AbortSignal,
  ) {
    const definition = getDefinition(kind);
    const endpoint = `${definition.endpoint}/${encodeURIComponent(id)}`;
    if (operationSignal?.aborted) throw new ApisixWriteError("rejected");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    const signal = operationSignal ? AbortSignal.any([operationSignal, controller.signal]) : controller.signal;
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new ApisixWriteError("unknown"));
        signal.addEventListener("abort", onAbort, { once: true });
      });
      await Promise.race([
        (async () => {
          const response = await this.fetchImpl(`${this.baseUrl}/${endpoint}`, {
            method,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              ...(this.adminKey ? { "X-API-KEY": this.adminKey } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
          });
          if (method === "DELETE" && response.status === 404) {
            const missing: unknown = await response.json();
            if (isRecord(missing) && Object.keys(missing).length === 1 && missing.message === "Key not found") return;
            throw new ApisixWriteError("rejected");
          }
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            throw new ApisixWriteError(
              response.status >= 400 && response.status < 500 && response.status !== 408 ? "rejected" : "unknown",
            );
          }
          if (method === "PUT" ? response.status !== 200 && response.status !== 201 : response.status !== 200) {
            void response.body?.cancel().catch(() => {});
            throw new ApisixWriteError("unknown");
          }
          const acknowledgement: unknown = await response.json();
          if (!isRecord(acknowledgement)) throw new ApisixWriteError("unknown");
          const node = isRecord(acknowledgement.node) ? acknowledgement.node : acknowledgement;
          const segments = typeof node.key === "string" ? node.key.split("/") : [];
          if (segments.at(-2) !== definition.endpoint || segments.at(-1) !== id) throw new ApisixWriteError("unknown");
          if (method === "DELETE") {
            if (acknowledgement.deleted !== 1 && acknowledgement.deleted !== "1") throw new ApisixWriteError("unknown");
          } else if (!isRecord(node.value) || getResourceId(definition, node.value) !== id) {
            throw new ApisixWriteError("unknown");
          }
        })(),
        aborted,
      ]);
    } catch (error) {
      throw error instanceof ApisixWriteError ? error : new ApisixWriteError("unknown");
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }

  private async request(
    method: string,
    endpoint: string,
    body?: unknown,
    signal?: AbortSignal,
    absentCredentials = false,
  ): Promise<unknown> {
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
      signal,
    });

    if (absentCredentials && response.status === 404) {
      const missing: unknown = await response.json();
      if (isRecord(missing) && Object.keys(missing).length === 1 && missing.message === "Key not found")
        return { total: 0, list: [] };
      throw new ApisixReadError("APISIX_READ_INVALID");
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`APISIX Admin API ${method} ${endpoint} failed: ${response.status} ${text}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}

export async function loadRemoteState(
  client: ApisixAdminClient,
  signal?: AbortSignal,
): Promise<Record<ResourceKind, ManifestObject[]>> {
  const remote = createEmptyResourceMap();

  for (const definition of resourceDefinitions) {
    remote[definition.kind] = await client.list(definition, signal);
  }

  return remote;
}

function unwrapApisixItem(definition: ResourceDefinition, item: unknown): ManifestObject {
  if (!isRecord(item) || typeof item.key !== "string" || !isRecord(item.value)) {
    throw new ApisixReadError("APISIX_READ_INVALID");
  }
  const segments = item.key.split("/");
  const id = segments.at(-1);
  if (!id || segments.at(-2) !== definition.endpoint) throw new ApisixReadError("APISIX_READ_INVALID");
  const value = { ...item.value };
  for (const field of definition.idFields) {
    const identity = value[field];
    if (
      identity !== undefined &&
      ((typeof identity !== "string" && typeof identity !== "number") || String(identity) !== id)
    )
      throw new ApisixReadError("APISIX_READ_INVALID");
  }
  const identityField = definition.idFields[0];
  if (!identityField) throw new ApisixReadError("APISIX_READ_INVALID");
  value[identityField] = id;
  return value;
}
