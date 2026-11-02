import { expect, test } from "bun:test";
import { createUserDocumentPostPublicationProcessor } from "../user-document-post-publication.processor";

function input() {
  return {
    db: {} as never,
    projection: {} as never,
    subjectFactsPublisher: {
      async publish() {
        return { status: "published" as const };
      },
    },
    subjectAccessRepair: {
      async repairSubject() {
        return { status: "stable" };
      },
    },
    logger: { warn() {} },
    clock: { nowDate: () => new Date("2026-11-02T10:00:00Z") },
    batchSize: 100,
  };
}

test("post-publication rejects unbounded or fractional work configuration before accessing dependencies", () => {
  for (const value of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => createUserDocumentPostPublicationProcessor({ ...input(), batchSize: value })).toThrow(RangeError);
    expect(() => createUserDocumentPostPublicationProcessor({ ...input(), concurrency: value })).toThrow(RangeError);
  }
});

test("post-publication rejects noncanonical or nonstring versions before accessing dependencies", async () => {
  let reads = 0;
  const options = input();
  options.db = new Proxy(
    {},
    {
      get() {
        reads += 1;
        throw new Error("Unexpected database access");
      },
    },
  ) as never;
  const processor = createUserDocumentPostPublicationProcessor(options);
  for (const version of ["0", "01", "-1", "1.5", 1]) {
    let failure: unknown;
    try {
      await processor.processMany([{ userId: 1, version }] as never);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
  }
  expect(reads).toBe(0);
});
