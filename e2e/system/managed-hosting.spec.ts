import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import {
  OrganizationStatus,
  OrganizationType,
  type RebuildUserProfileJobPayload,
  USER_PROFILE_QUEUE_NAME,
  UserProfileJobName,
} from "@iam/contracts";
import { buildUserVersionJobId, createJobQueue } from "@iam/jobs";
import {
  createOrganizationSearchWriteResources,
  ORGANIZATION_REBUILD_JOB_NAME,
} from "@iam/organization-search-read-model/producer";
import {
  createOrganizationSearchQueryRepository,
  createOrganizationSearchQueryService,
} from "@iam/organization-search-read-model/query";
import {
  createSubjectFactsRedisCache,
  SubjectFactsCacheRecordSchema,
} from "@iam/user-profile-read-model/subject-facts";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { loginToAdmin } from "./src/admin-client-journey.ts";
import { managedIamFailure, readManagedIamInput } from "./src/managed-iam-input.ts";

async function rpc<T>(
  request: APIRequestContext,
  origin: string,
  procedure: string,
  input: unknown,
  mutation = false,
  absent = false,
) {
  const requestId = randomUUID();
  const endpoint = new URL(`/api/iam/rpc/${procedure}`, origin);
  endpoint.searchParams.set("batch", "1");
  const headers = { Client: "iam-admin", "X-Request-Id": requestId };
  if (!mutation) endpoint.searchParams.set("input", JSON.stringify({ 0: input }));
  const response = mutation
    ? await request.post(endpoint.href, { headers, data: { 0: input } })
    : await request.get(endpoint.href, { headers });
  if (absent && response.status() === 404) return null;
  expect(response.status(), `native ${procedure} status`).toBe(200);
  const result = (await response.json())[0];
  expect(result.error, `native ${procedure} error`).toBeUndefined();
  expect(response.headers()["x-request-id"]).toBe(requestId);
  return { data: result.result.data as T, requestId };
}

async function eventual<T>(read: () => Promise<T>, ready: (value: T) => boolean, reason: string): Promise<T> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const value = await read();
    if (ready(value)) return value;
    if (attempt < 29) await pause(500);
  }
  throw new Error(reason);
}

