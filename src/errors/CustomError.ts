export class CustomError extends Error {
    public code: number;
    constructor(message: string, code: number) {
        super(message);
        this.name = 'UserNotFoundError'; // 设置错误名称
        this.code = code;
    }
}