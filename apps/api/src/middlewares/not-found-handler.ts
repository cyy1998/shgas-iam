import type { NotFoundHandler } from "hono";

import { NOT_FOUND } from "@iam/api-core/core/http-status-codes";

import { NOT_FOUND as NOT_FOUND_MESSAGE } from "@iam/api-core/core/http-status-phrases";
import * as resp from "@iam/api-core/http";
import { ServiceStatusCode } from "@iam/contracts";

const notFound: NotFoundHandler = (c) => {
  return c.json(resp.fail(ServiceStatusCode.NotFound, `${NOT_FOUND_MESSAGE} - ${c.req.method}:${c.req.path}`), NOT_FOUND);
};

export default notFound;
