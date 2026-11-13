import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EmploymentStatus, OrganizationLevel, OrganizationType, RoleAssignmentTargetType } from "@iam/contracts";
import {
  auditLogs,
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createUnifiedSessionKernel } from "@iam/session-kernel";
import { encodeSubjectAccessContext } from "@iam/subject-access";
import { createSubjectAccessBootstrap } from "@iam/subject-access/redis";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { createProcessSmokeEnvironment, spawnOwnedProcessTree } from "@iam/test-support/process-smoke-harness";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { startEmploymentProcess } from "../support/employment-process.fixture";
import { startEmploymentWorker, waitFor, waitForEmploymentWorkerLock } from "../support/employment-worker";
import { createWorkerPostgresTestHarness, type WorkerPostgresTestHarness } from "../support/postgres-test-harness";
import {
  createWorkerRedisTestHarness,
  resetWorkerRedisTestDatabase,
  resolveWorkerRedisTestUrl,
  type WorkerRedisTestHarness,
} from "../support/redis-test-harness";

const adminApiRoot = fileURLToPath(new URL("../../../admin-api/", import.meta.url));
const clientCode = "iam-admin";
const namespace = "employment-admin-race";
const date = Temporal.Now.plainDateISO("Asia/Shanghai");
const dueDate = date.add({ days: 2 }).toString();
const extendedEnd = date.add({ days: 4 }).toString();
const workerTime = `${dueDate}T08:00:00+08:00`;

const cases = [
  {
    name: "a date extension wins over a Worker expiry candidate",
    startTime: null,
    endTime: dueDate,
    command: "update",
    expected: { status: EmploymentStatus.Enable, startTime: null, endTime: extendedEnd, isPrimary: true },
  },
  {
    name: "an Admin pause wins over a Worker activation candidate",
    startTime: dueDate,
    endTime: null,
    command: "pause",
    expected: { status: EmploymentStatus.Pause, startTime: dueDate, endTime: null, isPrimary: true },
  },
  {
    name: "an Admin end wins over a Worker activation candidate",
    startTime: dueDate,
    endTime: null,
    command: "end",
    expected: { status: EmploymentStatus.Disable, startTime: null, endTime: date.toString(), isPrimary: false },
  },
] as const;

