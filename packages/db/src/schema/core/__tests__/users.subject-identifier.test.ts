import { describe, expect, test } from "bun:test";
import {
  insertUserSchema,
  updateUserSchema,
  users,
} from "../users";

describe("user Subject Identifier schema", () => {
  test("generates one immutable protocol-neutral Subject Identifier for every new user", () => {
    expect(users.subjectIdentifier.notNull).toBe(true);
    expect(users.subjectIdentifier.hasDefault).toBe(true);
    expect(users.subjectIdentifier.isUnique).toBe(true);
    expect("subjectIdentifier" in insertUserSchema.shape).toBe(false);
    expect("subjectIdentifier" in updateUserSchema.shape).toBe(false);
    expect("oidcSubject" in users).toBe(false);
  });
});
