import { expect, test } from "bun:test";
import * as clientDomain from "../index";

test("does not publish the pre-cutover legacy client runtime DTO", () => {
  expect("ClientDtoSchema" in clientDomain).toBe(false);
});
