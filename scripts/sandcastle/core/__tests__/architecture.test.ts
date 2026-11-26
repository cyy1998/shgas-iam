import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRepositoryArchitecture } from "../../../architecture-guard.ts";

test("Sandcastle core imports only its own modules, platform builtins and the SDK", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-boundary-"));
  try {
    await mkdir(join(cwd, "scripts/sandcastle/core/nested"), { recursive: true });
    await mkdir(join(cwd, ".sandcastle"));
    await writeFile(
      join(cwd, ".sandcastle/run.mts"),
      'export { runAfk } from "../scripts/sandcastle/core/index.ts";\n',
    );
    await writeFile(
      join(cwd, "scripts/sandcastle/core/index.ts"),
      'import { readFile } from "node:fs/promises";\nimport { createWorktree } from "@ai-hero/sandcastle";\n' +
        'import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";\nexport const runAfk = {};\n',
    );
    await writeFile(
      join(cwd, "scripts/sandcastle/core/nested/allowed.mts"),
      'export { runAfk } from "../index.ts";\nvoid import("../index.ts");\n',
    );
    expect(analyzeRepositoryArchitecture(cwd)).toEqual([]);

    const file = "scripts/sandcastle/core/nested/blocked.mts";
    const specifiers = [
      "../../../../.sandcastle/run.mts",
      "../../../test-resources/managed-resources.mjs",
      "@iam/contracts",
      "../../legacy.ts",
      "../../../sandcastle/core-other/module.ts",
      "../../../test-resources/managed-resources.mjs",
    ];
    await writeFile(
      join(cwd, file),
      [
        `export { config } from "${specifiers[0]}";`,
        `import "${specifiers[1]}";`,
        `import type { Contract } from "${specifiers[2]}";`,
        `import "${specifiers[3]}";`,
        `import "${specifiers[4]}";`,
        `void import(\`${specifiers[5]}\`);`,
      ].join("\n"),
    );
    const diagnostics = analyzeRepositoryArchitecture(cwd);
    expect(diagnostics.map(({ ruleId, line, file }) => ({ ruleId, line, file }))).toEqual(
      specifiers.map((_, index) => ({ ruleId: "sandcastle-core-dependency-boundary", file, line: index + 1 })),
    );
    for (const [index, specifier] of specifiers.entries()) expect(diagnostics[index]?.message).toContain(specifier);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
