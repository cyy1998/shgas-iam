import { describe, expect, mock, test } from "bun:test";
import { createSubjectAccessBootstrap } from "../../src/subject-access/recovery/bootstrap";

const subjects = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
];

describe("Subject Access bootstrap", () => {
  test("seeds missing subjects in a batch and never overwrites a stable record", async () => {
    const values = new Map<string, string>();
    const evalScript = mock(async (
      _script: string,
      _keyCount: number,
      key: string,
      value: string,
    ) => {
      if (values.has(key))
        return 0;
      values.set(key, value);
      return 1;
    });
    const redis = {
      eval: evalScript,
      async mget(...keys: string[]) {
        return keys.map(key => values.get(key) ?? null);
      },
    };
    const transitionIds = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ];
    const bootstrap = createSubjectAccessBootstrap({
      redis,
      random: { uuid: () => transitionIds.shift()! },
      keyPrefix: "test:subject-access:",
    });
    const seededAt = new Date("2026-08-01T02:00:00.000Z");

    await expect(bootstrap.seedMany([{
      subjectIdentifier: subjects[0]!,
      state: "enabled",
    }, {
      subjectIdentifier: subjects[1]!,
      state: "disabled",
    }], seededAt)).resolves.toEqual({ seeded: 2, retainedExisting: 0 });
    const first = await bootstrap.inspectMany(subjects);

    await expect(bootstrap.seedMany([{
      subjectIdentifier: subjects[0]!,
      state: "disabled",
    }, {
      subjectIdentifier: subjects[1]!,
      state: "enabled",
    }], new Date("2026-08-01T03:00:00.000Z"))).resolves.toEqual({
      seeded: 0,
      retainedExisting: 2,
    });
    expect(await bootstrap.inspectMany(subjects)).toEqual(first);
    expect(first).toEqual([{
      status: "valid",
      record: {
        version: 1,
        subjectIdentifier: subjects[0]!,
        state: "enabled",
        transitionId: "10000000-0000-4000-8000-000000000001",
        updatedAt: seededAt.toISOString(),
      },
    }, {
      status: "valid",
      record: {
        version: 1,
        subjectIdentifier: subjects[1]!,
        state: "disabled",
        transitionId: "10000000-0000-4000-8000-000000000002",
        updatedAt: seededAt.toISOString(),
      },
    }]);
    expect(evalScript).toHaveBeenCalledTimes(4);
  });
});
