import type { Context } from 'hono';
import type { HTTPResponseError } from 'hono/types';
import { ServiceStatusCode } from '@enums/service.status';
import { AuthzError } from '@errors/AuthzError';
import { CustomError } from '@errors/CustomError';
import { makeResponse } from '@utils/response.utils';
import { HTTPException } from 'hono/http-exception';

export function errorHandler(err: Error | HTTPResponseError, c: Context) {
  if (err instanceof CustomError) {
    return c.json(makeResponse(err.code, null, err.message));
  }
  else if (err instanceof AuthzError) {
    return c.json(makeResponse(err.code, null, err.message), err.httpCode);
  }
  else if (err instanceof HTTPException) {
    return c.json(makeResponse(err.status, null, err.message), err.status);
  }
  else {
    console.error(err);
    return c.json(makeResponse(ServiceStatusCode.Failure, null, '服务器内部错误'));
  }
}