test("managed IAM login and User Profile worker publish one real name change and preserve the original identity", async ({
  page,
  context,
}) => {
  const input = await readManagedIamInput();
  const redis = new Redis({ ...input.redis, maxRetriesPerRequest: 1, connectTimeout: 2000, enableOfflineQueue: false });
  const queue = createJobQueue<RebuildUserProfileJobPayload>({
    name: USER_PROFILE_QUEUE_NAME,
    redis: input.redis,
    connectionOptions: { maxRetriesPerRequest: 1, connectTimeout: 2000, enableOfflineQueue: false },
  });
  // 客户端错误可能带 AUTH 参数；各次原生读/等待仍决定结果，此处只记录有限类别。
  redis.on("error", () => console.error("managed-profile-redis-connection-error"));
  queue.on("error", () => console.error("managed-profile-queue-connection-error"));
  const facts = createSubjectFactsRedisCache(redis);
  let originalName: string | undefined;
  let actorSubject: string | undefined;
  let mutationAttempted = false;
  let failure: unknown;
  const evidence: Record<string, unknown> = { environment: input.environment, scope: "managed-user-profile" };
  try {
    await loginToAdmin({
      page,
      origin: input.origin,
      adminUsername: input.admin.username,
      adminPassword: input.admin.password,
    });
    const detail = await rpc<{ id: number; name: string }>(context.request, input.origin, "admin.user.detail", {
      username: input.admin.username,
    });
    expect(Number.isSafeInteger(detail!.data.id)).toBe(true);
    const identity = await context.request.get(`${input.origin}/api/iam/public/user-info`, {
      headers: { Client: "iam-admin" },
    });
    expect(identity.status()).toBe(200);
    const identityBody = await identity.json();
    expect(identityBody.code).toBe(200);
    expect(identityBody.data.profile.username).toBe(input.admin.username);
    const subjectIdentifier = String(identityBody.data.subjectIdentifier);
    expect(subjectIdentifier).toMatch(/^[a-f0-9-]{36}$/i);
    actorSubject = subjectIdentifier;
    originalName = detail!.data.name;
    const raw = await facts.read(subjectIdentifier);
    expect(raw).not.toBeNull();
    const before = SubjectFactsCacheRecordSchema.parse(JSON.parse(raw!));
    expect(before.profile.username).toBe(input.admin.username);
    expect(before.profile.name).toBe(originalName);
    expect(before.subjectIdentifier).toBe(subjectIdentifier);
    const name = `LQV349-${randomUUID().slice(0, 8)}`;
    mutationAttempted = true;
    const update = await rpc<{ changed: boolean }>(
      context.request,
      input.origin,
      "admin.user.update",
      { username: input.admin.username, data: { name } },
      true,
    );
    expect(update!.data.changed).toBe(true);
    const published = await eventual(
      async () => {
        const value = await facts.read(subjectIdentifier);
        return value ? SubjectFactsCacheRecordSchema.parse(JSON.parse(value)) : null;
      },
      (value) => value?.profile.name === name,
      "managed-user-profile-publication-incomplete",
    );
    expect(published!.subjectIdentifier).toBe(subjectIdentifier);
    expect(published!.facts).toEqual(before.facts);
    expect(published!.profile.phone).toBe(before.profile.phone);
    expect(BigInt(published!.sourceDirtyVersion)).toBeGreaterThan(BigInt(before.sourceDirtyVersion));
    const jobId = buildUserVersionJobId(
      UserProfileJobName.RebuildUserProfile,
      detail!.data.id,
      published!.sourceDirtyVersion,
    );
    const job = await eventual(
      async () => {
        const candidate = await queue.getJob(jobId);
        return candidate && (await candidate.getState()) === "completed" ? candidate : null;
      },
      (value) => value !== null,
      "managed-user-profile-job-incomplete",
    );
    expect(job!.data.userId).toBe(detail!.data.id);
    expect(job!.data.dirtyVersion).toBe(published!.sourceDirtyVersion);
    expect(job!.data.requestId).toBe(update!.requestId);
    expect(job!.finishedOn).toBeGreaterThanOrEqual(job!.processedOn!);
    const userInfo = await context.request.get(`${input.origin}/api/iam/public/user-info`, {
      headers: { Client: "iam-admin" },
    });
    expect(userInfo.status()).toBe(200);
    const user = await userInfo.json();
    expect(user.code).toBe(200);
    expect(user.data.subjectIdentifier).toBe(subjectIdentifier);
    expect(user.data.profile.name).toBe(name);
    Object.assign(evidence, {
      requestId: update!.requestId,
      jobId,
      dirtyVersion: published!.sourceDirtyVersion,
      processedOn: job!.processedOn,
      finishedOn: job!.finishedOn,
    });
  } catch (error) {
    failure = error;
  } finally {
    try {
      if (mutationAttempted && originalName !== undefined) {
        await rpc(
          context.request,
          input.origin,
          "admin.user.update",
          { username: input.admin.username, data: { name: originalName } },
          true,
        );
        await eventual(
          async () => {
            const value = await facts.read(actorSubject!);
            return value ? SubjectFactsCacheRecordSchema.parse(JSON.parse(value)).profile.name : null;
          },
          (value) => value === originalName,
          "managed-user-profile-restore-incomplete",
        );
      }
    } catch (error) {
      failure = new AggregateError(
        [...(failure ? [failure] : []), error],
        "managed profile change or restoration failed",
      );
    }
    const closed = await Promise.allSettled([
      (async () => {
        await queue.getBackend().close(true);
        await queue.close();
      })(),
      Promise.resolve().then(() => redis.disconnect()),
    ]);
    const errors = closed.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (errors.length)
      failure = new AggregateError(
        [...(failure ? [failure] : []), ...errors],
        "managed profile connections failed to close",
      );
  }
  if (failure) throw managedIamFailure(failure, input);
  console.log(JSON.stringify(evidence));
});

