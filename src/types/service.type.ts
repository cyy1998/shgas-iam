import type { HttpStatusCode } from '@constants/http.status';

export interface ServiceResult {
  code: number;
  httpCode?: HttpStatusCode;
  data: any;
  message: string;
}

export interface SMSServiceResult {
  resultCode: string;
  resultInfo: string;
  result: string;
}
