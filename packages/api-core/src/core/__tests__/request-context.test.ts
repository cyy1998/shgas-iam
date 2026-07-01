import type { Context } from "hono";
import { describe, expect, test } from "bun:test";
import { getTraceId } from "../request-context";

function createContext(headers: Record<string, string | undefined>): Context {
  return {
    req: {
      header(name: string) {
        return headers[name] ?? headers[name.toLowerCase()];
      },
    },
  } as Context;
}

describe("request context helpers", () => {
  test("parses traceparent as a 32 character trace id", () => {
    expect(getTraceId(createContext({
      "traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
      "x-b3-traceid": "33333333333333333333333333333333",
      "x-trace-id": "44444444444444444444444444444444",
    }))).toBe("11111111111111111111111111111111");
  });
});
