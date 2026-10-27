import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { currentAdminUser } from "~admin/test/mocks/fixtures";
import { server } from "~admin/test/mocks/server";
import { registerMswLifecycle } from "~admin/test/setup-msw";
import { loadCurrentAdminUser } from "../current-user";

vi.mock("@admin/constants/config", () => ({ API_PREFIX: "http://localhost", SSO_CLIENT_CODE: "iam-admin" }));

registerMswLifecycle();

describe("current Admin user service", () => {
  it("reads the current Client wire and exposes only the selected shell identity and roles", async () => {
    let observedClient: string | null = null;
    server.use(
      http.get("http://localhost/public/user-info", ({ request }) => {
        observedClient = request.headers.get("Client");
        return HttpResponse.json({ code: 200, data: currentAdminUser });
      }),
    );

    const result = await loadCurrentAdminUser();

    expect(observedClient).toBe("iam-admin");
    expect(result).toEqual({
      kind: "available",
      user: { username: "admin", name: "管理员", roles: ["iam:admin"] },
    });
  });

  it("distinguishes an unauthenticated request from temporarily unavailable user info", async () => {
    server.use(http.get("http://localhost/public/user-info", () => new HttpResponse(null, { status: 401 })));
    const unauthenticated = await loadCurrentAdminUser();
    expect(unauthenticated).toEqual({ kind: "unauthenticated" });

    server.use(http.get("http://localhost/public/user-info", () => new HttpResponse(null, { status: 503 })));
    const unavailable = await loadCurrentAdminUser();
    expect(unavailable).toEqual({ kind: "unavailable" });
  });

  it("rejects a previous wire so the shell cannot initialize from mixed generations", async () => {
    server.use(
      http.get("http://localhost/public/user-info", () =>
        HttpResponse.json({
          code: 200,
          data: { ...currentAdminUser, version: 3 },
        }),
      ),
    );
    let failure: unknown;
    try {
      await loadCurrentAdminUser();
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ name: "ZodError", issues: [{ path: ["data", "version"] }] });
  });
});
