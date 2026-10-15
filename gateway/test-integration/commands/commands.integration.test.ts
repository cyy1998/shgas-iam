import { afterEach, describe, expect, it } from "bun:test";
import { createReporter, sourceRoute, sourceUpstream } from "../../src/__tests__/test-helpers";
import { runValidate } from "../../src/commands";
import { createManifestFile, registerManifestFixtureCleanup } from "../manifest/fixture";

const originalManifestEnv = process.env.APISIX_MANIFEST_ENV;

afterEach(() => {
  if (originalManifestEnv === undefined) {
    delete process.env.APISIX_MANIFEST_ENV;
  } else {
    process.env.APISIX_MANIFEST_ENV = originalManifestEnv;
  }
});

registerManifestFixtureCleanup();

describe("apisix sync commands", () => {
  it("uses APISIX_MANIFEST_ENV fallback", async () => {
    process.env.APISIX_MANIFEST_ENV = "test:iam";
    const manifest = await createManifestFile({
      upstreams: [sourceUpstream()],
      routes: [
        sourceRoute({
          plugins: {
            "request-id": {
              header_name: "X-Request-Id",
              include_in_response: true,
            },
            opentelemetry: {
              sampler: {
                name: "always_on",
              },
            },
          },
        }),
      ],
    });
    const { reporter, logs } = createReporter();

    await runValidate({ manifest }, { reporter });

    expect(logs.at(0)).toBe("APISIX manifest validation passed for env=test:iam");
  });
});
