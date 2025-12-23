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

export function getTimestampDifference(targetTimestamp: number): number {
    const currentTimestamp = Date.now()
    return Math.abs(Math.floor((currentTimestamp - targetTimestamp) / 1000))
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function mergeAndDedupe<T extends Record<string, any>>(
    arr1: T[],
    arr2: T[],
    key: keyof T
): T[] {
    const seen = new Set<T[keyof T]>();
    const result: T[] = [];

    for (const item of [...arr1, ...arr2]) {
        const keyValue = item[key];
        if (!seen.has(keyValue)) {
            seen.add(keyValue);
            result.push(item);
        }
    }

    return result;
}

export function mergeAndDedupeOverride<T extends Record<string, any>>(
    arr1: T[],
    arr2: T[],
    key: keyof T
): T[] {
    const map = new Map<T[keyof T], T>();

    // 先放 arr1
    for (const item of arr1) {
        map.set(item[key], item);
    }

    // 再放 arr2（会覆盖重复 key）
    for (const item of arr2) {
        map.set(item[key], item);
    }

    return Array.from(map.values());
}