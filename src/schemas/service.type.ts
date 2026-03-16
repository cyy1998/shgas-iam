import type { HttpStatusCode } from "@enums/http.status";

export type ServiceResult = {
  code: number;
  httpCode?: HttpStatusCode;
  data: any;
  message: string;
};

export type SMSServiceResult = {
  resultCode: string;
  resultInfo: string;
  result: string;
};
