import { expect, test } from "bun:test";
import { assertDocumentRebuildRequest } from "../index";

test("rebuild requests preserve arbitrarily large database versions and reject non-canonical values", () => {
  expect(assertDocumentRebuildRequest({ targetId: 1, version: "9007199254740993" })).toEqual({
    targetId: 1,
    version: "9007199254740993",
  });
  expect(() => assertDocumentRebuildRequest({ targetId: 1, version: "01" })).toThrow();
});
