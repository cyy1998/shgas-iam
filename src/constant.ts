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
export const SMS_SIGNATURE_KEY = 'aa8099eb32c945f39157f339d8fd702c'
export const DEFAULT_USER_PASSWORD = '1234'
export const REDIS_EXPIRE_TIME = '3600'
export const PURVEYOR_ORG_PRFFIX = 'GY'
