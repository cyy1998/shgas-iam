import type { AdminBindings } from "@admin-api/types/lib";
import type { ClientAdapter } from "./client.adapter";
import { createRouter } from "@iam/api-core/core/create-router";
import * as routes from "./client.routes";

export function createClientRoute(adapter: ClientAdapter) {
  return createRouter<AdminBindings>()
    .basePath("/clients")
    .openapi(routes.clientsSearch, adapter.clientsSearch)
    .openapi(routes.clientCreate, adapter.clientCreate)
    .openapi(routes.clientDetail, adapter.clientDetail)
    .openapi(routes.clientUpdate, adapter.clientUpdate)
    .openapi(routes.clientStatusUpdate, adapter.clientStatusUpdate)
    .openapi(routes.clientDelete, adapter.clientDelete)
    .openapi(routes.clientCustomSsoConfigure, adapter.clientCustomSsoConfigure)
    .openapi(routes.clientCustomSsoEnable, adapter.clientCustomSsoEnable)
    .openapi(routes.clientCustomSsoDisable, adapter.clientCustomSsoDisable)
    .openapi(routes.clientCustomSsoRemove, adapter.clientCustomSsoRemove)
    .openapi(routes.clientCustomSsoRotateSecret, adapter.clientCustomSsoRotateSecret)
    .openapi(routes.clientOidcConfigure, adapter.clientOidcConfigure)
    .openapi(routes.clientOidcEnable, adapter.clientOidcEnable)
    .openapi(routes.clientOidcDisable, adapter.clientOidcDisable)
    .openapi(routes.clientOidcRemove, adapter.clientOidcRemove)
    .openapi(routes.clientOidcRotateSecret, adapter.clientOidcRotateSecret)
    .openapi(routes.clientCreateLegacy, adapter.clientCreateLegacy)
    .openapi(routes.clientUpdateLegacy, adapter.clientUpdateLegacy);
}
