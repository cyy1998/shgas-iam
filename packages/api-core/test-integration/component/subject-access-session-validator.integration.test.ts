import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectAccessPrincipalValidator,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "../../src/subject-access";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";

describe("Subject Access Session Kernel validator", () => {
  test("allows enabled subjects and turns disabled subjects into the revoking validation result", async () => {
    const isCommittedTransitionCurrent = mock(async () => true);
    const readCommittedTransitionId = mock(
      async () => "20000000-0000-4000-8000-000000000001",
    );
    const principalFence = createSubjectAccessPrincipalValidator({
      isCommittedTransitionCurrent,
      readCommittedTransitionId,
    });

    await expect(principalFence.validate({
      subjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
      principal: {
        principalType: "user",
        subjectId: subjectIdentifier,
      },
    })).resolves.toEqual({ ok: true });
    expect(isCommittedTransitionCurrent).toHaveBeenCalledWith(
      subjectIdentifier,
      "20000000-0000-4000-8000-000000000001",
    );

    isCommittedTransitionCurrent.mockImplementationOnce(async () => {
      throw new SubjectAccessDisabledError();
    });
    await expect(principalFence.validate({
      subjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
      principal: {
        principalType: "user",
        subjectId: subjectIdentifier,
      },
    })).resolves.toEqual({
      ok: false,
      reason: "user_disabled",
      message: "Subject access is disabled",
    });
  });

  test("returns a session-scoped failure for a stale generation", async () => {
    const principalFence = createSubjectAccessPrincipalValidator({
      isCommittedTransitionCurrent: mock(async () => false),
      readCommittedTransitionId: mock(
        async () => "20000000-0000-4000-8000-000000000002",
      ),
    });

    await expect(principalFence.validate({
      subjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
      principal: {
        principalType: "user",
        subjectId: subjectIdentifier,
      },
    })).resolves.toEqual({
      ok: false,
      reason: "session_generation_stale",
      message: "Subject session generation is stale",
    });
  });

  test("propagates uncertain access without asking Session Kernel to revoke", async () => {
    const unavailable = new SubjectAccessUnavailableError();
    const principalFence = createSubjectAccessPrincipalValidator({
      isCommittedTransitionCurrent: mock(async () => {
        throw unavailable;
      }),
      readCommittedTransitionId: mock(
        async () => "20000000-0000-4000-8000-000000000001",
      ),
    });

    await expect(principalFence.validate({
      subjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
      principal: {
        principalType: "user",
        subjectId: subjectIdentifier,
      },
    })).rejects.toBe(unavailable);
  });
});
