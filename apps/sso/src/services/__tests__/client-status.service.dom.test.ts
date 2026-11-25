import { ClientStatus } from "@iam/contracts";
import { clientStatus } from "@sso/services/open";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";
import { server } from "~sso/test/mocks/server";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();

test("checks the status of a Client Code containing non-ASCII and URL characters", async () => {
  const client = {
    clientCode: "旧/端?%",
    clientName: "旧系统",
    status: ClientStatus.Enable,
    url: null,
  };
  let requestedUrl: URL | undefined;
  server.use(
    http.get("*", ({ request }) => {
      requestedUrl = new URL(request.url);
      return HttpResponse.json({ code: 200, data: client });
    }),
  );

  const result = await clientStatus({ clientCode: client.clientCode });
  expect(result).toEqual(client);
  expect(requestedUrl?.pathname).toBe("/api/iam/auth/clients/%E6%97%A7%2F%E7%AB%AF%3F%25/status");
  expect(requestedUrl?.search).toBe("");
});
