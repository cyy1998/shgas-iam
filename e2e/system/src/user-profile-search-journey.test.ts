import { describe, expect, test } from "bun:test";
import { readRecords, readUsernames } from "./user-profile-search-journey.ts";

describe("journey search and delegation response arrays", () => {
  test("accepts legitimate empty search and delegation arrays", () => {
    expect(readRecords([])).toEqual([]);
    expect(readUsernames([])).toEqual([]);
    expect(readUsernames([{ username: "admin" }])).toEqual(["admin"]);
  });

  test("rejects missing arrays and every malformed item", () => {
    for (const value of [undefined, null, {}, [null], [{ id: 1 }, null]])
      expect(() => readRecords(value)).toThrow();
    for (const value of [[{}], [{ username: 1 }], [{ username: "admin" }, {}]])
      expect(() => readUsernames(value)).toThrow();
  });
});
