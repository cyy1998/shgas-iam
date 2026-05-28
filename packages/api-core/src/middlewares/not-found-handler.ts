import type { NotFoundHandler } from "hono";
import { ApiErrorCode, ServiceStatusCode } from "@iam/contracts";
import { NOT_FOUND } from "../core/http-status-codes";
import { NOT_FOUND as NOT_FOUND_MESSAGE } from "../core/http-status-phrases";
import * as resp from "../http";

const notFound: NotFoundHandler = (c) => {
  return c.json(
    resp.fail(ApiErrorCode.NotFound, `${NOT_FOUND_MESSAGE} - ${c.req.method}:${c.req.path}`, ServiceStatusCode.NotFound),
    NOT_FOUND,
  );
};

export default notFound;
