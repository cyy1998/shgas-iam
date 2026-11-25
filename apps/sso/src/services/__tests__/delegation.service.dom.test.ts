import { createPersonalDelegation, searchPersonalDelegations } from "@sso/services/delegation";
import { HttpResponse, http } from "msw";
import { expect, test, vi } from "vitest";
import { delegationRecord } from "~sso/test/mocks/delegation";
import { server } from "~sso/test/mocks/server";
import { registerMswLifecycle } from "~sso/test/setup-msw";

vi.mock("@sso/constants/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sso/constants/config")>()),
  SSO_CLIENT_CODE: "another-client",
}));

registerMswLifecycle();
test("uses the IAM root session for personal delegation and parses the response dates", async () => {
  let submitted: unknown;
  let query: unknown;
  server.use(
    http.post("*/api/iam/delegations", async ({ request }) => {
      expect(request.headers.get("Client")).toBe("iam");
      expect(request.credentials).toBe("include");
      submitted = await request.json();
      return HttpResponse.json({ code: 200, data: { changed: true, result: delegationRecord } });
    }),
    http.post("*/api/iam/delegations/search", async ({ request }) => {
      expect(request.headers.get("Client")).toBe("iam");
      query = await request.json();
      return HttpResponse.json({ code: 200, data: [delegationRecord] });
    }),
  );
  const created = await createPersonalDelegation({
    clientId: 7,
    delegateeUsername: "bob",
    orgCode: "FINANCE",
    startTime: new Date("2026-10-20T00:00:00Z"),
    endTime: new Date("2026-10-30T00:00:00Z"),
    description: "出差",
  });
  expect(submitted).toEqual({
    clientId: 7,
    delegateeUsername: "bob",
    orgCode: "FINANCE",
    startTime: "2026-10-20T00:00:00.000Z",
    endTime: "2026-10-30T00:00:00.000Z",
    description: "出差",
  });
  expect(created.result.startTime).toEqual(new Date("2026-10-20T00:00:00Z"));
  const received = await searchPersonalDelegations("incoming", { statuses: [3] });
  expect(query).toEqual({ direction: "incoming", statuses: [3] });
  expect(received[0].endTime).toEqual(new Date("2026-10-30T00:00:00Z"));
});
