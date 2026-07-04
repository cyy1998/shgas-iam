import { EmploymentStatus } from "@iam/contracts";
import { EmploymentAlreadyExistsError } from "@iam/domain/employment";
import { describe, expect, mock, test } from "bun:test";
import { createEmploymentRepository } from "../employment.repository";

function uniqueViolation() {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint: "employment_active_relationship_unique_idx",
  });
}

describe("createEmploymentRepository", () => {
  test("maps active relationship unique violations to employment already exists", async () => {
    const returning = mock(async () => {
      throw uniqueViolation();
    });
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const repository = createEmploymentRepository({ insert } as any);

    await expect(repository.createEmploymentRecord({
      userId: 1,
      orgId: 2,
      posId: 3,
      status: EmploymentStatus.Enable,
    })).rejects.toBeInstanceOf(EmploymentAlreadyExistsError);
  });
});
