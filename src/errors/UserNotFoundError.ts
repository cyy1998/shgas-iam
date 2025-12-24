import { CustomError } from "./CustomError"

export class UserNotFoundError extends CustomError {
    constructor(message: string) {
        super(message, 404)
        this.name = 'UserNotFoundError' // 设置错误名称
    }
}