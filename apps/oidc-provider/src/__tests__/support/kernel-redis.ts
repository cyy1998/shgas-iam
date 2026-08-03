import type { SessionKernelRedis, SessionKernelRedisTransaction } from "@iam/api-core/session/kernel";

type RedisResult = [Error | null, unknown];

export class KernelRedis implements SessionKernelRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly expiresAt = new Map<string, number>();
  now = 1_700_000_000_000;

  constructor(private readonly options: { failDeleteContaining?: string } = {}) {}

  async get(key: string) {
    this.purgeExpired(key);
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: unknown[]) {
    this.values.set(key, value);
    if (args[0] === "EX" && typeof args[1] === "number")
      this.expiresAt.set(key, this.now + args[1] * 1000);
    return "OK";
  }

  async del(...keys: string[]) {
    const failDeleteContaining = this.options.failDeleteContaining;
    if (failDeleteContaining && keys.some(key => key.includes(failDeleteContaining))) {
      throw new Error(`delete failed for ${keys.join(",")}`);
    }
    return await this.deleteWithoutFailure(...keys);
  }

  async pexpireat(key: string, expiresAt: number) {
    if (!this.values.has(key) && !this.zsets.has(key))
      return 0;
    this.expiresAt.set(key, expiresAt);
    return 1;
  }

  async zadd(key: string, score: number, member: string) {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    set.set(member, score);
    this.zsets.set(key, set);
    return 1;
  }

  async zcard(key: string) {
    this.purgeExpired(key);
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrange(key: string, start: number, stop: number) {
    this.purgeExpired(key);
    const sorted = [...(this.zsets.get(key)?.entries() ?? [])]
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
    const normalizedStop = stop < 0 ? sorted.length + stop : stop;
    return sorted.slice(start, normalizedStop + 1);
  }

  async zrevrange(key: string, start: number, stop: number) {
    this.purgeExpired(key);
    const sorted = [...(this.zsets.get(key)?.entries() ?? [])]
      .sort((left, right) => right[1] - left[1] || right[0].localeCompare(left[0]))
      .map(([member]) => member);
    const normalizedStop = stop < 0 ? sorted.length + stop : stop;
    return sorted.slice(start, normalizedStop + 1);
  }

  async zrem(key: string, member: string) {
    return this.zsets.get(key)?.delete(member) ? 1 : 0;
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number) {
    const set = this.zsets.get(key);
    if (!set)
      return 0;
    const lower = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const upper = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
    let removed = 0;
    for (const [member, score] of set) {
      if (score >= lower && score <= upper) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  multi() {
    const operations: Array<() => Promise<unknown> | unknown> = [];
    const transaction: SessionKernelRedisTransaction = {
      set: (key, value) => {
        operations.push(() => this.set(key, value));
        return transaction;
      },
      pexpireat: (key, expiresAt) => {
        operations.push(() => this.pexpireat(key, expiresAt));
        return transaction;
      },
      del: (...keys) => {
        operations.push(() => this.deleteWithoutFailure(...keys));
        return transaction;
      },
      zadd: (key, score, member) => {
        operations.push(() => this.zadd(key, score, member));
        return transaction;
      },
      zrem: (key, member) => {
        operations.push(() => this.zrem(key, member));
        return transaction;
      },
      exec: async () => await Promise.all(operations.map(async (operation): Promise<RedisResult> => {
        try {
          return [null, await operation()];
        }
        catch (error) {
          return [error instanceof Error ? error : new Error(String(error)), null];
        }
      })),
    };
    return transaction;
  }

  private async deleteWithoutFailure(...keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      const didDelete = this.values.delete(key) || this.zsets.delete(key);
      this.expiresAt.delete(key);
      if (didDelete)
        deleted += 1;
    }
    return deleted;
  }

  private purgeExpired(key: string) {
    if ((this.expiresAt.get(key) ?? Number.POSITIVE_INFINITY) > this.now)
      return;
    this.values.delete(key);
    this.zsets.delete(key);
    this.expiresAt.delete(key);
  }
}
