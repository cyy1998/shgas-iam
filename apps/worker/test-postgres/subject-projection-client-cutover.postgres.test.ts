import type { WorkerPostgresTestHarness } from "./postgres-test-harness";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { clients } from "@iam/db/schema";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { createSubjectProjectionClientCutover } from "../src/commands/subject-projection-client-cutover";
import { createSubjectProjectionClientCutoverRepository } from "../src/commands/subject-projection-client-cutover.repository";
import { SubjectProjectionCutoverManifestSchema } from "../src/commands/subject-projection-cutover.manifest";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

let harness: WorkerPostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createWorkerPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Subject Projection Client cutover PostgreSQL contract", () => {
  test("includes disabled intent, excludes deleted clients, and applies/verifies idempotently", async () => {
    const db = harness!.db;
    await db.insert(clients).values([{
      clientCode: "disabled-legacy",
      clientName: "Disabled legacy",
      clientSecret: "legacy-secret",
      status: ClientStatus.Disable,
      extAttributes: {
        owner: "platform",
        managementLevel: "Gateway",
        requireOrcas: true,
        validRedirectUrls: ["https://legacy.example.com/*"],
        userExcluding: ["alice"],
        callbackEndpoint: "https://legacy.example.com/callback",
        logoutEndpoint: "https://legacy.example.com/logout",
      },
    }, {
      clientCode: "deleted-legacy",
      clientName: "Deleted legacy",
      clientSecret: "legacy-secret",
      status: ClientStatus.Enable,
      isDelete: true,
      extAttributes: { managementLevel: "Independent" },
    }]);
    const repository = createSubjectProjectionClientCutoverRepository(db);

    const inventory = await repository.readInventory([
      "disabled-legacy",
      "deleted-legacy",
    ]);
    expect(inventory).toMatchObject({
      legacyEnabledClientCodes: ["disabled-legacy"],
      records: [{ clientCode: "disabled-legacy" }],
    });

    const cutover = createSubjectProjectionClientCutover({
      clients: repository,
      secrets: {
        generate: () => "must-not-generate",
        hash: async () => "must-not-hash",
      },
    });
    const manifest = SubjectProjectionCutoverManifestSchema.parse({
      version: 1,
      cutoverId: "subject-projection-client-pg-v1",
      clients: [{
        clientCode: "disabled-legacy",
        targetEnabled: true,
        config: {
          mode: CustomSsoClientMode.Gateway,
          validRedirectUrls: ["https://disabled.example.com/sso/*"],
          subjectClaimCatalogVersion: 1,
          subjectClaims: [SubjectClaim.SubjectIdentifier],
          orcas: { enabled: false },
        },
        secretDelivery: { status: "not-required" },
      }],
    });

    expect(await cutover.applyManifest(manifest)).toEqual({
      blockers: [],
      generatedSecrets: [],
    });
    expect(await cutover.verifyManifest(manifest)).toEqual({ failures: [] });
    expect(await cutover.applyManifest(manifest)).toEqual({
      blockers: [],
      generatedSecrets: [],
    });

    const [configured] = await db.select({
      customSsoEnabled: clients.customSsoEnabled,
      customSsoConfigVersion: clients.customSsoConfigVersion,
      extAttributes: clients.extAttributes,
      status: clients.status,
    }).from(clients).where(eq(clients.clientCode, "disabled-legacy"));
    expect(configured).toEqual({
      customSsoEnabled: true,
      customSsoConfigVersion: 1,
      extAttributes: { owner: "platform" },
      status: ClientStatus.Disable,
    });

    const deletedManifest = SubjectProjectionCutoverManifestSchema.parse({
      ...manifest,
      clients: [
        manifest.clients[0]!,
        {
          ...manifest.clients[0]!,
          clientCode: "deleted-legacy",
        },
      ],
    });
    expect(await cutover.verifyManifest(deletedManifest)).toEqual({
      failures: [{
        clientCode: "deleted-legacy",
        reason: "manifest-client-not-found",
      }],
    });
  });
});
