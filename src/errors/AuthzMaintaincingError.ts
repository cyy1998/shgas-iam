import { HttpStatusCode } from '@constants/http.status';
import { ServiceStatusCode } from '@constants/service.status';
import { AuthzError } from './AuthzError';

export class AuthzMaintaincingError extends AuthzError {
  constructor(message: string) {
    super(message);
    this.name = 'AuthzMaintaincingError';
    this.code = ServiceStatusCode.Maintancing;
    this.httpCode = HttpStatusCode.Forbidden;
  }
}
