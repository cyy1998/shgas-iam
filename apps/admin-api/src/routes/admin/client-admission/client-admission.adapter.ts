import { defineAdminApiMutationOperation, defineAdminApiQueryOperation } from "@admin-api/lib/admin-api-adapter";
import { getAdminAuthorizationContext } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { getAdminAuditActor, getAdminAuditRequestContext } from "@admin-api/services/audit/audit.context";
import type { ClientAdmissionService } from "@admin-api/services/client-admission/client-admission.service";
import type { AdminBindings, AdminRouteHandler } from "@admin-api/types/lib";
import { createRoute, z } from "@hono/zod-openapi";
import { createRouter } from "@iam/api-core/core/create-router";
import { commonErrorResponses } from "@iam/api-core/core/openapi/helpers/common-error-responses";
import jsonContent from "@iam/api-core/core/openapi/helpers/json-content";
import jsonContentRequired from "@iam/api-core/core/openapi/helpers/json-content-required";
import createSuccessResponseSchema from "@iam/api-core/core/openapi/schemas/create-success-schema";
import { router } from "@iam/api-core/trpc";
import { ClientCodeSchema, createAdminMutationResultSchema } from "@iam/contracts";
import { HttpStatusCodes } from "@iam/contracts/http";
import { UserDocumentFilterTransportSchema } from "@iam/documents/user/document/query";
import { isApiRuntimeError } from "@iam/runtime/errors";

const target = z.object({ clientCode: ClientCodeSchema });
const policy = z.object({ enabled: z.boolean(), filter: UserDocumentFilterTransportSchema.nullable() });
const policyDetail = policy.extend({
  allowedActions: z.object({ save: z.boolean(), preview: z.boolean(), setEnabled: z.boolean() }),
});
const saveBody = z.object({ filter: UserDocumentFilterTransportSchema }).strict();
const enabledBody = z.object({ enabled: z.boolean() }).strict();
const previewBody = saveBody.extend({ userId: z.number().int().positive() });
const previewResult = z.object({ status: z.enum(["match", "no-match", "unavailable"]) });
const admissionPath = "/{clientCode}/admission";
const tags = ["Admin/Client Admission"];

async function writePolicy<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (error) {
    if (isApiRuntimeError(error)) throw error;
    // Database diagnostics can include rule values. Omit the cause from the HTTP error and request log.
    throw new Error("Client admission policy storage update failed");
  }
}

export function createClientAdmissionAdapter(service: ClientAdmissionService) {
  const detail = defineAdminApiQueryOperation({
    operationId: "admin.clientAdmission.detail",
    input: target,
    restInput: (c) => target.parse(c.req.valid("param")),
    handler: async ({ clientCode }, { hono }) => {
      const { actor, policy: authorization } = getAdminAuthorizationContext(hono);
      const [save, preview, setEnabled] = await Promise.all([
        authorization.decideOperation({ actor, operationId: "admin.clientAdmission.save" }),
        authorization.decideOperation({ actor, operationId: "admin.clientAdmission.preview" }),
        authorization.decideOperation({ actor, operationId: "admin.clientAdmission.setEnabled" }),
      ]);
      return {
        ...(await service.detail(clientCode)),
        allowedActions: { save: save.allowed, preview: preview.allowed, setEnabled: setEnabled.allowed },
      };
    },
  });
  const save = defineAdminApiMutationOperation({
    operationId: "admin.clientAdmission.save",
    input: target.extend({ data: saveBody }).strict(),
    restInput: (c) => ({ ...target.parse(c.req.valid("param")), data: saveBody.parse(c.req.valid("json")) }),
    handler: ({ clientCode, data }, { hono }) =>
      writePolicy(() =>
        service.save(clientCode, data.filter, { ...getAdminAuditActor(hono), ...getAdminAuditRequestContext(hono) }),
      ),
  });
  const setEnabled = defineAdminApiMutationOperation({
    operationId: "admin.clientAdmission.setEnabled",
    input: target.extend({ data: enabledBody }).strict(),
    restInput: (c) => ({ ...target.parse(c.req.valid("param")), data: enabledBody.parse(c.req.valid("json")) }),
    handler: ({ clientCode, data }, { hono }) =>
      writePolicy(() =>
        service.setEnabled(clientCode, data.enabled, {
          ...getAdminAuditActor(hono),
          ...getAdminAuditRequestContext(hono),
        }),
      ),
  });
  // Use a POST body for the expression and the selected user.
  const preview = defineAdminApiMutationOperation({
    operationId: "admin.clientAdmission.preview",
    input: target.extend({ data: previewBody }).strict(),
    restInput: (c) => ({ ...target.parse(c.req.valid("param")), data: previewBody.parse(c.req.valid("json")) }),
    handler: ({ clientCode, data }) => service.preview(clientCode, data.userId, data.filter),
  });
  const detailRoute = createRoute({
    method: "get",
    path: admissionPath,
    tags,
    request: { params: target },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(policyDetail), "应用准入策略"),
    },
  });

  const saveRoute = createRoute({
    method: "post",
    path: admissionPath,
    tags,
    request: { params: target, body: jsonContentRequired(saveBody, "应用准入条件") },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(
        createSuccessResponseSchema(createAdminMutationResultSchema(policy)),
        "保存结果",
      ),
    },
  });

  const previewRoute = createRoute({
    method: "post",
    path: `${admissionPath}/preview`,
    tags,
    request: { params: target, body: jsonContentRequired(previewBody, "单用户试算") },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(createSuccessResponseSchema(previewResult), "试算结果"),
    },
  });

  const enabledRoute = createRoute({
    method: "post",
    path: `${admissionPath}/enabled`,
    tags,
    request: { params: target, body: jsonContentRequired(enabledBody, "应用准入启停") },
    responses: {
      ...commonErrorResponses,
      [HttpStatusCodes.OK]: jsonContent(
        createSuccessResponseSchema(createAdminMutationResultSchema(enabledBody)),
        "应用准入启停结果",
      ),
    },
  });

  return {
    rest: createRouter<AdminBindings>()
      .basePath("/clients")
      .openapi(detailRoute, detail.toHandler<AdminRouteHandler<typeof detailRoute>>())
      .openapi(saveRoute, save.toHandler<AdminRouteHandler<typeof saveRoute>>())
      .openapi(enabledRoute, setEnabled.toHandler<AdminRouteHandler<typeof enabledRoute>>())
      .openapi(previewRoute, preview.toHandler<AdminRouteHandler<typeof previewRoute>>()),
    trpc: router({
      detail: detail.toTRPC(),
      save: save.toTRPC(),
      setEnabled: setEnabled.toTRPC(),
      preview: preview.toTRPC(),
    }),
  };
}

export type ClientAdmissionRouter = ReturnType<typeof createClientAdmissionAdapter>["trpc"];
