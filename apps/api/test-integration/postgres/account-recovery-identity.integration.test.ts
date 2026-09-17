import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import { createUserRepository } from "@api/services/user/user.repository";
import { UserStatus } from "@iam/contracts";
import { users } from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createApiPostgresTestHarness } from "./postgres-test-harness";

let harness: ApiPostgresTestHarness;

beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness?.close();
});

describe("Account Recovery account existence", () => {
  test.each([UserStatus.Enable, UserStatus.Pause, UserStatus.Disable])(
    "recognizes an existing %s account even without a published Profile",
    async (status) => {
      const [user] = await harness.db.insert(users).values({
        subjectIdentifier: "20000000-0000-4000-8000-000000000001",
        username: "recovery-user",
        name: "恢复用户",
        status,
      }).returning({ id: users.id });
      const result = await createUserRepository(harness.db).findUserIdentityByUsername("recovery-user");
      expect(result).toEqual({ id: user!.id });
    },
  );

  test("treats deleted and unknown accounts as absent", async () => {
    await harness.db.insert(users).values({
      subjectIdentifier: "20000000-0000-4000-8000-000000000001",
      username: "deleted-user",
      name: "已删除用户",
      isDelete: true,
    });
    const repository = createUserRepository(harness.db);
    const deleted = await repository.findUserIdentityByUsername("deleted-user");
    const unknown = await repository.findUserIdentityByUsername("unknown");
    expect(deleted).toBeNull();
    expect(unknown).toBeNull();
  });
});
