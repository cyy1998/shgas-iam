import * as HttpStatusCodes from "../../http-status-codes";
import {
  InternalErrorResponseSchema,
  StandardErrorResponseSchema,
  ValidationFailureResponseSchema,
} from "../schemas/error-response-schema.js";
import jsonContent from "./json-content.js";

export const commonErrorResponses = {
  [HttpStatusCodes.BAD_REQUEST]: jsonContent(
    StandardErrorResponseSchema,
    "请求参数错误",
  ),
  [HttpStatusCodes.UNAUTHORIZED]: jsonContent(
    StandardErrorResponseSchema,
    "未认证",
  ),
  [HttpStatusCodes.FORBIDDEN]: jsonContent(
    StandardErrorResponseSchema,
    "无权限",
  ),
  [HttpStatusCodes.NOT_FOUND]: jsonContent(
    StandardErrorResponseSchema,
    "资源不存在",
  ),
  [HttpStatusCodes.CONFLICT]: jsonContent(
    StandardErrorResponseSchema,
    "资源冲突",
  ),
  [HttpStatusCodes.UNPROCESSABLE_ENTITY]: jsonContent(
    ValidationFailureResponseSchema,
    "请求参数不合法",
  ),
  [HttpStatusCodes.INTERNAL_SERVER_ERROR]: jsonContent(
    InternalErrorResponseSchema,
    "服务器内部错误",
  ),
} as const;
