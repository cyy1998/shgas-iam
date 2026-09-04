import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createAdminClientMutation } from "@admin-api/services/client/client-mutation";
import {
  AfterCommitRequiredTaskError,
  mapUnitOfWork,
} from "@iam/api-core/uow";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { eq } from "drizzle-orm";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("Admin Client target-bound mutation PostgreSQL contract", () => {
  test("confirmed rollback keeps the Client row absent and skips Runtime invalidation", async () => {
    const invalidateClient = mock(async () => undefined);
    const mutation = createMutation(invalidateClient);
    const clientCode = "client-mutation-rollback";
    const rollbackFailure = new Error("force confirmed rollback");
    let rejected: unknown;

    try {
      await mutation.transaction(async (tx, bindTarget) =>
        await bindTarget(clientCode, async () => {
          await tx.clientRepository.createClient(clientInput(clientCode));
          throw rollbackFailure;
        }));
    }
    catch (error) {
      rejected = error;
    }

    const rows = await harness.db
      .select({ clientCode: clients.clientCode })
      .from(clients)
      .where(eq(clients.clientCode, clientCode));
    expect(rejected).toBe(rollbackFailure);
    expect(rows).toEqual([]);
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  test("required invalidation failure reports committed-but-not-propagated without rolling back the Client row", async () => {
    const invalidationFailure = new Error("Runtime Snapshot unavailable");
    const invalidateClient = mock(async () => {
      throw invalidationFailure;
    });
    const mutation = createMutation(invalidateClient);
    const clientCode = "client-mutation-committed";
    let rejected: unknown;

    try {
      await mutation.transaction(async (tx, bindTarget) =>
        await bindTarget(clientCode, async () =>
          await tx.clientRepository.createClient(clientInput(clientCode))));
    }
    catch (error) {
      rejected = error;
    }

    const rows = await harness.db
      .select({ clientCode: clients.clientCode })
      .from(clients)
      .where(eq(clients.clientCode, clientCode));
    expect(rejected).toBeInstanceOf(AfterCommitRequiredTaskError);
    expect(rows).toEqual([{ clientCode }]);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });
});

function createMutation(
  invalidateClient: (clientCode: string) => Promise<unknown>,
) {
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: {
      error: mock(() => undefined),
      warn: mock(() => undefined),
    },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock: {
      nowDate: () => new Date("2026-09-03T00:00:00Z"),
    },
  });
  const clientUnitOfWork = mapUnitOfWork(unitOfWork, tx => ({
    auditService: tx.auditService,
    clientRepository: tx.repositories.client,
  }));

  return createAdminClientMutation({
    invalidation: { invalidateClient },
    logger: { error: mock(() => undefined) },
    uow: clientUnitOfWork,
  });
}

function clientInput(clientCode: string) {
  return {
    clientCode,
    clientName: clientCode,
    clientSecret: `secret-${clientCode}`,
    url: null,
    status: ClientStatus.Enable,
    description: null,
    extAttributes: {},
  };
}
