import { createHmac } from "crypto";


export function hmacSha256(data: string, secret: string): string {
    return createHmac('sha256', secret)
        .update(data)
        .digest('hex'); // 也可以用 'base64'
}
