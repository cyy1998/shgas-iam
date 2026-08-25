import type { Context, Next } from "hono";
import type {
  AdminAuthorizationActor,
  AdminAuthorizationPolicy,
  AdminOperationAuthorization,
} from "./admin-authorization.policy";
import type { AdminOperationId } from "./admin-operation.registry";
import type { AdminRestOperationSurface } from "./admin-rest-operation.surface";
import { AuthzForbiddenError } from "@iam/api-core/errors/AuthzForbiddenError";

const operationAuthorizationsByContext = new WeakMap<
  Context,
  Map<AdminOperationId, AdminOperationAuthorization>
>();

export function getAdminAuthorizationContext(c: Context): {
  actor: AdminAuthorizationActor;
  policy: AdminAuthorizationPolicy;
} {
  const policy = c.get("adminAuthorizationPolicy" as never) as
    | AdminAuthorizationPolicy
    | undefined;
  const user = c.get("userDetailDto" as never) as
    | { roles?: unknown }
    | undefined;
  const userId = c.get("userId" as never) as unknown;
  const username = c.get("username" as never) as unknown;
  if (
    !policy
    || !user
    || !Array.isArray(user.roles)
    || !user.roles.every(role => typeof role === "string")
    || typeof userId !== "number"
    || typeof username !== "string"
  ) {
    throw new AuthzForbiddenError("无管理端操作权限");
  }
  return {
    actor: { userId, username, roles: user.roles },
    policy,
  };
}

export function createAdminAuthorizationContextHandler(
  policy: AdminAuthorizationPolicy,
) {
  return async function adminAuthorizationContextHandler(
    c: Context,
    next: Next,
  ) {
    c.set("adminAuthorizationPolicy" as never, policy as never);
    return await next();
  };
}

export async function authorizeAdminOperationForContext(
  c: Context,
  input: {
    operationId: AdminOperationId;
    operationInput: unknown;
  },
) {
  const { actor, policy } = getAdminAuthorizationContext(c);
  policy.assertOperationInputAllowed({
    actor,
    operationId: input.operationId,
    operationInput: input.operationInput,
  });
  let authorizations = operationAuthorizationsByContext.get(c);
  const cached = authorizations?.get(input.operationId);
  if (cached)
    return cached;

  const authorization = await policy.assertOperationAllowed({
    actor,
    operationId: input.operationId,
    operationInput: input.operationInput,
  });
  authorizations ??= new Map();
  authorizations.set(input.operationId, authorization);
  operationAuthorizationsByContext.set(c, authorizations);
  return authorization;
}

export async function resolveAdminUserAuthorizationForContext(
  c: Context,
  operationId: AdminOperationId,
) {
  const { actor, policy } = getAdminAuthorizationContext(c);
  const operationAuthorization = await authorizeAdminOperationForContext(c, {
    operationId,
    operationInput: undefined,
  });
  return await policy.getUserAuthorization(
    actor,
    operationAuthorization.hrAdministrationScope,
  );
}

export async function resolveAdminOrganizationResponsibilityAuthorizationForContext(
  c: Context,
  operationId: AdminOperationId,
) {
  const { actor, policy } = getAdminAuthorizationContext(c);
  const operationAuthorization = await authorizeAdminOperationForContext(c, {
    operationId,
    operationInput: undefined,
  });
  return await policy.getOrganizationResponsibilityAuthorization(
    actor,
    operationAuthorization.hrAdministrationScope,
  );
}

export function createAdminRestAuthorizationHandler(
  surface: AdminRestOperationSurface,
) {
  return async function adminRestAuthorizationHandler(c: Context, next: Next) {
    const tierBasePath = c.get("tierBasePath" as never) as unknown;
    const relativePath = typeof tierBasePath === "string"
      ? c.req.path.slice(tierBasePath.length) || "/"
      : c.req.path;
    const operation = surface.match(c.req.method, relativePath);
    if (!operation)
      return await next();

    const requestInput = await readRequestInput(c);
    await authorizeAdminOperationForContext(c, {
      operationId: operation.operationId,
      operationInput: {
        params: operation.params,
        query: requestInput.query,
        body: requestInput.body,
      },
    });
    return await next();
  };
}

async function readRequestInput(c: Context) {
  const query = c.req.queries();
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json"))
    return { body: undefined, query };
  try {
    const body = await c.req.raw.clone().json();
    return { body, query };
  }
  catch {
    return { body: undefined, query };
  }
}
