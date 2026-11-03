import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { OrganizationDocumentSchema, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { organizationDocuments } from "@iam/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
  ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
} from "../../src/index";
import {
  createOrganizationDocumentPostgresTestHarness,
  type OrganizationDocumentPostgresTestHarness,
} from "../support/postgres-test-harness";

let harness: OrganizationDocumentPostgresTestHarness;
beforeAll(async () => {
  harness = await createOrganizationDocumentPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

test.each([
  { initialCount: 1, page: 1 },
  { initialCount: 0, page: 1 },
  { initialCount: 1, page: 2 },
])(
  "page $page and exact count share a publication snapshot starting with $initialCount matches",
  async ({ initialCount, page }) => {
    let generation = initialCount;
    await publishGeneration(generation);
    const schemas = await harness.sql<{ name: string }[]>`SELECT current_schema() AS name`;
    const reader = postgres(process.env.IAM_ORGANIZATION_DOCUMENT_TEST_DATABASE_URL!, {
      max: 1,
      connection: { search_path: schemas[0]!.name, statement_timeout: 2_000 },
      onnotice() {},
    });
    const knownStates: unknown[] = [expectedPage(generation, page)];
    const gate = createPublicationGate(reader, async () => {
      await publishGeneration(++generation);
      knownStates.push(expectedPage(generation, page));
    });
    const query = createOrganizationDocumentQueryService({
      repository: createOrganizationDocumentQueryRepository(drizzle({ client: gate.client, relations })),
    });
    const failures: unknown[] = [];
    try {
      const result = await query.search({ paginate: true, page, pageSize: 1, select: ["name"] });
      expect(knownStates).toContainEqual(result);
      gate.disable();
      const latest = await query.search({ paginate: true, page, pageSize: 1, select: ["name"] });
      expect(latest).toEqual(expectedPage(generation, page));
      expect(generation).toBeGreaterThan(initialCount);
    } catch (failure) {
      failures.push(failure);
    } finally {
      gate.disable();
      for (const stop of [() => gate.drain(), () => reader.end({ timeout: 1 })]) {
        try {
          await stop();
        } catch (failure) {
          failures.push(failure);
        }
      }
    }
    if (failures.length) throw new AggregateError(failures, "Organization snapshot query or cleanup failed");
  },
);

function expectedPage(count: number, page: number) {
  return { items: count >= page ? [{ name: `generation-${count}` }] : [], total: count, page, pageSize: 1 };
}

async function publishGeneration(count: number) {
  // The fixture atomically publishes valid rows; Worker publication mechanics have their own coverage.
  await harness.db.transaction(async (tx) => {
    await tx.execute("SET LOCAL statement_timeout = '2s'");
    await tx.delete(organizationDocuments);
    if (!count) return;
    await tx.insert(organizationDocuments).values(
      Array.from({ length: count }, (_, index) => {
        const node = { code: `ORG-${index + 1}`, name: `generation-${count}`, type: OrganizationType.Company };
        return {
          organizationId: index + 1,
          schemaVersion: ORGANIZATION_DOCUMENT_SCHEMA_VERSION,
          sourceVersion: String(count),
          searchVisible: true,
          document: OrganizationDocumentSchema.parse({
            ...node,
            status: OrganizationStatus.Enable,
            level: 1,
            isVirtual: false,
            isEntity: true,
            path: [{ ...node, level: 1, distanceToTarget: 0 }],
          }),
        };
      }),
    );
  });
}

/** Delay consumption of each real query until the next publication has committed. */
function createPublicationGate(client: ReturnType<typeof postgres>, publishNext: () => Promise<void>) {
  let enabled = true;
  let tail = Promise.resolve();
  const failures: unknown[] = [];
  function schedule<Result extends { command: string }>(execute: () => PromiseLike<Result>) {
    // Serializing query consumption also controls concurrent readers before they issue SQL.
    const operation = tail.then(async () => {
      const rows = await execute();
      if (enabled && rows.command === "SELECT") await publishNext();
      return rows;
    });
    tail = operation.then(
      () => undefined,
      (failure) => {
        failures.push(failure);
      },
    );
    return operation;
  }
  function wrap<Client extends ReturnType<typeof postgres> | postgres.TransactionSql>(target: Client): Client {
    return new Proxy(target, {
      get(sqlClient, property) {
        if (property === "unsafe")
          return (...args: Parameters<Client["unsafe"]>) => {
            const pending = Reflect.apply(sqlClient.unsafe, sqlClient, args);
            return new Proxy(pending, {
              get(query, key) {
                if (key === "then")
                  return (resolve: (rows: unknown) => unknown, reject: (error: unknown) => unknown) =>
                    schedule(() => Promise.resolve(query)).then(resolve, reject);
                if (key === "values") return () => schedule(() => query.values());
                const value = Reflect.get(query, key);
                return typeof value === "function" ? value.bind(query) : value;
              },
            });
          };
        if (property === "begin" || property === "savepoint")
          return (...args: unknown[]) => {
            const method = Reflect.get(sqlClient, property);
            if (typeof method !== "function") throw new Error("Query client has no transaction scope");
            return Reflect.apply(
              method,
              sqlClient,
              args.map((arg) =>
                typeof arg === "function" ? (scoped: postgres.TransactionSql) => arg(wrap(scoped)) : arg,
              ),
            );
          };
        const value = Reflect.get(sqlClient, property);
        return typeof value === "function" ? value.bind(sqlClient) : value;
      },
    });
  }
  return {
    client: wrap(client),
    disable() {
      enabled = false;
    },
    async drain() {
      await tail;
      if (failures.length) throw new AggregateError(failures, "Publication gate failed");
    },
  };
}
