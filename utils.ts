import { createHmac } from 'crypto'

export function hmacSha256(data: string, secret: string): string {
    return createHmac('sha256', secret)
        .update(data)
        .digest('hex'); // 也可以用 'base64'
}

export function makeResponse(code: number = 200, data: any = {}, message: string = 'success'): any {
    return {
        code: code,
        data: data,
        message: message
    }
}

export function getEvenLengthSubstrings(str: string): string[] {
    const result: string[] = [];
    // 从长度 2 开始，每次增加 2（保证是偶数），直到不超过字符串长度
    for (let len = 2; len <= str.length; len += 2) {
        result.push(str.substring(0, len));
    }
    return result;
}