import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import {
  captureCommand,
  createBoundedByteCapture,
  createBoundedLineCapture,
  probeOidcDiscovery,
  probeSsoConfiguration,
  runCommand,
} from "./system-boundaries.ts";

describe("system command boundaries", () => {
  test("does not echo child output while preserving command failure", async () => {
    const childCode = [
      "process.stdout.write('SYNTHETIC-CHILD-OUTPUT');",
      "process.stderr.write('SYNTHETIC-CHILD-ERROR');",
      "process.exit(17);",
    ].join("\n");
    const boundaryUrl = new URL("./system-boundaries.ts", import.meta.url).href;
    const runnerCode = [
      `import { runCommand } from ${JSON.stringify(boundaryUrl)};`,
      `try { await runCommand(process.execPath, ["-e", ${JSON.stringify(childCode)}], { cwd: process.cwd() }); }`,
      "catch (error) { console.error(error instanceof Error ? error.message : String(error)); }",
    ].join("\n");

    const result = await captureCommand(
      process.execPath,
      ["-e", runnerCode],
      { capture: { maxBytes: 4_096, mode: "tail" }, cwd: process.cwd() },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain("SYNTHETIC-CHILD-OUTPUT");
    expect(output).not.toContain("SYNTHETIC-CHILD-ERROR");
    expect(output).toContain("exited with code 17");
  });

  test("accepts only the complete six-field OIDC discovery contract", async () => {
    const origin = "http://127.0.0.1:43124";
    const expected = {
      authorization_endpoint: `${origin}/oidc/auth`,
      end_session_endpoint: `${origin}/oidc/session/end`,
      issuer: `${origin}/oidc`,
      jwks_uri: `${origin}/oidc/jwks`,
      token_endpoint: `${origin}/oidc/token`,
      userinfo_endpoint: `${origin}/oidc/me`,
    };
    await expect(probeOidcDiscovery(origin, undefined, {
      maxAttempts: 1,
      request: async () => Response.json(expected),
    })).resolves.toBeUndefined();
    await expect(probeOidcDiscovery(origin, undefined, {
      maxAttempts: 1,
      request: async () => Response.json({
        ...expected,
        userinfo_endpoint: undefined,
      }),
    })).rejects.toThrow("OIDC discovery metadata was not ready");
  });

  test("accepts only Custom SSO configuration endpoints on the canonical origin", async () => {
    const origin = "http://127.0.0.1:43124";
    const requests: string[] = [];
    const expected = {
      code: 200,
      data: {
        authorizationEndpoint: `${origin}/sso/authorize`,
        logoutEndpoint: `${origin}/sso/logout`,
        thirdPartyOAEndpoint: `${origin}/sso/thirdparty/oa`,
      },
      message: "success",
    };
    await expect(probeSsoConfiguration(origin, undefined, {
      maxAttempts: 1,
      request: async (_url, init) => {
        requests.push(new Headers(init?.headers).get("X-IAM-Entry-Network") ?? "");
        return Response.json(expected);
      },
    })).resolves.toBeUndefined();
    expect(requests).toEqual(["internal", "external"]);
    await expect(probeSsoConfiguration(origin, undefined, {
      maxAttempts: 1,
      request: async () => Response.json({
        ...expected,
        data: { ...expected.data, logoutEndpoint: "http://wrong.test/sso/logout" },
      }),
    })).rejects.toThrow("Custom SSO configuration was not ready");
  });

  test("bounds prefix, tail, and complete-line captures", () => {
    const prefix = createBoundedByteCapture("prefix", 16);
    prefix.append(Buffer.from("prefix-marker-and-more"));
    const tail = createBoundedByteCapture("tail", 16);
    tail.append(Buffer.from("old-and-latest-marker"));
    const lines = createBoundedLineCapture(27);
    lines.append(Buffer.from(`middle\n${"x".repeat(60)}\nlatest\n`));

    expect(prefix.toString()).toStartWith("prefix-marker");
    expect(tail.toString()).toEndWith("latest-marker");
    expect(lines.toString()).toContain("[TRUNCATED]\nlatest\n");
  });

  test("returns a normal abort error after one best-effort termination attempt", async () => {
    const runners = [
      async (signal: AbortSignal) => runCommand(
        process.execPath,
        ["-e", "setInterval(() => undefined, 1_000)"],
        { cwd: process.cwd(), signal },
      ),
      async (signal: AbortSignal) => captureCommand(
        process.execPath,
        ["-e", "setInterval(() => undefined, 1_000)"],
        { cwd: process.cwd(), signal },
      ),
    ];
    for (const run of runners) {
      const controller = new AbortController();
      const result = run(controller.signal);
      controller.abort(new Error("synthetic command deadline"));
      await expect(result).rejects.toThrow("command was aborted");
    }
  }, 10_000);
});
