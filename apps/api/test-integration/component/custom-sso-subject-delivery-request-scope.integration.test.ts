import {
  createCustomSsoSubjectDeliveryRequestScope,
} from "@api/services/sso/custom-sso-subject-delivery-request-scope";
import { describe, expect, mock, test } from "bun:test";

describe("Custom SSO subject delivery request scope", () => {
  test("keeps capabilities isolated by request and releases them after the request", async () => {
    const scope = createCustomSsoSubjectDeliveryRequestScope();
    const firstRequest = {};
    const secondRequest = {};
    const firstResolve = mock(async () => ({
      version: 2 as const,
      subjectIdentifier: "00000000-0000-4000-8000-000000001001",
    }));
    const secondResolve = mock(async () => ({
      version: 2 as const,
      subjectIdentifier: "00000000-0000-4000-8000-000000001002",
    }));

    await Promise.all([
      scope.runWithCapability(
        firstRequest,
        { resolveUserInfo: firstResolve },
        async () => {
          await expect(
            scope.resolveUserInfoForRequest(firstRequest),
          ).resolves.toMatchObject({
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001001",
          });
        },
      ),
      scope.runWithCapability(
        secondRequest,
        { resolveUserInfo: secondResolve },
        async () => {
          await expect(
            scope.resolveUserInfoForRequest(secondRequest),
          ).resolves.toMatchObject({
            subjectIdentifier:
              "00000000-0000-4000-8000-000000001002",
          });
        },
      ),
    ]);

    expect(firstResolve).toHaveBeenCalledTimes(1);
    expect(secondResolve).toHaveBeenCalledTimes(1);
    await expect(
      scope.resolveUserInfoForRequest(firstRequest),
    ).rejects.toThrow("request-scoped");
    await expect(
      scope.resolveUserInfoForRequest(secondRequest),
    ).rejects.toThrow("request-scoped");
  });

  test("rejects rebinding the same live request", async () => {
    const scope = createCustomSsoSubjectDeliveryRequestScope();
    const request = {};
    const capability = {
      resolveUserInfo: mock(async () => ({
        version: 2 as const,
        subjectIdentifier:
          "00000000-0000-4000-8000-000000001001",
      })),
    };

    await scope.runWithCapability(request, capability, async () => {
      await expect(
        scope.runWithCapability(request, capability, async () => undefined),
      ).rejects.toThrow("already bound");
    });
  });
});
