import type { NotFoundHandler } from "hono";

import { ServiceStatusCode } from "@iam/shared";

import { NOT_FOUND } from "@/lib/core/http-status-codes";
import { NOT_FOUND as NOT_FOUND_MESSAGE } from "@/lib/core/http-status-phrases";
import * as resp from "@/utils/http/response";

const notFound: NotFoundHandler = (c) => {
  return c.json(resp.fail(ServiceStatusCode.Failure, `${NOT_FOUND_MESSAGE} - ${c.req.method}:${c.req.path}`), NOT_FOUND);
};

export default notFound;