for (const scenario of cases) {
  test(scenario.name, async () => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const stopExecutors: Array<() => Promise<void> | void> = [];
      registerCleanup(async () => {
        if (stopExecutors.length > 0) await resetWorkerRedisTestDatabase(stopExecutors);
      });
      const pg = await createWorkerPostgresTestHarness();
      stopExecutors.push(pg.close);
      const redis = await createWorkerRedisTestHarness();
      stopExecutors.push(redis.close);
      const auth = await seedAdmin(pg, redis);
      const admin = await startAdmin(pg, stopExecutors, auth);

      const creation = await admin.request("/admin/employments/", {
        method: "POST",
        body: JSON.stringify({
          username: "employee",
          orgCode: "RACE",
          posCode: "RACE",
          startTime: scenario.startTime,
          endTime: scenario.endTime,
          isPrimary: true,
        }),
      });
      const {
        data: {
          changed,
          result: { id },
        },
      } = z
        .object({
          data: z.object({ changed: z.boolean(), result: z.object({ id: z.number() }) }),
        })
        .parse(creation);
      expect(changed).toBe(true);
      const path = `/admin/employments/${id}`;
      const initial = await admin.request(path);
      expect(initial).toMatchObject({
        data: {
          status: scenario.startTime === null ? EmploymentStatus.Enable : EmploymentStatus.Pending,
          startTime: scenario.startTime,
          endTime: scenario.endTime,
        },
      });

      let mutation: ReturnType<typeof admin.request> | undefined;
      try {
        const worker = await pg.sql.begin(async (held) => {
          const [blocker] = await held<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          if (!blocker) throw new Error("Expected a PostgreSQL connection holding the fixture lock");
          await held`SELECT id FROM employment WHERE id = ${id} FOR UPDATE`;
          mutation =
            scenario.command === "update"
              ? admin.request(path, { method: "PUT", body: JSON.stringify({ startTime: null, endTime: extendedEnd }) })
              : admin.request(`${path}/${scenario.command}`, { method: "POST" });
          void mutation.catch(() => {});

          const adminPid = await Promise.race([
            mutation.then(() => {
              throw new Error("Admin mutation finished before acquiring the locked Employment");
            }),
            waitFor("Admin waiting on the fixture Employment lock", async () => {
              const [waiting] = await pg.sql<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blocker.pid} = ANY(pg_blocking_pids(pid))`;
              return waiting?.pid;
            }),
          ]);
          const worker = await startEmploymentWorker({ pg, redis, stopExecutors, initialTime: workerTime });
          // The Worker selected the old state and queued behind the already waiting Admin write.
          await waitForEmploymentWorkerLock(pg, adminPid);
          return worker;
        });
        if (!mutation) throw new Error("Expected an in-flight Admin mutation");
        const outcome = await mutation;
        expect(outcome).toMatchObject({ data: { changed: true, result: null } });
        await worker.waitForEvent("employment.lifecycle.completed");

        const current = await admin.request(path);
        expect(current).toMatchObject({ data: scenario.expected });
        const events = await pg.db
          .select({ action: auditLogs.action, actorType: auditLogs.actorType })
          .from(auditLogs)
          .where(and(eq(auditLogs.targetType, "employment"), eq(auditLogs.targetId, id)))
          .orderBy(auditLogs.id);
        expect(events).toEqual([
          { action: "admin.employment.create", actorType: "admin" },
          { action: `admin.employment.${scenario.command}`, actorType: "admin" },
        ]);
      } finally {
        // The locking transaction has exited before the pending HTTP operation is drained.
        await mutation?.catch(() => {});
      }
    });
  }, 45_000);
}

async function seedAdmin(pg: WorkerPostgresTestHarness, redis: WorkerRedisTestHarness) {
  const subjectIdentifier = randomUUID();
  const [actor] = await pg.db
    .insert(users)
    .values({
      username: "race-admin",
      name: "Race Admin",
      subjectIdentifier,
    })
    .returning({ id: users.id });
  await pg.db.insert(users).values({ username: "employee", name: "Race Employee" });
  const [organization] = await pg.db
    .insert(organizations)
    .values({
      orgCode: "RACE",
      orgName: "Race organization",
      path: "/1",
      id: 1,
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    })
    .returning({ id: organizations.id });
  const [position] = await pg.db
    .insert(positions)
    .values({
      posCode: "RACE",
      posName: "Race position",
    })
    .returning({ id: positions.id });
  const [client] = await pg.db
    .insert(clients)
    .values({
      clientCode,
      clientName: "Race Admin",
      clientSecret: "test-only",
      extAttributes: {},
    })
    .returning({ id: clients.id });
  if (!actor || !organization || !position || !client) throw new Error("Failed to seed Admin fixture");
  await pg.db.insert(organizationClosures).values({
    ancestorId: organization.id,
    descendantId: organization.id,
    depth: 0,
  });
  const [adminEmployment] = await pg.db
    .insert(employments)
    .values({
      userId: actor.id,
      orgId: organization.id,
      posId: position.id,
      status: EmploymentStatus.Enable,
    })
    .returning({ id: employments.id });
  const [role] = await pg.db
    .insert(roles)
    .values({
      clientId: client.id,
      roleCode: "iam:admin",
      roleName: "Administrator",
    })
    .returning({ id: roles.id });
  if (!adminEmployment || !role) throw new Error("Failed to seed Admin authorization");
  await pg.db.insert(roleAssignments).values({
    roleId: role.id,
    targetType: RoleAssignmentTargetType.Employment,
    targetId: adminEmployment.id,
    includeDescendants: false,
  });

  const bootstrap = createSubjectAccessBootstrap({ redis: redis.writer, random: { uuid: randomUUID } });
  await bootstrap.seedMany([{ subjectIdentifier, state: "enabled" }], new Date());
  const [barrier] = await bootstrap.inspectMany([subjectIdentifier]);
  if (barrier?.status !== "valid" || barrier.record.state !== "enabled" || !barrier.record.transitionId)
    throw new Error("Missing enabled Admin Subject Access record");
  const kernel = createUnifiedSessionKernel({
    redis: redis.writer,
    namespace,
    userSessionTtlSeconds: 3600,
    clientSessionTtlSeconds: 1800,
    assertOperationActive() {},
  });
  const root = await kernel.forOperation({}).createUserSession({
    subjectIdentifier,
    subjectContext: encodeSubjectAccessContext({
      version: 1,
      subjectIdentifier,
      transitionId: barrier.record.transitionId,
    }),
    amr: ["pwd"],
  });
  return root.bearer;
}

async function startAdmin(
  pg: WorkerPostgresTestHarness,
  stopExecutors: Array<() => Promise<void> | void>,
  authorization: string,
) {
  const { origin } = await startEmploymentProcess({
    label: "Admin API for Employment race",
    temporaryDirectoryPrefix: "iam-employment-admin-",
    hostname: "localhost",
    stopExecutors,
    start({ port, temporaryDirectory }) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: adminApiRoot,
        env: createProcessSmokeEnvironment({
          source: process.env,
          temporaryDirectory,
          overrides: {
            NODE_ENV: "test",
            IAM_ADMIN_API_DATABASE_URL: pg.commandDatabaseUrl,
            IAM_ADMIN_API_REDIS_URL: resolveWorkerRedisTestUrl(process.env),
            IAM_ADMIN_API_PORT: String(port),
            IAM_ADMIN_API_ADMIN_CLIENT_CODES: clientCode,
            IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: namespace,
            IAM_ADMIN_API_LOG_FORMAT: "json",
            IAM_ADMIN_API_LOG_LEVEL: "info",
          },
        }),
      });
    },
    async probe(origin, output, signal) {
      if (!output.includes(`server: ${origin}`)) return false;
      const response = await fetch(`${origin}/admin/doc`, { signal });
      if (response.status !== 200) return false;
      const document = await response.json();
      const schema = z.object({ info: z.object({ title: z.literal("管理端API") }) });
      return schema.safeParse(document).success;
    },
  });
  return {
    async request(path: string, init?: RequestInit) {
      const response = await fetch(`${origin}${path}`, {
        ...init,
        headers: { Authorization: authorization, Client: clientCode, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.json();
      if (response.status !== 200)
        throw new Error(
          `Admin request ${init?.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`,
        );
      return body;
    },
  };
}
