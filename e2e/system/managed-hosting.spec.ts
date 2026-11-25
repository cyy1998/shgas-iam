import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import {
  OrganizationStatus,
  OrganizationType,
  RebuildUserDocumentsBatchJobPayloadSchema,
  USER_DOCUMENT_QUEUE_NAME,
  UserDocumentJobName,
  type UserDocumentJobPayload,
} from "@iam/contracts";
import {
  createOrganizationDocumentWriteResources,
  ORGANIZATION_REBUILD_JOB_NAME,
  OrganizationRebuildJobPayloadSchema,
} from "@iam/documents/organization/producer";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
  OrganizationDirectoryNotFoundError,
} from "@iam/documents/organization/query";
import { createSubjectFactsRedisCache, DocumentFactsCacheRecordSchema } from "@iam/documents/user/subject-facts";
import { createJobQueue } from "@iam/jobs";
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
  const queue = createJobQueue<UserDocumentJobPayload>({
    name: USER_DOCUMENT_QUEUE_NAME,
    redis: input.redis,
    connectionOptions: { maxRetriesPerRequest: 1, connectTimeout: 2000, enableOfflineQueue: false },
  });
  // 客户端错误可能带 AUTH 参数；各次原生读/等待仍决定结果，此处只记录有限类别。
  redis.on("error", () => console.error("managed-profile-redis-connection-error"));
  queue.on("error", () => console.error("managed-profile-queue-connection-error"));
  const facts = createSubjectFactsRedisCache(redis);
  async function readFacts(subjectIdentifier: string) {
    const raw = await facts.read(subjectIdentifier);
    if (!raw) return null;
    const record = DocumentFactsCacheRecordSchema.parse(JSON.parse(raw));
    return record.kind === "document" ? record : null;
  }
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
    const identity = await context.request.get(`${input.origin}/api/iam/sso/user-info`, {
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
    const before = await readFacts(subjectIdentifier);
    if (!before) throw new Error("managed-user-document-baseline-missing");
    expect(before.facts.profile.username).toBe(input.admin.username);
    expect(before.facts.profile.name).toBe(originalName);
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
      () => readFacts(subjectIdentifier),
      (value) => value?.facts.profile.name === name,
      "managed-user-profile-publication-incomplete",
    );
    expect(published!.subjectIdentifier).toBe(subjectIdentifier);
    expect(published!.facts).toEqual({
      ...before.facts,
      profile: { ...before.facts.profile, name },
    });
    const version = published!.sourceVersion;
    expect(BigInt(version)).toBeGreaterThan(BigInt(before.sourceVersion));
    const job = await eventual(
      async () => {
        const jobs = await queue.getJobs(["completed"], 0, 99, false);
        return jobs.find((candidate) => {
          if (candidate.name !== UserDocumentJobName.RebuildUserDocumentsBatch) return false;
          const batch = RebuildUserDocumentsBatchJobPayloadSchema.safeParse(candidate.data);
          return (
            batch.success &&
            batch.data.requests.some(
              (request) =>
                request.userId === detail!.data.id &&
                request.version === version &&
                request.requestId === update!.requestId,
            )
          );
        });
      },
      (value) => value !== undefined,
      "managed-user-profile-job-incomplete",
    );
    expect(job!.finishedOn).toBeGreaterThanOrEqual(job!.processedOn!);
    const userInfo = await context.request.get(`${input.origin}/api/iam/sso/user-info`, {
      headers: { Client: "iam-admin" },
    });
    expect(userInfo.status()).toBe(200);
    const user = await userInfo.json();
    expect(user.code).toBe(200);
    expect(user.data.subjectIdentifier).toBe(subjectIdentifier);
    expect(user.data.profile.name).toBe(name);
    Object.assign(evidence, {
      requestId: update!.requestId,
      jobId: job!.id,
      version,
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
            const record = await readFacts(actorSubject!);
            return record?.facts.profile.name;
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
  const resources = createOrganizationDocumentWriteResources({
    redis: input.redis,
    logger: { error: () => console.error("managed-organization-queue-connection-error") },
  });
  const query = createOrganizationDocumentQueryService({ repository: createOrganizationDocumentQueryRepository(db) });
  const marker = `LQV349-${randomUUID().slice(0, 12)}`;
  const codes = [marker + "-root", marker + "-child", marker + "-leaf"];
  const created: string[] = [];
  let failure: unknown;
  const evidence: Record<string, unknown> = {
    environment: input.environment,
    scope: "managed-organization-search",
    codes,
  };
  async function search(code: string) {
    try {
      return await query.getByCode(code);
    } catch (error) {
      if (error instanceof OrganizationDirectoryNotFoundError) return null;
      throw error;
    }
  }
  const completedLeaf = async (id: number) => {
    const jobs = await resources.queue.getJobs(["completed"], 0, 99, false);
    let latest: { job: (typeof jobs)[number]; version: string } | undefined;
    for (const job of jobs) {
      if (job.name !== ORGANIZATION_REBUILD_JOB_NAME) continue;
      const data = OrganizationRebuildJobPayloadSchema.safeParse(job.data);
      if (!data.success || data.data.organizationId !== id) continue;
      const { version } = data.data;
      if (!latest || BigInt(version) > BigInt(latest.version)) latest = { job, version };
    }
    return latest;
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
      (value) => value !== null,
      "managed-organization-initial-publication-incomplete",
    );
    expect(baseline!.path.map((node) => node.code)).toEqual(codes);
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
      (value) => value?.name === name,
      "managed-organization-rename-publication-incomplete",
    );
    expect(published!.path.map((node) => node.code)).toEqual(codes);
    expect(published!.path.map((node) => node.distanceToTarget)).toEqual([2, 1, 0]);
    expect(published!.path.at(-1)!.name).toBe(name);
    expect(JSON.stringify(published)).not.toContain(marker + "-旧叶");
    const job = await eventual(
      async () => {
        const candidate = await completedLeaf(leafId);
        return candidate && BigInt(candidate.version) > BigInt(oldJob!.version) ? candidate : undefined;
      },
      (value) => value !== undefined,
      "managed-organization-rename-job-incomplete",
    );
    expect(job!.job.finishedOn).toBeGreaterThanOrEqual(job!.job.processedOn!);
    Object.assign(evidence, {
      requestId: update!.requestId,
      jobId: job!.job.id,
      version: job!.version,
      processedOn: job!.job.processedOn,
      finishedOn: job!.job.finishedOn,
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
          (value) => value === null,
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
