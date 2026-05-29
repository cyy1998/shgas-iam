import type { UserRouteHandler } from "./user.type";
import * as ops from "./user.ops";

export const usersSearch: UserRouteHandler<"usersSearch"> = async c =>
  c.json(await ops.searchUserOp.run(c.req.valid("json")));

export const usersDetail: UserRouteHandler<"usersDetail"> = async c =>
  c.json(await ops.getUserOp.run(c.req.valid("param")));

export const usersCreate: UserRouteHandler<"usersCreate"> = async c =>
  c.json(await ops.createUserOp.run(c.req.valid("json"), { hono: c }));

export const usersUpdate: UserRouteHandler<"usersUpdate"> = async c =>
  c.json(await ops.updateUserOp.run({
    username: c.req.valid("param").username,
    data: c.req.valid("json"),
  }, { hono: c }));

export const usersStatusUpdate: UserRouteHandler<"usersStatusUpdate"> = async c =>
  c.json(await ops.updateUserStatusOp.run({
    username: c.req.valid("param").username,
    status: c.req.valid("json").status,
  }, { hono: c }));

export const usersDelete: UserRouteHandler<"usersDelete"> = async c =>
  c.json(await ops.deleteUserOp.run(c.req.valid("param"), { hono: c }));

export const usersResetPassword: UserRouteHandler<"usersResetPassword"> = async c =>
  c.json(await ops.resetPasswordOp.run(c.req.valid("param"), { hono: c }));

export const usersGeneratePassword: UserRouteHandler<"usersGeneratePassword"> = async c =>
  c.json(await ops.generatePasswordOp.run(undefined));
