import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import * as resp from "@iam/api-core/http";
import { describe, expect, mock, test } from "bun:test";
import { createPublicHandlers } from "../public.handlers";

function createHandlers() {
  return createPublicHandlers({
    organizationService: {},
    userService: {},
  } as never);
}

function makeContext(orcasId: string | null | undefined) {
  return {
    get: mock((key: string) => key === "customSsoSessionOrcasId" ? orcasId : undefined),
    json: mock((body: unknown) => body),
  };
}

describe("createPublicHandlers", () => {
  test("orcasId returns the Custom SSO session Orcas ID", async () => {
    const handlers = createHandlers();
    const context = makeContext("orcas-user-1");

    const result: unknown = await handlers.orcasId(context as never, undefined as never);

    expect(result).toEqual(resp.ok({ orcasId: "orcas-user-1" }));
    expect(context.json).toHaveBeenCalledWith(resp.ok({ orcasId: "orcas-user-1" }), HttpStatusCodes.OK);
  });

  test("orcasId returns null when the session has no Orcas ID", async () => {
    const handlers = createHandlers();
    const context = makeContext(undefined);

    const result: unknown = await handlers.orcasId(context as never, undefined as never);

    expect(result).toEqual(resp.ok({ orcasId: null }));
    expect(context.json).toHaveBeenCalledWith(resp.ok({ orcasId: null }), HttpStatusCodes.OK);
  });
});
