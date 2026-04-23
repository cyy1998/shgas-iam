import type { EmploymentRouteHandler } from "./employment.type";
import * as ops from "./employment.ops";

export const employmentsSearch: EmploymentRouteHandler<"employmentsSearch"> = async c =>
  c.json(await ops.searchEmploymentOp.run(c.req.valid("json")));

export const employmentsDetail: EmploymentRouteHandler<"employmentsDetail"> = async c =>
  c.json(await ops.getEmploymentOp.run(c.req.valid("param")));

export const employmentsCreate: EmploymentRouteHandler<"employmentsCreate"> = async c =>
  c.json(await ops.createEmploymentOp.run(c.req.valid("json")));

export const employmentsUpdate: EmploymentRouteHandler<"employmentsUpdate"> = async c =>
  c.json(await ops.updateEmploymentOp.run({
    id: c.req.valid("param").id,
    data: c.req.valid("json"),
  }));

export const employmentsStatusUpdate: EmploymentRouteHandler<"employmentsStatusUpdate"> = async c =>
  c.json(await ops.updateEmploymentStatusOp.run({
    id: c.req.valid("param").id,
    status: c.req.valid("json").status,
  }));

export const employmentsDelete: EmploymentRouteHandler<"employmentsDelete"> = async c =>
  c.json(await ops.deleteEmploymentOp.run(c.req.valid("param")));

export const employmentsTransfer: EmploymentRouteHandler<"employmentsTransfer"> = async c =>
  c.json(await ops.transferEmploymentOp.run({
    id: c.req.valid("param").id,
    data: c.req.valid("json"),
  }));

export const employmentsSetPrimary: EmploymentRouteHandler<"employmentsSetPrimary"> = async c =>
  c.json(await ops.setPrimaryEmploymentOp.run(c.req.valid("param")));

export const employmentsResignUser: EmploymentRouteHandler<"employmentsResignUser"> = async c =>
  c.json(await ops.resignUserOp.run(c.req.valid("param")));
