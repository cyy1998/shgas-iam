import { BAD_REQUEST, FORBIDDEN, INTERNAL_SERVER_ERROR, OK, UNAUTHORIZED } from "./status-codes";

export enum HttpStatusCode {
  Ok = OK,
  BadRequest = BAD_REQUEST,
  Unauthorized = UNAUTHORIZED,
  Forbidden = FORBIDDEN,
  ServerError = INTERNAL_SERVER_ERROR,
}
