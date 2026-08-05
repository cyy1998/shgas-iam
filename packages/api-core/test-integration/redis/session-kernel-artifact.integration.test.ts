import type {
  RedisTestHarness,
  SessionKernelRedisTestScope,
} from "./redis-test-harness";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

let harness: RedisTestHarness | undefined;
let scope: SessionKernelRedisTestScope | undefined;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createSessionKernelScope();
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Session Kernel artifact real Redis contract", () => {
  test("atomically consumes an artifact once across Redis clients", async () => {
    const principalSession = await scope!.writer.createPrincipalSession(
      subjectIdentifier,
    );
    if (principalSession.status !== "created")
      throw new Error("expected a Principal Session fixture");

    const artifact = await scope!.writer.createProtocolArtifact({
      artifactType: "authorization_code",
      clientCode: "gateway",
      principalSessionId: principalSession.value.principalSessionId,
      protocol: "custom-sso",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created" || artifact.externalToken === undefined)
      throw new Error("expected an authorization artifact fixture");

    const results = await Promise.all([
      scope!.writer.consumeProtocolArtifact(artifact.externalToken),
      scope!.observer.consumeProtocolArtifact(artifact.externalToken),
    ]);

    expect(results.map(result => result.status).sort()).toEqual([
      "consumed_replay",
      "resolved",
    ]);
    const replay = await scope!.observer.consumeProtocolArtifact(
      artifact.externalToken,
    );
    expect(replay).toMatchObject({
      status: "consumed_replay",
    });
  });

  test("does not consume an artifact whose payload changes after resolution", async () => {
    const artifact = await scope!.writer.createProtocolArtifact({
      artifactType: "authorization_code",
      clientCode: "gateway",
      protocol: "custom-sso",
      ttlMs: 30_000,
    });
    if (artifact.status !== "created" || artifact.externalToken === undefined)
      throw new Error("expected an authorization artifact fixture");

    scope!.replaceArtifactPayloadBeforeNextValidation({
      artifactId: artifact.value.artifactId,
      serializedPayload: JSON.stringify({
        ...artifact.value,
        artifactType: "replaced_authorization_code",
      }),
    });

    const result = await scope!.writer.consumeProtocolArtifact(
      artifact.externalToken,
    );
    expect(result).toMatchObject({
      status: "missing_or_expired",
    });
  });
});
