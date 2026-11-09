import { ApiErrorCode } from "@iam/contracts";
import { HttpStatusPhrases, NOT_FOUND } from "@iam/contracts/http";
import type { NotFoundHandler } from "hono";
import * as resp from "../http/response";

const notFound: NotFoundHandler = (c) => {
  return c.json(
    resp.fail(ApiErrorCode.NotFound, `${HttpStatusPhrases.NOT_FOUND} - ${c.req.method}:${c.req.path}`),
    NOT_FOUND,
  );
};

export default notFound;
