import type { OrganizationRouteHandler } from "./organization.type";
import * as ops from "./organization.ops";

export const organizationsSearch: OrganizationRouteHandler<"organizationsSearch"> = async c =>
  c.json(await ops.searchOrganizationOp.run(c.req.valid("json")));

export const organizationsChildren: OrganizationRouteHandler<"organizationsChildren"> = async c =>
  c.json(await ops.getOrganizationChildrenOp.run(c.req.valid("query")));

export const organizationsSelector: OrganizationRouteHandler<"organizationsSelector"> = async c =>
  c.json(await ops.getOrganizationSelectorOp.run(c.req.valid("json")));

export const organizationDetail: OrganizationRouteHandler<"organizationDetail"> = async c =>
  c.json(await ops.getOrganizationOp.run(c.req.valid("param")));

export const organizationCreate: OrganizationRouteHandler<"organizationCreate"> = async c =>
  c.json(await ops.createOrganizationOp.run(c.req.valid("json")));

export const organizationUpdate: OrganizationRouteHandler<"organizationUpdate"> = async c =>
  c.json(await ops.updateOrganizationOp.run({
    orgCode: c.req.valid("param").orgCode,
    data: c.req.valid("json"),
  }));

export const organizationStatusUpdate: OrganizationRouteHandler<"organizationStatusUpdate"> = async c =>
  c.json(await ops.updateOrganizationStatusOp.run({
    orgCode: c.req.valid("param").orgCode,
    status: c.req.valid("json").status,
  }));

export const organizationDelete: OrganizationRouteHandler<"organizationDelete"> = async c =>
  c.json(await ops.deleteOrganizationOp.run(c.req.valid("param")));
