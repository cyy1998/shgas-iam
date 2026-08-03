import { describe, expect, test } from "bun:test";
import {
  assertCanonicalRehearsalSubjectClaimSeed,
  CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS,
} from "../testing";

describe("Custom SSO rehearsal Subject Claim seeds", () => {
  test("publishes one canonical seed for each client mode", () => {
    expect(CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS).toEqual({
      gateway: [
        "subjectIdentifier",
        "profile:username",
        "profile:name",
      ],
      independent: ["subjectIdentifier"],
    });
  });

  test("rejects a wire path substituted for a canonical claim name", () => {
    expect(() => assertCanonicalRehearsalSubjectClaimSeed(
      "gateway",
      ["subjectIdentifier", "profile.username", "profile.name"],
    )).toThrow();
  });

  test("rejects a valid but mode-drifted seed", () => {
    expect(() => assertCanonicalRehearsalSubjectClaimSeed(
      "independent",
      CUSTOM_SSO_REHEARSAL_SUBJECT_CLAIM_SEEDS.gateway,
    )).toThrow();
  });
});
