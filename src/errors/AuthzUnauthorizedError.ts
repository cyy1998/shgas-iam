import { HttpStatusCode } from "../constants/http.status"
import { ServiceStatusCode } from "../constants/service.status"
import { AuthzError } from "./AuthzError"

export class AuthzUnauthorizedError extends AuthzError {
    constructor(message: string) {
        super(message)
        this.name = 'AuthzError'
        this.code = ServiceStatusCode.Unauthorized
        this.httpCode = HttpStatusCode.Unauthorized
    }
}