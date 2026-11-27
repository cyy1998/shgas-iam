import { describe, expect, test } from "bun:test";
import {
  buildE2EImages,
  defaultE2EBuildConcurrency,
  ensureLocalE2EImages,
  parseE2EBuildConcurrency,
} from "../e2e-build.ts";

describe("e2e-build", () => {
  test("parses default and valid build concurrency and rejects invalid values", () => {
    expect(parseE2EBuildConcurrency(undefined)).toBe(defaultE2EBuildConcurrency);
    expect(parseE2EBuildConcurrency("")).toBe(defaultE2EBuildConcurrency);
    expect(parseE2EBuildConcurrency("1")).toBe(1);
    expect(parseE2EBuildConcurrency("4")).toBe(4);
    expect(() => parseE2EBuildConcurrency("0")).toThrow(/1 to 4/u);
    expect(() => parseE2EBuildConcurrency("5")).toThrow(/1 to 4/u);
    expect(() => parseE2EBuildConcurrency("2.5")).toThrow(/1 to 4/u);
    expect(() => parseE2EBuildConcurrency("abc")).toThrow(/1 to 4/u);
  });

  test("caps in-flight builds to the requested concurrency and reports outcomes in scheduled order", async () => {
    let active = 0;
    let peak = 0;
    const outcomes = await buildE2EImages({
      services: ["worker", "auth-api", "e2e-stubs", "apisix"],
      concurrency: 2,
      signal: new AbortController().signal,
      async buildOne(service) {
        active++;
        peak = Math.max(peak, active);
        await Bun.sleep(service === "e2e-stubs" ? 30 : 10);
        active--;
        return { logPath: `logs/build-${service}.log` };
      },
    });
    expect(peak).toBe(2);
    expect(outcomes.map((item) => item.service)).toEqual(["worker", "auth-api", "e2e-stubs", "apisix"]);
    expect(outcomes.every((item) => item.logPath === `logs/build-${item.service}.log`)).toBe(true);
  });

  test("cancels in-flight sibling builds and stops scheduling remaining services on first failure", async () => {
    const started: string[] = [];
    let siblingAborted = false;
    let failure: unknown;
    try {
      await buildE2EImages({
        services: ["apisix", "e2e-stubs", "auth-api", "worker"],
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
    expect(started).toEqual(["apisix", "e2e-stubs"]);
  });

  test("verifies prebuilt local tags for --skip-build and lists missing tags clearly", async () => {
    await ensureLocalE2EImages(["apisix", "e2e-stubs"], {
      cwd: process.cwd(),
      inspect: async () => true,
    });

    let failure: unknown;
    try {
      await ensureLocalE2EImages(["apisix", "e2e-stubs", "auth-api"], {
        cwd: process.cwd(),
        inspect: async (tag) => tag === "iam-e2e-apisix:local",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("iam-e2e-e2e-stubs:local, iam-e2e-auth-api:local");
  });
});
