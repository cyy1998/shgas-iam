export enum EmploymentStatus {
    Enable = 1,
    Pause,
    Disable
}

export enum HttpStatusCode {
    Ok = 200,
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    ServerError = 500
}

export enum ServiceStatusCode {
    Success = 200,
    Unauthorized = 401,
    UserNotExisting = 4001,
    WrongPassword = 4002,
    Forbidden = 403,
    Failure = 99999
}

export const PASSWORD_HASH_ROUNDS = 10
export const SMS_SIGNATURE_KEY = process.env.SMS_SIGNATURE_KEY as string
export const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD as string
export const REDIS_EXPIRE_TIME = process.env.REDIS_EXPIRE_TIME as string
export const PURVEYOR_ORG_PRFFIX = process.env.PURVEYOR_ORG_PRFFIX as string
export const RUN_MODE = process.env.RUN_MODE as string
export const ORCAS_URL = process.env.ORCAS_URL as string
export const PORT = process.env.PORT as string
export const IAM_SECRET_KEY = process.env.IAM_SECRET_KEY as string
