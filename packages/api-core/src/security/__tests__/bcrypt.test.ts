import { describe, expect, test } from "bun:test";
import { hashSecret, verifySecret } from "../bcrypt";

const EXISTING_BCRYPT_TS_8_HASH = "$2b$04$ZwwFh9CSK/owUc7IdLKdFOPiqfxmljguVbVqfGRZq8J9tkkdrcxH2";

describe("bcrypt password compatibility", () => {
  test("verifies an existing bcrypt-ts 8 hash and rejects a wrong password", async () => {
    await expect(verifySecret("Existing123!", EXISTING_BCRYPT_TS_8_HASH)).resolves.toBe(true);
    await expect(verifySecret("Wrong123!", EXISTING_BCRYPT_TS_8_HASH)).resolves.toBe(false);
  });

  test("round-trips newly created hashes without storing the password", async () => {
    const password = "NewSecret123!";
    const secretHash = await hashSecret(password, 4);

    expect(secretHash).not.toContain(password);
    await expect(verifySecret(password, secretHash)).resolves.toBe(true);
    await expect(verifySecret("Wrong123!", secretHash)).resolves.toBe(false);
  });
});
