import { expect, test } from "bun:test";
import { collectFailureLogs } from "../failure-report/failure-logs.ts";

test("keeps in-window warnings and server errors, suppresses health noise, and caps distinct entries", async () => {
  const start = Date.parse("2026-06-01T10:00:10Z");
  const end = Date.parse("2026-06-01T10:00:20Z");
  const pino = (time: number, level: number, msg: string, fields = {}) =>
    JSON.stringify({ time, level, msg, ...fields });
  const lines = [
    pino(start - 1, 50, "before window"),
    pino(start, 40, "repeated warning"),
    pino(start + 1, 30, "ordinary request", { status: 200 }),
    pino(start + 2, 50, "health check failed", { path: "/health/ready", status: 503 }),
    pino(start + 3, 30, "upstream failed", { statusCode: 502 }),
    pino(start + 4, 50, "repeated warning"),
    ...Array.from({ length: 205 }, (_, index) => pino(start + 5, 50, `distinct ${index}`)),
    pino(end, 40, "repeated warning"),
    pino(end + 1, 50, "after window"),
  ];

  const result = await collectFailureLogs(lines, [{ start, end }], []);
  expect(result[0]).toMatchObject({
    entries: [
      { text: "repeated warning", count: 3 },
      { text: "upstream failed 502", count: 1 },
      ...Array.from({ length: 198 }, (_, index) => ({ text: `distinct ${index}`, count: 1 })),
    ],
    omitted: 7,
  });
});

test("recognizes APISIX timestamped access and error logs within each individual window", async () => {
  const start = Date.parse("2026-06-01T10:00:10Z");
  const lines = [
    '2026-06-01T10:00:10.057123Z 127.0.0.1 [01/Jun/2026:10:00:10 +0000] internal.iam.localhost "GET /health" 502 0.001 "-"',
    '2026-06-01T10:00:10.058123Z 127.0.0.1 [01/Jun/2026:10:00:10 +0000] internal.iam.localhost "GET /api/items" 502 0.001 "req-one"',
    "2026-06-01T10:00:12.011123Z 2026/06/01 10:00:12 [warn] 14#14: *11 upstream connection timeout",
    "2026-06-01T10:00:13.011123Z [notice] service exited",
    '2026/06/01 10:00:20 [error] 14#14: *12 cannot connect, request: "GET /items?value=synthetic-query HTTP/1.1"',
    "2026/06/01 10:00:21 [error] 14#14: after the window",
  ];
  const result = await collectFailureLogs(
    lines,
    [
      { start, end: start + 60 },
      { start: start + 2000, end: start + 10000 },
    ],
    [],
  );
  expect(result[0]?.entries).toEqual([{ text: "GET /api/items 502 requestId=req-one", count: 1 }]);
  expect(result[1]?.entries).toEqual([
    { text: "upstream connection timeout", count: 1 },
    { text: 'cannot connect, request: "GET /items HTTP/1.1"', count: 1 },
  ]);
});
