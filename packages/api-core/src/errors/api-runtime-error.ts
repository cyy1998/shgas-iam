import { CustomError } from "./CustomError";

export interface ApiRuntimeError extends Error {
  code: string;
  httpStatus: number;
}

function hasApiRuntimeErrorShape(err: Error): err is ApiRuntimeError {
  return typeof err.name === "string"
    && err.name.length > 0
    && typeof err.message === "string"
    && typeof (err as Partial<ApiRuntimeError>).code === "string"
    && Number.isInteger((err as Partial<ApiRuntimeError>).httpStatus)
    && ((err as Partial<ApiRuntimeError>).httpStatus ?? 0) >= 400
    && ((err as Partial<ApiRuntimeError>).httpStatus ?? 0) <= 599;
}

export function isApiRuntimeError(err: unknown): err is ApiRuntimeError {
  return err instanceof CustomError
    || (err instanceof Error && hasApiRuntimeErrorShape(err));
}
