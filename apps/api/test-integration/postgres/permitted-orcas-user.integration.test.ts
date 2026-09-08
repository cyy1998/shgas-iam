import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import { createUserRepository } from "@api/services/user/user.repository";
import { UserStatus } from "@iam/contracts";
import { users } from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createApiPostgresTestHarness } from "./postgres-test-harness";

let harness: ApiPostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("permitted ORCAS user identity PostgreSQL contract", () => {
  test("finds disabled and deleted identities while existing active reads still reject them", async () => {
    const repository = createUserRepository(harness!.db);
    for (const [index, state] of [
      { status: UserStatus.Disable, isDelete: false },
      { status: UserStatus.Enable, isDelete: true },
      { status: UserStatus.Pause, isDelete: false },
    ].entries()) {
      const subjectIdentifier = `20000000-0000-4000-8000-00000000000${index + 1}`;
      const [user] = await harness!.db.insert(users).values({
        subjectIdentifier,
        username: `orcas-${index}`,
        name: "ORCAS 用户",
        ...state,
      }).returning({ id: users.id });

      const identity = await repository.findUserIdentityBySubjectIdentifier(subjectIdentifier);
      const activeUser = await repository.getUserBySubjectIdentifier(subjectIdentifier);
      expect(identity).toEqual({ id: user!.id });
      expect(activeUser).toBeNull();
    }
    const unknown = await repository.findUserIdentityBySubjectIdentifier("20000000-0000-4000-8000-000000000099");
    expect(unknown).toBeNull();
  });
});