test("managed Organization Search worker publishes the renamed owned leaf and keeps its root and parent path", async ({
  page,
  context,
}) => {
  const input = await readManagedIamInput();
  const { default: db, closeDb } = await import("@iam/db");
  const resources = createOrganizationSearchWriteResources({
    redis: input.redis,
    logger: { error: () => console.error("managed-organization-queue-connection-error") },
  });
  const query = createOrganizationSearchQueryService({ repository: createOrganizationSearchQueryRepository(db) });
  const marker = `LQV349-${randomUUID().slice(0, 12)}`;
  const codes = [marker + "-root", marker + "-child", marker + "-leaf"];
  const created: string[] = [];
  let failure: unknown;
  const evidence: Record<string, unknown> = {
    environment: input.environment,
    scope: "managed-organization-search",
    codes,
  };
  const search = (code: string) => query.search({ filter: { field: "organization.code", op: "eq", value: code } });
  const completedLeaf = async (id: number) => {
    const jobs = await resources.queue.getJobs(["completed"], 0, 99, false);
    const own = jobs.filter((job) => {
      const data = job.data as { organizationId?: number; version?: string };
      return (
        job.name === ORGANIZATION_REBUILD_JOB_NAME && data.organizationId === id && typeof data.version === "string"
      );
    });
    // 完成时间不决定版本顺序；旧任务迟到不能遮住已经完成的新代。
    return own.reduce<(typeof own)[number] | undefined>(
      (latest, candidate) =>
        !latest ||
        BigInt((candidate.data as { version: string }).version) > BigInt((latest.data as { version: string }).version)
          ? candidate
          : latest,
      undefined,
    );
  };
  try {
    const identity = await db.execute(
      sql`select current_database() as database, current_setting('server_version_num')::integer as version`,
    );
    expect(identity[0]?.database).toBe(input.database);
    expect(Number(identity[0]?.version)).toBeGreaterThanOrEqual(160000);
    expect(Number(identity[0]?.version)).toBeLessThan(170000);
    await loginToAdmin({
      page,
      origin: input.origin,
      adminUsername: input.admin.username,
      adminPassword: input.admin.password,
    });
    let leafId = 0;
    for (const [index, orgCode] of codes.entries()) {
      created.push(orgCode);
      const result = await rpc<{ changed: boolean }>(
        context.request,
        input.origin,
        "admin.organization.create",
        {
          orgCode,
          orgName: index === 2 ? marker + "-旧叶" : marker + "-" + index,
          orgType: OrganizationType.Virtual,
          isVirtual: true,
          isEntity: false,
          parentCode: codes[index - 1] ?? null,
        },
        true,
      );
      expect(result!.data.changed).toBe(true);
      const detail = await rpc<{ id: number }>(context.request, input.origin, "admin.organization.detail", { orgCode });
      if (index === 2) leafId = detail!.data.id;
    }
    const baseline = await eventual(
      () => search(codes[2]!),
      (value) => value.length === 1,
      "managed-organization-initial-publication-incomplete",
    );
    expect(baseline[0]!.organization.path.map((node) => node.code)).toEqual(codes);
    const oldJob = await eventual(
      () => completedLeaf(leafId),
      (value) => value !== undefined,
      "managed-organization-initial-job-incomplete",
    );
    const name = marker + "-新叶";
    const update = await rpc<{ changed: boolean }>(
      context.request,
      input.origin,
      "admin.organization.update",
      { orgCode: codes[2], data: { orgName: name } },
      true,
    );
    expect(update!.data.changed).toBe(true);
    const published = await eventual(
      () => search(codes[2]!),
      (value) => value[0]?.organization.name === name,
      "managed-organization-rename-publication-incomplete",
    );
    expect(published[0]!.organization.path.map((node) => node.code)).toEqual(codes);
    expect(published[0]!.organization.path.map((node) => node.distanceToTarget)).toEqual([2, 1, 0]);
    expect(published[0]!.organization.path.at(-1)!.name).toBe(name);
    expect(JSON.stringify(published)).not.toContain(marker + "-旧叶");
    const job = await eventual(
      async () => {
        const candidate = await completedLeaf(leafId);
        return candidate?.id !== oldJob!.id ? candidate : undefined;
      },
      (value) => value !== undefined,
      "managed-organization-rename-job-incomplete",
    );
    const previous = oldJob!.data as { version: string },
      current = job!.data as { version: string };
    expect(BigInt(current.version)).toBeGreaterThan(BigInt(previous.version));
    expect(job!.finishedOn).toBeGreaterThanOrEqual(job!.processedOn!);
    Object.assign(evidence, {
      requestId: update!.requestId,
      jobId: job!.id,
      version: current.version,
      processedOn: job!.processedOn,
      finishedOn: job!.finishedOn,
    });
  } catch (error) {
    failure = error;
  } finally {
    const errors: unknown[] = [];
    for (const orgCode of created.reverse()) {
      try {
        const existing = await rpc(
          context.request,
          input.origin,
          "admin.organization.detail",
          { orgCode },
          false,
          true,
        );
        if (!existing) continue;
        await rpc(
          context.request,
          input.origin,
          "admin.organization.updateStatus",
          { orgCode, status: OrganizationStatus.Disable },
          true,
        );
        await rpc(context.request, input.origin, "admin.organization.delete", { orgCode }, true);
        await eventual(
          () => search(orgCode),
          (value) => value.length === 0,
          "managed-organization-cleanup-publication-incomplete",
        );
      } catch (error) {
        errors.push(error);
      }
    }
    const closed = await Promise.allSettled([resources.close(), closeDb({ timeoutSeconds: 5 })]);
    errors.push(...closed.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])));
    if (errors.length)
      failure = new AggregateError(
        [...(failure ? [failure] : []), ...errors],
        "managed organization changes or cleanup failed",
      );
  }
  if (failure) throw managedIamFailure(failure, input);
  console.log(JSON.stringify(evidence));
});
