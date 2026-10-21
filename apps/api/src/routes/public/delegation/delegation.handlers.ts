import { getApiAuditRequestContext } from "@api/services/audit/audit.context";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import * as resp from "@iam/api-core/http";
import type { DelegationService } from "@iam/delegation";
import type { PublicDelegationRouteHandler } from "./delegation.type";

export interface PublicDelegationDependencies {
  delegation: DelegationService;
  resolveAccount: (subjectIdentifier: string) => Promise<{ id: number; username: string } | null>;
}

/** The authenticated middleware owns Subject Access; these handlers only resolve its trusted subject. */
export function createPublicDelegationHandlers(deps: PublicDelegationDependencies) {
  async function account(subjectIdentifier: string) {
    const result = await deps.resolveAccount(subjectIdentifier);
    if (!result) throw new AuthzUnauthorizedError("未登录");
    return result;
  }
  const create: PublicDelegationRouteHandler<"create"> = async (c) => {
    const user = await account(c.get("subjectIdentifier"));
    const result = await deps.delegation.create(
      c.req.valid("json"),
      { kind: "delegator", userId: user.id },
      {
        actionPrefix: "sso",
        actor: { actorType: "user", actorUserId: user.id, actorUsername: user.username },
        requestContext: getApiAuditRequestContext(c),
      },
    );
    return c.json(resp.ok(result), HttpStatusCodes.OK);
  };
  const search: PublicDelegationRouteHandler<"search"> = async (c) => {
    const user = await account(c.get("subjectIdentifier"));
    const { direction, ...query } = c.req.valid("json");
    const result = await deps.delegation.search(query, {
      kind: direction === "incoming" ? "delegatee" : "delegator",
      userId: user.id,
    });
    return c.json(resp.ok(result), HttpStatusCodes.OK);
  };
  const update: PublicDelegationRouteHandler<"update"> = async (c) => {
    const user = await account(c.get("subjectIdentifier"));
    const result = await deps.delegation.update(
      c.req.valid("param").id,
      c.req.valid("json"),
      { kind: "delegator", userId: user.id },
      {
        actionPrefix: "sso",
        actor: { actorType: "user", actorUserId: user.id, actorUsername: user.username },
        requestContext: getApiAuditRequestContext(c),
      },
    );
    return c.json(resp.ok(result), HttpStatusCodes.OK);
  };
  const userChoices: PublicDelegationRouteHandler<"userChoices"> = async (c) => {
    const user = await account(c.get("subjectIdentifier"));
    const result = await deps.delegation.selectUsers({ ...c.req.valid("query"), purpose: "create" });
    return c.json(resp.ok(result.filter((candidate) => candidate.id !== user.id)), HttpStatusCodes.OK);
  };
  const clientChoices: PublicDelegationRouteHandler<"clientChoices"> = async (c) => {
    await account(c.get("subjectIdentifier"));
    return c.json(
      resp.ok(await deps.delegation.selectClients({ ...c.req.valid("query"), purpose: "create" })),
      HttpStatusCodes.OK,
    );
  };
  const organizationChoices: PublicDelegationRouteHandler<"organizationChoices"> = async (c) => {
    await account(c.get("subjectIdentifier"));
    return c.json(
      resp.ok(await deps.delegation.selectOrganizations({ ...c.req.valid("query"), purpose: "create" })),
      HttpStatusCodes.OK,
    );
  };
  return { create, search, update, userChoices, clientChoices, organizationChoices };
}

export type PublicDelegationHandlers = ReturnType<typeof createPublicDelegationHandlers>;
