import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const retryAfterVariable
  = "IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS";

const documentedSurfaces: string[] = [
  "apps/api/.env.example",
  "README.md",
  "docker/.env.dev.example",
  "docker/.env.prod.example",
  "docker/docker-compose-dev.yml",
  "docker/docker-compose-prod.yml",
];

describe("Custom SSO environment closure", () => {
  test.each(documentedSurfaces)(
    "documents and propagates Projection Retry-After in %s",
    async (relativePath) => {
      const contents = await readFile(
        resolve(repositoryRoot, relativePath),
        "utf8",
      );

      expect(contents).toContain(retryAfterVariable);
    },
  );
});
