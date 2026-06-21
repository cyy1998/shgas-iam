import type { Hook } from "@hono/zod-openapi";
import type { Context } from "hono";

import { ApiErrorCode } from "@iam/contracts";
import * as resp from "../../http";
import { UNPROCESSABLE_ENTITY } from "../http-status-codes";

function getRequestId(c: Context): string | undefined {
  try {
    return c.get("requestId" as never) as string | undefined;
  }
  catch {
    return undefined;
  }
}

const defaultHook: Hook<any, any, any, any> = (result, c) => {
  if (!result.success) {
    return c.json(
      resp.fail(ApiErrorCode.ValidationFailed, "请求参数不合法", {
        requestId: getRequestId(c),
        issues: result.error.issues,
      }),
      UNPROCESSABLE_ENTITY,
    );
  }
};

export default defaultHook;
