import type { ClockPort, RedisPort } from "@api/composition/runtime";
import Cap from "@cap.js/server";

type ChallengeData = {
  challenge: {
    c: number;
    s: number;
    d: number;
  };
  expires: number;
};

export interface CreateCapClientDeps {
  redis: Pick<RedisPort, "get" | "set" | "del">;
  clock: Pick<ClockPort, "now">;
}

const challengeKey = (token: string) => `cap:challenge:${token}`;
const tokenKey = (key: string) => `cap:token:${key}`;

function ttlSeconds(expires: number, now: number) {
  return Math.max(1, Math.ceil((expires - now) / 1000));
}

function parseChallenge(value: string | null, now: number): ChallengeData | null {
  if (value === null) {
    return null;
  }
  const data = JSON.parse(value) as ChallengeData;
  if (data.expires <= now) {
    return null;
  }
  return data;
}

export function createCapClient(deps: CreateCapClientDeps) {
  return new Cap({
    storage: {
      challenges: {
        async store(token, challengeData) {
          await deps.redis.set(
            challengeKey(token),
            JSON.stringify(challengeData),
            "EX",
            ttlSeconds(challengeData.expires, deps.clock.now()),
          );
        },
        async read(token) {
          return parseChallenge(await deps.redis.get(challengeKey(token)), deps.clock.now());
        },
        async delete(token) {
          await deps.redis.del(challengeKey(token));
        },
        async deleteExpired() {
          // Redis TTL removes expired challenges.
        },
      },
      tokens: {
        async store(key, expires) {
          await deps.redis.set(tokenKey(key), String(expires), "EX", ttlSeconds(expires, deps.clock.now()));
        },
        async get(key) {
          const expires = Number(await deps.redis.get(tokenKey(key)));
          return Number.isFinite(expires) && expires > deps.clock.now() ? expires : null;
        },
        async delete(key) {
          await deps.redis.del(tokenKey(key));
        },
        async deleteExpired() {
          // Redis TTL removes expired tokens.
        },
      },
    },
  });
}

export type CapClient = ReturnType<typeof createCapClient>;
