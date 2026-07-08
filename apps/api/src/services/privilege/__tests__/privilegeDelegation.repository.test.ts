import { BadRequestError } from "@iam/api-core/errors";
import { describe, expect, test } from "bun:test";
import { createPrivilegeDelegationRepository } from "../privilegeDelegation.repository";

describe("createPrivilegeDelegationRepository", () => {
  test("rejects incomplete create input as bad request before touching storage", async () => {
    const repository = createPrivilegeDelegationRepository({
      insert: () => {
        throw new Error("db should not be touched");
      },
    } as never);

    await expect(repository.setPrivilegeDelegation({
      delegatorUsername: "zhangsan",
      delegateeUsername: "lisi",
      orgCode: "ORG",
      privilegeCodes: ["privilege:a"],
      startTime: new Date("2026-01-01T00:00:00Z"),
      endTime: new Date("2026-01-02T00:00:00Z"),
    } as never)).rejects.toBeInstanceOf(BadRequestError);
  });
});
