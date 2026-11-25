import { ClientStatus } from "@iam/contracts";
import { clientStatus } from "@sso/services/open";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";
import { server } from "~sso/test/mocks/server";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();

test.each(["旧/端?%", ".", "..", "%2E"])(
  "checks status with the exact Client Code %s as a query value",
  async (clientCode) => {
    const client = {
      clientCode,
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
    expect(requestedUrl?.pathname).toBe("/api/iam/auth/client/status");
    expect(requestedUrl?.searchParams.getAll("clientCode")).toEqual([clientCode]);
  },
);
