import { describe, expect, test } from "bun:test";
import { readRecords, readUsernames } from "../user-document-search-journey.ts";

describe("journey search and delegation response arrays", () => {
  test("accepts legitimate empty search and delegation arrays", () => {
    expect(readRecords([])).toEqual([]);
    expect(readUsernames([])).toEqual([]);
    expect(readUsernames([{ user: { username: "admin" } }])).toEqual(["admin"]);
  });

  test("rejects missing arrays and every malformed item", () => {
    for (const value of [undefined, null, {}, [null], [{ id: 1 }, null]]) expect(() => readRecords(value)).toThrow();
    for (const value of [[{}], [{ user: { username: 1 } }], [{ user: { username: "admin" } }, {}]])
      expect(() => readUsernames(value)).toThrow();
  });
});
