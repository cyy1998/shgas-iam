import type { HttpStatusCode } from "@constants/http.status"


export type ServiceResult = {
    code: number
    httpCode?: HttpStatusCode
    data: any
    message: string
}

export type SMSServiceResult = {
    resultCode: string
    resultInfo: string
    result: string
}