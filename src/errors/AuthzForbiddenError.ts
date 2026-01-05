import { HttpStatusCode } from "../constants/http.status"
import { ServiceStatusCode } from "../constants/service.status"
import { AuthzError } from "./AuthzError"

export class AuthzForbiddenError extends AuthzError {
    constructor(message: string) {
        super(message)
        this.name = 'AuthzForbiddenError'
        this.code = ServiceStatusCode.Forbidden
        this.httpCode = HttpStatusCode.Forbidden
    }
}