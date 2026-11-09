import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { UserStatus, UserType } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PublishedUserDocument } from "../../../src/user/document";
import {
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
  USER_DOCUMENT_SCHEMA_VERSION,
} from "../../../src/user/index";
import { createUserDocumentRowRepository } from "../../../src/user/publication/user-document-row.repository";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-test-harness";

let harness: PostgresTestHarness;
beforeAll(async () => {
  harness = await createPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

for (const scenario of [
  { name: "populated first page", initialCount: 1, page: 1 },
  { name: "empty first page", initialCount: 0, page: 1 },
  { name: "beyond-last page", initialCount: 1, page: 2 },
]) {
  test(`pagination keeps items and total in one publication snapshot for a ${scenario.name}`, async () => {
    await runWithOwnedTestResources(async ({ registerCleanup }) => {
      const schemas = await harness.sql<{ schemaName: string }[]>`SELECT current_schema() AS "schemaName"`;
      const schemaName = schemas[0]?.schemaName;
      if (schemaName === undefined) throw new Error("Test schema is unavailable");
      const databaseUrl = process.env.IAM_DOCUMENTS_TEST_DATABASE_URL;
      if (databaseUrl === undefined) throw new Error("User Document Integration database is unavailable");
      const reader = postgres(databaseUrl, {
        max: 1,
        connection: { search_path: schemaName, statement_timeout: 2_000 },
      });
      registerCleanup(async () => {
        await reader.end();
      });
      let generation = 0;
      async function publish() {
        const count = scenario.initialCount + generation;
        await harness.db.transaction(async (tx) => {
          await createUserDocumentRowRepository(tx).upsertMany(
            Array.from({ length: count }, (_, i) => publication(i + 1, generation)),
          );
        });
      }
      const gate = interleaveReads(reader, async () => {
        generation += 1;
        await publish();
      });
      const query = createUserDocumentSearchService({
        documentRepository: createUserDocumentSearchRepository(drizzle({ client: gate.client, relations })),
      });
      let pending: ReturnType<typeof query.searchDocuments> | undefined;
      registerCleanup(async () => {
        gate.disable();
        // Settle scheduled reader and writer work before closing the reader or resetting the schema.
        const outcomes = await Promise.allSettled([pending, gate.settled()]);
        const failures = [
          ...new Set(outcomes.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason] : []))),
        ];
        if (failures.length) throw new AggregateError(failures, "Pagination interleaving failed");
      });
      await publish();
      pending = query.searchDocuments({ paginate: true, page: scenario.page, pageSize: 1, select: ["name"] }, "alpha");
      const result = await pending;
      // Each committed generation changes both the exact count and every page item.
      // A response assembled from independent observations matches none of these states.
      const validStates: Awaited<ReturnType<typeof query.searchDocuments>>[] = Array.from(
        { length: generation + 1 },
        (_, value) => ({
          items: scenario.initialCount + value >= scenario.page ? [{ name: `generation-${value}` }] : [],
          total: scenario.initialCount + value,
          page: scenario.page,
          pageSize: 1,
        }),
      );
      expect(validStates).toContainEqual(result);
      gate.disable();
      const latest = await query.searchDocuments(
        { paginate: true, page: scenario.page, pageSize: 1, select: ["name"] },
        "alpha",
      );
      expect(latest).toEqual({
        items: [{ name: `generation-${generation}` }],
        total: scenario.initialCount + generation,
        page: scenario.page,
        pageSize: 1,
      });
      expect(latest.total).toBeGreaterThan(result.total);
    });
  });
}

/** Schedule real driver commands; transaction callbacks themselves must remain outside the queue. */
function interleaveReads(reader: postgres.Sql, afterSelect: () => Promise<void>) {
  let enabled = true;
  let tail: Promise<unknown> = Promise.resolve();
  function wrap<Client extends postgres.Sql | postgres.TransactionSql>(client: Client): Client {
    return new Proxy(client, {
      get(target, property, receiver) {
        if (property === "unsafe") {
          return (...args: unknown[]) => {
            const execute = (values: boolean) => {
              const operation = tail.then(async () => {
                const pending: ReturnType<typeof client.unsafe> = Reflect.apply(target.unsafe, target, args);
                const rows = await (values ? pending.values() : pending);
                if (enabled && rows.command === "SELECT") await afterSelect();
                return rows;
              });
              tail = operation;
              // Mark failure handled while retaining it for both the query and settled().
              void operation.catch(() => {});
              return operation;
            };
            return {
              // biome-ignore lint/suspicious/noThenProperty: Preserve postgres-js's intentional lazy thenable query API.
              then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
                execute(false).then(resolve, reject),
              values: () => execute(true),
            };
          };
        }
        if (property === "begin" || property === "savepoint") {
          const method = Reflect.get(target, property, receiver);
          if (typeof method !== "function") throw new Error("Transaction method is unavailable");
          return (...args: unknown[]) =>
            Reflect.apply(
              method,
              target,
              args.map((arg) => (typeof arg === "function" ? (tx: postgres.TransactionSql) => arg(wrap(tx)) : arg)),
            );
        }
        return Reflect.get(target, property, receiver);
      },
    });
  }
  return {
    client: wrap(reader),
    disable() {
      enabled = false;
    },
    settled: () => tail,
  };
}

function publication(id: number, generation: number): PublishedUserDocument {
  const subjectIdentifier = `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  return {
    userId: id,
    subjectIdentifier,
    schemaVersion: USER_DOCUMENT_SCHEMA_VERSION,
    sourceVersion: String(generation + 1),
    publishedAt: new Date("2026-11-03T12:00:00Z"),
    document: {
      subjectIdentifier,
      username: `user-${id}`,
      name: `generation-${generation}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Enable,
      employments: [],
    },
  };
}
