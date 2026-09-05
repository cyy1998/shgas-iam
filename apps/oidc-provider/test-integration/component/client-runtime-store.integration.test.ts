import type { ClientRuntimeSnapshotReader } from "@iam/api-core/client-runtime-snapshot";
import type { OidcClientRuntimeDto } from "@iam/domain/client";
import type { OidcClientRuntimeMetadata } from "../../src/provider/client/client-runtime-metadata.ts";
import {
  ClientRuntimeSnapshotUnavailableError,
} from "@iam/api-core/client-runtime-snapshot";
import {
  createClientRuntimeSnapshotModuleWithAtomicStore,
  InMemoryClientRuntimeSnapshotAtomicStore,
} from "@iam/api-core/client-runtime-snapshot/testing";
import {
  ClientStatus,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { errors } from "oidc-provider";
import { describe, expect, it, vi } from "vitest";
import {
  createOidcClientRuntimeSnapshotAdapter,
  createOidcClientRuntimeStore,
} from "../../src/stores/client-runtime.store.ts";

const activeClient: OidcClientRuntimeDto = {
  id: 7,
  clientCode: "client-a",
  clientName: "Client A",
  status: ClientStatus.Enable,
  isDelete: false,
  oidcEnabled: true,
  oidcConfigVersion: 3,
  oidcConfig: {
    clientType: OidcClientType.Public,
    tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
    redirectUris: ["https://client.example/callback"],
    postLogoutRedirectUris: [],
    allowedScopes: [OidcScope.OpenId],
  },
};

describe("oIDC Client Runtime Snapshot adapter", () => {
  it.each([
    ["active", activeClient, "present"],
    ["maintenance", { ...activeClient, status: ClientStatus.Maintenance }, "present"],
    ["missing", null, "absent"],
    ["disabled", { ...activeClient, status: ClientStatus.Disable }, "absent"],
    ["deleted", { ...activeClient, isDelete: true }, "absent"],
    ["OIDC disabled", { ...activeClient, oidcEnabled: false }, "absent"],
    ["unconfigured", { ...activeClient, oidcConfig: null }, "absent"],
  ] as const)("maps %s source state to the expected Snapshot", async (_label, record, expectedKind) => {
    const adapter = createOidcClientRuntimeSnapshotAdapter({
      cacheTtlSeconds: 60,
      repository: { findRuntimeRecord: vi.fn(async () => record) },
    });

    const result = await adapter.load("client-a");

    expect(result.kind).toBe(expectedKind);
    if (result.kind === "present") {
      expect(result.value).toMatchObject({
        client_id: "client-a",
        oidc_config_version: 3,
      });
    }
    expect(adapter.presentTtlMs).toBe(60_000);
    expect(adapter.absentTtlMs).toBeUndefined();
  });

  it("round-trips valid metadata and rejects malformed payloads", () => {
    const adapter = createOidcClientRuntimeSnapshotAdapter({
      cacheTtlSeconds: 60,
      repository: { findRuntimeRecord: vi.fn() },
    });
    const metadata = adapter.codec.encode(runtimeMetadata());

    expect(adapter.codec.decode(metadata)).toEqual(metadata);
    expect(() => adapter.codec.decode({ client_id: "client-a" })).toThrow();
  });
});

describe("oIDC client runtime facade", () => {
  it("discards a source read invalidated before publish on both lookup seams", async () => {
    const store = new InMemoryClientRuntimeSnapshotAtomicStore();
    let current = activeClient;
    let releaseFirstSource!: () => void;
    let markFirstSourceStarted!: () => void;
    const firstSourceStarted = new Promise<void>((resolve) => {
      markFirstSourceStarted = resolve;
    });
    const firstSourceGate = new Promise<void>((resolve) => {
      releaseFirstSource = resolve;
    });
    let firstSource = true;
    const findRuntimeRecord = vi.fn(async () => {
      const captured = current;
      if (firstSource) {
        firstSource = false;
        markFirstSourceStarted();
        await firstSourceGate;
      }
      return captured;
    });
    const snapshots = createClientRuntimeSnapshotModuleWithAtomicStore({
      store,
      adapters: [createOidcClientRuntimeSnapshotAdapter({
        cacheTtlSeconds: 60,
        repository: { findRuntimeRecord },
      })],
      createEpoch: () => "oidc-component-epoch",
    });
    const facade = createOidcClientRuntimeStore(snapshots.reader("oidc"));

    const lateRuntime = facade.findRuntime("client-a");
    await firstSourceStarted;
    current = {
      ...activeClient,
      clientName: "Client A v2",
      oidcConfigVersion: 4,
    };
    await snapshots.invalidateClient("client-a");
    releaseFirstSource();
    const runtime = await lateRuntime;
    const activeVersion = await facade.findActiveVersion("client-a");

    expect(runtime).toMatchObject({
      client_name: "Client A v2",
      oidc_config_version: 4,
    });
    expect(activeVersion).toBe(4);
    expect(findRuntimeRecord).toHaveBeenCalledTimes(2);
  });

  it("projects present and absent Snapshots through both runtime lookup seams", async () => {
    const presentReader: ClientRuntimeSnapshotReader<OidcClientRuntimeMetadata> = {
      acquire: vi.fn(async () => ({ kind: "present" as const, value: runtimeMetadata() })),
    };
    const present = createOidcClientRuntimeStore(presentReader);
    const absent = createOidcClientRuntimeStore({
      acquire: vi.fn(async () => ({ kind: "absent" as const })),
    });

    await expect(present.findRuntime("client-a")).resolves.toMatchObject({ client_id: "client-a" });
    await expect(present.findActiveVersion("client-a")).resolves.toBe(3);
    await expect(absent.findRuntime("client-missing")).resolves.toBeNull();
    await expect(absent.findActiveVersion("client-missing")).resolves.toBeNull();
  });

  it("maps Snapshot acquisition failures to OIDC temporarily_unavailable on both seams", async () => {
    const facade = createOidcClientRuntimeStore({
      acquire: vi.fn(async () => {
        throw new ClientRuntimeSnapshotUnavailableError();
      }),
    });

    await expect(facade.findRuntime("client-a")).rejects.toBeInstanceOf(errors.TemporarilyUnavailable);
    await expect(facade.findActiveVersion("client-a")).rejects.toBeInstanceOf(errors.TemporarilyUnavailable);
  });
});

function runtimeMetadata(): OidcClientRuntimeMetadata {
  return {
    client_id: "client-a",
    client_name: "Client A",
    redirect_uris: ["https://client.example/callback"],
    post_logout_redirect_uris: [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    subject_type: "public",
    id_token_signed_response_alg: "RS256",
    require_auth_time: true,
    token_endpoint_auth_method: "none",
    scope: "openid",
    iam_client_id: 7,
    oidc_config_version: 3,
    allowed_scopes: ["openid"],
  };
}
