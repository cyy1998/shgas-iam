import type { NotFoundHandler } from "hono";

import { NOT_FOUND } from "@api/lib/core/http-status-codes";

import { NOT_FOUND as NOT_FOUND_MESSAGE } from "@api/lib/core/http-status-phrases";
import * as resp from "@api/utils/http/response";
import { ServiceStatusCode } from "@iam/shared";

const notFound: NotFoundHandler = (c) => {
  return c.json(resp.fail(ServiceStatusCode.NotFound, `${NOT_FOUND_MESSAGE} - ${c.req.method}:${c.req.path}`), NOT_FOUND);
};

export default notFound;
