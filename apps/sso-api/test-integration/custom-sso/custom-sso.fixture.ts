import { randomUUID } from "node:crypto";
import process from "node:process";
import { createErrorHandler } from "@iam/api-core/middlewares";
import type { ClientSnapshotSource, ClientSnapshotValue } from "@iam/client-snapshot";
import { ClientSnapshotUnavailableError } from "@iam/client-snapshot";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { type ClientCredentialSource, createClientSecretAuthenticator } from "@iam/client-snapshot/credentials";
import type { SubjectFactsSnapshot } from "@iam/client-subject-projection";
import { ClientSsoCallbackType, ClientSsoProtocol, ClientStatus, SubjectClaim } from "@iam/contracts";
import type { UnifiedCustomSsoAuthorizationOptions } from "@iam/custom-sso";
import { createUnifiedCustomSsoRedisTestScope } from "@iam/custom-sso/testing";
import { relations } from "@iam/db/relations";
import { createSubjectFactsReader, createSubjectFactsRedisCache } from "@iam/documents/user/subject-facts";
import { createUnifiedSessionRedisTestScope } from "@iam/session-kernel/testing";
import type { SubjectAccessOperation } from "@iam/subject-access";
import {
  createSubjectAccessBarrier,
  requireSubjectAccessOperation,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/subject-access";
import { createRedisSubjectAccessStore, createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { createCustomSsoComposition } from "@sso-api/composition/custom-sso";
import { createProtocolOperations } from "@sso-api/composition/sessions";
import { drizzle } from "drizzle-orm/postgres-js";
import { Hono } from "hono";
import Redis from "ioredis";
import postgres from "postgres";
import { cleanupAfterFixtureFailure, closeFixtureResources } from "../oidc/oidc.fixture";
import { closeApiRedisConnection, ownApiTestExecutor } from "../support/fixture-lifecycle";
import { createTestUserSession } from "../support/test-user-session.fixture";

export async function fixture(
  codeTtlSeconds = 30,
  networkUrl?: string,
  tokenTtlSeconds = 45,
  continuationTtlSeconds = 60,
  subjectFacts?: { read: (subject: string) => Promise<SubjectFactsSnapshot | null> },
  admission?: {
    evaluator: UnifiedCustomSsoAuthorizationOptions["admission"];
    source: ClientSnapshotSource & ClientCredentialSource;
  },
  wechatQrEnabled = false,
) {
  const url = networkUrl ?? process.env.IAM_TEST_REDIS_URL;
  if (!url) throw new Error("IAM_TEST_REDIS_URL is required");
  const resources: Array<() => unknown | Promise<unknown>> = [];
  let stopped = false;
  const close = ownApiTestExecutor(async () => {
    stopped = true;
    await closeFixtureResources(resources);
  });
  try {
    const trackStop = (stop: () => Promise<void>) => {
      resources.push(stop);
    };
    const scope = await createUnifiedSessionRedisTestScope(url, { user: 120, client: 60 }, trackStop);
    scope.close = close;
    const codes = await createUnifiedCustomSsoRedisTestScope(url, trackStop);
    const admissionSnapshots = admission && createClientSnapshots({ redis: codes.redis, source: admission.source });
    const kernel = scope.createFactoryForOperations<SubjectAccessOperation>(requireSubjectAccessOperation);
    const subjectIdentifier = randomUUID();
    const businessClientCode = networkUrl ? `sample-${randomUUID()}` : "app";
    const user = {
      id: 1001,
      subjectIdentifier,
      username: "138550",
    };
    const state = {
      generation: randomUUID(),
      permission: "enabled",
      permissionReads: 0,
      factsReads: 0,
      clientReads: 0,
      clientUnavailable: false,
      gatewayAuditFails: false,
      businessAuditFails: false,
    };
    const audits: Array<{ action: string; outcome: string }> = [];
    const warnings: unknown[] = [];
    const logger = {
      info() {},
      warn(fields: unknown) {
        warnings.push(fields);
      },
      error() {},
      bindings: () => ({ sourceApp: "root-test" }),
    };
    let duringFacts: (() => Promise<void>) | undefined;
    let client: ClientSnapshotValue = {
      clientCode: "iam",
      status: ClientStatus.Enable,
      admissionEnabled: false,
      admissionFilter: null,
      ssoEnabled: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Business,
        callbackEndpoint: "https://app.example/callback",
        validRedirectUrls: ["https://app.example/callback"],
        subjectClaims: [SubjectClaim.SubjectIdentifier, SubjectClaim.ProfileName],
      },
    };
    // Cost samples use the real warm cache owners; source rows are seeded before the sample.
    const network = networkUrl
      ? new Redis(networkUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null })
      : undefined;
    if (network) resources.push(() => closeApiRedisConnection(network));
    const networkPrefix = `${codes.namespace}:network:`;
    const sourceCounts = { client: 0, credential: 0, factsSql: 0 };
    const sql =
      network &&
      postgres({
        host: "127.0.0.1",
        port: 1,
        connect_timeout: 1,
        debug() {
          sourceCounts.factsSql++;
        },
      });
    if (sql) resources.push(() => sql.end());
    const snapshots =
      network &&
      createClientSnapshots({
        redis: network,
        source: {
          async loadClient(code) {
            sourceCounts.client++;
            if (code !== businessClientCode) throw new Error("Network fixture Client is outside its owned scope");
            return { ...client, clientCode: code };
          },
          async loadCredential(code) {
            sourceCounts.credential++;
            if (code !== businessClientCode) throw new Error("Network fixture credential is outside its owned scope");
            return {
              secret: "business-secret",
              credentialId: randomUUID(),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      });
    const realBarrier =
      network &&
      createSubjectAccessBarrier({
        store: createRedisSubjectAccessStore({ redis: network, keyPrefix: networkPrefix }),
        clock: { nowDate: () => new Date() },
        random: { uuid: randomUUID },
      });
    const factsCache = network && createSubjectFactsRedisCache(network, { keyPrefix: `${networkPrefix}facts:` });
    const realFacts =
      sql && factsCache && createSubjectFactsReader({ db: drizzle({ client: sql, relations }), cache: factsCache });
    if (network && factsCache) {
      await network.ping();
      await createSubjectAccessBootstrap({
        redis: network,
        keyPrefix: networkPrefix,
        random: { uuid: () => state.generation },
      }).seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
      await factsCache.publish({
        kind: "document",
        userId: user.id,
        schemaVersion: 1,
        sourceVersion: "1",
        publishedAt: new Date().toISOString(),
        subjectIdentifier,
        facts: { profile: { username: user.username, name: "已发布资料", phone: null }, employments: [] },
      });
    }
    const loggerOptions = { logger, loginEndpoint: "/portal/login", retryAfterSeconds: 3 };
    const operations = createProtocolOperations(kernel, {
      async readCommittedTransitionId() {
        state.permissionReads++;
        if (realBarrier) return await realBarrier.readCommittedTransitionId(subjectIdentifier);
        if (state.permission === "disabled") throw new SubjectAccessDisabledError();
        if (state.permission === "unknown") throw new SubjectAccessUnavailableError();
        return state.generation;
      },
    });
    const clients = admissionSnapshots?.client ?? {
      async acquire(code: string) {
        state.clientReads++;
        if (state.clientUnavailable) throw new ClientSnapshotUnavailableError();
        if (snapshots && code !== businessClientCode)
          throw new Error("Network fixture refuses unowned Client acquisition");
        if (snapshots) return await snapshots.client.acquire(code);
        return { kind: "present" as const, value: { ...client, clientCode: code } };
      },
    };
    const composition = createCustomSsoComposition({
      ...loggerOptions,
      wechatQrEnabled,
      operations,
      authorization: {
        kernel,
        clients,
        redis: codes.redis,
        namespace: codes.namespace,
        codeTtlSeconds,
        continuationTtlSeconds,
        admission: admission?.evaluator ?? {
          evaluate() {
            throw new Error("Admission requires a published User Document fixture");
          },
        },
      },
      access: {
        tokenTtlSeconds,
        business: {
          audit: {
            async recordAuditLog(input) {
              if (state.businessAuditFails) throw new Error("Business audit unavailable");
              audits.push(input);
            },
          },
          logger,
        },
        managed: {
          audit: {
            async recordAuditLog(input) {
              if (state.gatewayAuditFails) throw new Error("Gateway audit unavailable");
              audits.push(input);
            },
          },
          logger,
        },
        credentials: {
          async authenticate(clientCode, secret) {
            if (snapshots && clientCode !== businessClientCode)
              throw new Error("Network fixture refuses unowned Client authentication");
            if (snapshots) {
              return await createClientSecretAuthenticator(snapshots.credential).authenticate(clientCode, secret);
            }
            if (secret === "unknown") throw new SubjectAccessUnavailableError();
            return secret === "business-secret" ? { clientCode } : null;
          },
        },
      },
      subjectFacts: {
        async read() {
          state.factsReads++;
          if (realFacts) return await realFacts.read(subjectIdentifier);
          if (subjectFacts) return await subjectFacts.read(subjectIdentifier);
          await duringFacts?.();
          return {
            subjectIdentifier,
            sourceVersion: "1",
            profile: { username: user.username, name: "已发布资料", phone: null },
            employments: [],
          };
        },
      },
    });
    const app = new Hono();
    app.onError(createErrorHandler(logger));
    app.route("/sso", composition.router);
    if (stopped) throw new Error("Root Auth fixture stopped during initialization");
    return {
      ...composition,
      app,
      scope,
      close,
      codes,
      kernel,
      state,
      sourceCounts,
      businessClientCode,
      invalidateClient: admissionSnapshots?.invalidateClient,
      audits,
      warnings,
      subjectIdentifier,
      operations,
      login: () => createTestUserSession(kernel, operations, subjectIdentifier),
      setClient(value: ClientSnapshotValue) {
        client = value;
      },
      getClient: () => client,
      duringFacts(action: () => Promise<void>) {
        duringFacts = action;
      },
    };
  } catch (failure) {
    return await cleanupAfterFixtureFailure(failure, close);
  }
}
