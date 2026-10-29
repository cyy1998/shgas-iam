import { expect, test } from "bun:test";
import { parseSessionClearArgs } from "../arguments";

const stopped = ["--writers-stopped", "--drained"];
const scope = [
  "--layout",
  "unified",
  "--kernel-namespace",
  "maintenance:kernel",
  "--custom-namespace",
  "maintenance:custom",
  "--oidc-namespace",
  "maintenance:oidc",
  ...stopped,
];

test("session cleanup accepts explicit stopped and drained scopes without changing namespace bytes", () => {
  const input = parseSessionClearArgs([
    "apply",
    "--layout",
    "unified",
    "--owner",
    "custom-sso",
    "--custom-namespace",
    "maintenance:custom:",
    ...stopped,
  ]);
  expect(input).toMatchObject({ mode: "apply", owner: "custom-sso", customNamespace: "maintenance:custom:" });
});

test.each([
  ["incomplete scope", ["--layout", "unified"]],
  ["unsupported layout", ["--layout", "source", "--kernel-namespace", "maintenance", ...stopped]],
  ["retired Client filter", [...scope, "--client-code", "alpha"]],
  ["retired artifact filter", [...scope, "--artifacts", "authorization"]],
  ["duplicate owner", [...scope, "--owner", "all", "--owner", "kernel"]],
  ["wildcard namespace", ["--layout", "unified", "--owner", "kernel", "--kernel-namespace", "*", ...stopped]],
  ["excessive deadline", [...scope, "--deadline-ms", "300001"]],
  ["unexpected positional mode", [...scope, "apply"]],
] as const)("session cleanup rejects %s", (_name, args) => {
  expect(() => parseSessionClearArgs(["apply", ...args])).toThrow();
});
