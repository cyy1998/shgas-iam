import { CustomError } from "./CustomError";

export class UserNotFoundError extends CustomError {
    constructor() {
        super('不存在该用户', 404);
        this.name = 'UserNotFoundError'; // 设置错误名称
    }
}