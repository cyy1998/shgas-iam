import { describe, expect, test } from "bun:test";
import {
  buildContainerSmokeImages,
  defaultContainerSmokeBuildConcurrency,
  orderContainerSmokeBuildServices,
  parseContainerSmokeBuildConcurrency,
} from "../container-smoke-build.ts";

describe("container-smoke-build", () => {
  test("parses default and valid build concurrency and rejects invalid values", () => {
    expect(parseContainerSmokeBuildConcurrency(undefined)).toBe(defaultContainerSmokeBuildConcurrency);
    expect(parseContainerSmokeBuildConcurrency("")).toBe(defaultContainerSmokeBuildConcurrency);
    expect(parseContainerSmokeBuildConcurrency("1")).toBe(1);
    expect(parseContainerSmokeBuildConcurrency("4")).toBe(4);
    expect(() => parseContainerSmokeBuildConcurrency("0")).toThrow(/1 to 4/u);
    expect(() => parseContainerSmokeBuildConcurrency("5")).toThrow(/1 to 4/u);
    expect(() => parseContainerSmokeBuildConcurrency("2.5")).toThrow(/1 to 4/u);
    expect(() => parseContainerSmokeBuildConcurrency("abc")).toThrow(/1 to 4/u);
  });

  test("orders known images for staggered scheduling while preserving unknown services", () => {
    expect(
      orderContainerSmokeBuildServices([
        "gateway-api",
        "integration-api",
        "sso-api",
        "sso",
        "custom",
        "apisix",
        "worker",
        "auth-api",
        "admin",
        "admin-api",
      ]),
    ).toEqual([
      "apisix",
      "admin",
      "auth-api",
      "sso",
      "sso-api",
      "integration-api",
      "admin-api",
      "worker",
      "gateway-api",
      "custom",
    ]);
  });

  test("caps in-flight builds to the requested concurrency and reports outcomes in scheduled order", async () => {
    let active = 0;
    let peak = 0;
    const outcomes = await buildContainerSmokeImages({
      services: ["worker", "auth-api", "admin", "apisix"],
      concurrency: 2,
      signal: new AbortController().signal,
      async buildOne(service) {
        active++;
        peak = Math.max(peak, active);
        await Bun.sleep(service === "admin" ? 30 : 10);
        active--;
        return { logPath: `logs/build-${service}.log` };
      },
    });
    expect(peak).toBe(2);
    expect(outcomes.map((item) => item.service)).toEqual(["apisix", "admin", "auth-api", "worker"]);
    expect(outcomes.every((item) => item.logPath === `logs/build-${item.service}.log`)).toBe(true);
  });

  test("cancels in-flight sibling builds and stops scheduling remaining services on first failure", async () => {
    const started: string[] = [];
    let siblingAborted = false;
    let failure: unknown;
    try {
      await buildContainerSmokeImages({
        services: ["apisix", "admin", "auth-api", "worker"],
        concurrency: 2,
        signal: new AbortController().signal,
        async buildOne(service, signal) {
          started.push(service);
          if (service === "apisix") {
            await Bun.sleep(10);
            throw new Error("apisix build boom");
          }
          await new Promise<void>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                siblingAborted = true;
                reject(signal.reason);
              },
              { once: true },
            );
          });
          return { logPath: `logs/build-${service}.log` };
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("apisix build boom");
    expect(siblingAborted).toBe(true);
    expect(started).toEqual(["apisix", "admin"]);
  });
});
