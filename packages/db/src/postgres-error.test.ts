import { describe, expect, test } from "bun:test";
import { extractPostgresError } from "./postgres-error";

describe("structured PostgreSQL errors", () => {
  test("extracts postgres.js and nested driver metadata", () => {
    expect(extractPostgresError({ cause: { code: "23505", constraint_name: "known" } }))
      .toEqual({ code: "23505", constraint: "known" });
    expect(extractPostgresError({ cause: { cause: { code: "23514", constraint: "check" } } }))
      .toEqual({ code: "23514", constraint: "check" });
  });

  test("does not infer database facts from text and terminates cyclic causes", () => {
    const cycle: { cause?: unknown } = {};
    cycle.cause = cycle;
    expect(extractPostgresError(cycle)).toBeNull();
    expect(extractPostgresError(new Error("23505 constraint known"))).toBeNull();
    expect(extractPostgresError({ code: "ECONNRESET" })).toBeNull();
    expect(extractPostgresError({ code: "23505" })).toEqual({ code: "23505", constraint: null });
  });
});
