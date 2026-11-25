import { randomUUID } from "node:crypto";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import { createSubjectAccessBarrier, encodeSubjectAccessContext } from "@iam/subject-access";
import { createRedisSubjectAccessStore } from "@iam/subject-access/redis";
import type { Env } from "@integration-api/env";
import type Redis from "ioredis";

export function createSessionFixture(redis: Redis, env: Env) {
  const barrier = createSubjectAccessBarrier({
    store: createRedisSubjectAccessStore({ redis }),
    clock: { nowDate: () => new Date() },
    random: { uuid: randomUUID },
  });
  const sessions = createUnifiedSessionKernel<object>({
    redis,
    ...env.sessionKernel,
    assertOperationActive() {},
  }).forOperation({});
  async function setAccess(subjectIdentifier: string, state: "enabled" | "disabled") {
    const transition = await barrier.beginBlocking(subjectIdentifier);
    await barrier.prepareRepair(transition, state);
    await barrier.finalize(transition, state);
    return transition.transitionId;
  }

  return {
    setAccess,
    async issueRoot(subjectIdentifier: string) {
      const transitionId = await setAccess(subjectIdentifier, "enabled");
      return await sessions.createUserSession({
        subjectIdentifier,
        subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId }),
        amr: ["pwd"],
      });
    },
    async openCustomSsoSession(root: Awaited<ReturnType<typeof sessions.createUserSession>>["observation"]) {
      const result = await sessions.openClientSession(root, { clientId: "expenses", protocol: "custom_sso" });
      if (result.status !== "created" && result.status !== "reused")
        throw new Error(`Cannot open fixture session: ${result.status}`);
      return result.value.clientSession.clientSessionId;
    },
  };
}
