import { HttpStatusCode } from "../constants/http.status";
import { ServiceStatusCode } from "../constants/service.status";

export class AuthzError extends Error {
    public code: number;
    public httpCode: HttpStatusCode;
    constructor(message: string, code: number = ServiceStatusCode.Failure, httpCode: number = HttpStatusCode.ServerError) {
        super(message);
        this.name = 'AuthzError';
        this.code = code;
        this.httpCode = httpCode;
    }
}