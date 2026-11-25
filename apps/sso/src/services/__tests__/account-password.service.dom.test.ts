import { passwordChange } from "@sso/services/public";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";
import { server } from "~sso/test/mocks/server";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();

test("submits the password change as an authenticated account request", async () => {
  let submitted: unknown;
  server.use(
    http.post("*/api/iam/auth/account/password", async ({ request }) => {
      expect(request.headers.get("Client")).toBe("iam");
      expect(request.credentials).toBe("include");
      submitted = await request.json();
      return HttpResponse.json({ code: 200, data: true });
    }),
  );

  await passwordChange({ oldPassword: "old-password", newPassword: "new-password" });
  expect(submitted).toEqual({ oldPassword: "old-password", newPassword: "new-password" });
});
