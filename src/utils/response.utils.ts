import { ServiceStatusCode } from '../constants/service.status'

export function makeResponse(code: number = 200, data: unknown = null, message: string = 'success'): any {
    return {
        code: code,
        data: data,
        message: message
    }
}

export function success(data: unknown = null) {
    return makeResponse(ServiceStatusCode.Success, data, 'success')
}

