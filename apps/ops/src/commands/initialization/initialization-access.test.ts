import { expect, test } from "bun:test";
import { completeInitializationAccess } from "../../composition/initialization-access";

for (const missing of ["postgres", "facts", "access", null]) {
  test(`首次访问只在已发布事实后 seed，并保留已有 Barrier：${missing ?? "complete"}`, async () => {
    const calls: string[] = [];
    let failure: unknown;
    let result: unknown;
    try {
      result = await completeInitializationAccess({
        async verifyPostgres() {
          calls.push("postgres");
          return { status: missing === "postgres" ? "failed" : "passed" };
        },
        async factsArePublished() {
          calls.push("facts");
          return missing !== "facts";
        },
        async seedAccess() {
          calls.push("seed");
          return { seeded: 0, retainedExisting: 1 };
        },
        async verifyAccess() {
          calls.push("access");
          return { status: missing === "access" ? "failed" : "passed" };
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(calls).toEqual(
      missing === "postgres"
        ? ["postgres"]
        : missing === "facts"
          ? ["postgres", "facts"]
          : ["postgres", "facts", "seed", "access"],
    );
    if (missing) expect(failure).toBeInstanceOf(Error);
    else {
      expect(failure).toBeUndefined();
      expect(result).toEqual({ seeded: 0, retainedExisting: 1 });
    }
  });
}
