import { describe, expect, test } from "bun:test";
import {
  insertUserSchema,
  updateUserSchema,
  users,
} from "../users";

describe("user OIDC subject schema", () => {
  test("generates a unique subject for new users and keeps it immutable across updates and restore", () => {
    expect(users.oidcSubject.notNull).toBe(true);
    expect(users.oidcSubject.hasDefault).toBe(true);
    expect(users.oidcSubject.isUnique).toBe(true);
    expect("oidcSubject" in insertUserSchema.shape).toBe(false);
    expect("oidcSubject" in updateUserSchema.shape).toBe(false);
  });
});
