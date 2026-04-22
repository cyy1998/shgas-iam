import type { OrganizationRouteHandler } from "./organization.type";
import * as ops from "./organization.ops";

export const organizationsSearch: OrganizationRouteHandler<"organizationsSearch"> = async c =>
  c.json(await ops.searchOrganizationOp.run(c.req.valid("json")));

export const organizationsTree: OrganizationRouteHandler<"organizationsTree"> = async c =>
  c.json(await ops.getOrganizationTreeOp.run(undefined));

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
