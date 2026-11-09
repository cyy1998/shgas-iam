import { describe, expect, mock, test } from "bun:test";
import { factsRecord } from "../../__tests__/document-fixture";
import { createSubjectFactsRedisInspector, createSubjectFactsRedisPublisher } from "../../subject-facts";

describe("Subject Facts Redis batch publisher", () => {
  test("reports every published and retained-newer record without serializing the batch", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evalScript = mock(async (...args: unknown[]) => {
      if (evalScript.mock.calls.length === 1) await blocked;
      return args[3] === "2" ? 0 : 1;
    });
    const publisher = createSubjectFactsRedisPublisher({ eval: evalScript });
    const pending = publisher.publishMany([record("1", 1), record("2", 2)]);

    await Promise.resolve();
    expect(evalScript).toHaveBeenCalledTimes(2);
    release();
    const publicationResult = await pending;
    expect(publicationResult).toEqual({ published: 1, retainedNewer: 1 });
  });

  test("batch-inspects valid, missing, and malformed cache records without exposing raw values", async () => {
    const valid = record("3", 1);
    const inspector = createSubjectFactsRedisInspector({
      mget: mock(async () => [JSON.stringify(valid), null, "not-json"]),
    });

    const inspected = await inspector.inspectMany([
      valid.subjectIdentifier,
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ]);
    expect(inspected).toEqual([
      {
        status: "valid",
        record: valid,
      },
      { status: "missing" },
      { status: "invalid" },
    ]);
  });
});

function record(sourceVersion: string, suffix: number) {
  return factsRecord(suffix, sourceVersion);
}
