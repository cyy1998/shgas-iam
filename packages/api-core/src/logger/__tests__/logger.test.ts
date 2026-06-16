import { describe, expect, test } from "bun:test";
import {
  buildLoggerOptions,
  buildLoggerTransportTargets,
  createLogger,
  IAM_LOG_REDACT_PATHS,
  LoggerSourceApp,
  mergeRedactPaths,
  resolveLogFormat,
} from "../index";

describe("shared logger policy", () => {
  test("resolves LOG_FORMAT auto from NODE_ENV and honors explicit overrides", () => {
    expect(resolveLogFormat("auto", "development")).toBe("pretty");
    expect(resolveLogFormat("auto", "test")).toBe("json");
    expect(resolveLogFormat("auto", "production")).toBe("json");
    expect(resolveLogFormat("json", "development")).toBe("json");
    expect(resolveLogFormat("pretty", "production")).toBe("pretty");
  });

  test("uses default stdout for JSON mode and pino-pretty for pretty mode", () => {
    expect(buildLoggerTransportTargets({
      nodeEnv: "production",
      logLevel: "info",
      logFormat: "json",
    })).toBeUndefined();
    expect(buildLoggerTransportTargets({
      nodeEnv: "development",
      logLevel: "debug",
      logFormat: "auto",
    })).toEqual([{ target: "pino-pretty", level: "debug", options: {} }]);
  });

  test("merges baseline and extra redact paths with de-duplication", () => {
    const paths = mergeRedactPaths(["*.accessToken", "custom.secret", "custom.secret"]);

    expect(paths).toContain("*.password");
    expect(paths).toContain("custom.secret");
    expect(paths.filter(path => path === "*.accessToken")).toHaveLength(1);
    expect(paths.filter(path => path === "custom.secret")).toHaveLength(1);

    const options = buildLoggerOptions({
      nodeEnv: "test",
      extraRedactPaths: ["custom.secret"],
    });
    expect((options.redact as { paths: string[] }).paths).toEqual([
      ...IAM_LOG_REDACT_PATHS,
      "custom.secret",
    ]);
  });

  test("creates independent logger instances with separate bindings and levels", () => {
    const apiLogger = createLogger({
      nodeEnv: "test",
      logLevel: "debug",
      logFormat: "json",
      sourceApp: LoggerSourceApp.Api,
      extraRedactPaths: ["api.secret"],
    });
    const oidcLogger = createLogger({
      nodeEnv: "test",
      logLevel: "error",
      logFormat: "json",
      sourceApp: LoggerSourceApp.OidcProvider,
      extraRedactPaths: ["oidc.secret"],
    });

    expect(apiLogger.bindings().sourceApp).toBe(LoggerSourceApp.Api);
    expect(oidcLogger.bindings().sourceApp).toBe(LoggerSourceApp.OidcProvider);
    expect(apiLogger.level).toBe("debug");
    expect(oidcLogger.level).toBe("error");
    expect(apiLogger).not.toBe(oidcLogger);
  });
});
