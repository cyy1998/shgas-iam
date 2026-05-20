import redis from "@api/lib/clients/redis";
import Cap from "@cap.js/server";
import { createSingleton } from "@iam/api-core/core/singleton";

type ChallengeData = {
  challenge: {
    c: number;
    s: number;
    d: number;
  };
  expires: number;
};

const challengeKey = (token: string) => `cap:challenge:${token}`;
const tokenKey = (key: string) => `cap:token:${key}`;

function ttlSeconds(expires: number) {
  return Math.max(1, Math.ceil((expires - Date.now()) / 1000));
}

function parseChallenge(value: string | null): ChallengeData | null {
  if (value === null) {
    return null;
  }
  const data = JSON.parse(value) as ChallengeData;
  if (data.expires <= Date.now()) {
    return null;
  }
  return data;
}

const capClient = createSingleton("api:human-verification:cap", () =>
  new Cap({
    storage: {
      challenges: {
        async store(token, challengeData) {
          await redis.set(
            challengeKey(token),
            JSON.stringify(challengeData),
            "EX",
            ttlSeconds(challengeData.expires),
          );
        },
        async read(token) {
          return parseChallenge(await redis.get(challengeKey(token)));
        },
        async delete(token) {
          await redis.del(challengeKey(token));
        },
        async deleteExpired() {
          // Redis TTL removes expired challenges.
        },
      },
      tokens: {
        async store(key, expires) {
          await redis.set(tokenKey(key), String(expires), "EX", ttlSeconds(expires));
        },
        async get(key) {
          const expires = Number(await redis.get(tokenKey(key)));
          return Number.isFinite(expires) && expires > Date.now() ? expires : null;
        },
        async delete(key) {
          await redis.del(tokenKey(key));
        },
        async deleteExpired() {
          // Redis TTL removes expired tokens.
        },
      },
    },
  }));

export default capClient;
