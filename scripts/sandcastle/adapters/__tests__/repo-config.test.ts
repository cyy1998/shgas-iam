import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { claudeCode } from "@ai-hero/sandcastle";
import { loadRepoSandcastleConfig } from "../../../../.sandcastle/config.ts";
import { dockerRegistryAuth } from "../../core/auth.ts";
import { checkExecutors } from "../../core/executor.ts";
import { specBranchName } from "../../core/git.ts";
import { loadAgentRoles } from "../codex-roles.ts";

const cwd = fileURLToPath(new URL("../../../..", import.meta.url));

test("assembles the IAM sandbox and native providers with API key and Projects credentials in their intended scopes", async () => {
  const store = await mkdtemp(join(tmpdir(), "sandcastle-store-"));
  try {
    const config = await loadRepoSandcastleConfig({
      cwd,
      env: {
        CODEX_AUTH: "api-key",
        CODEX_API_KEY: "fixture-api-key",
        GH_TOKEN: "fixture-issue-token",
        SANDCASTLE_PROJECT_URL: "https://github.com/users/fixture/projects/1",
        SANDCASTLE_PROJECT_TOKEN: "fixture-project-token-from-dotenv",
        SANDCASTLE_PNPM_STORE_DIR: store,
      },
      projectToken: "fixture-project-token",
      model: "fixture-planner",
      draft: true,
    });
    expect(config.workflow).toMatchObject({ branchPrefix: "sandcastle", draft: true });
    expect(config.workflow.project?.token).toBe("fixture-project-token");
    expect(config.sandbox).toMatchObject({
      dockerfile: ".sandcastle/Dockerfile",
      image: "iam-sandcastle:local",
      dockerAccess: true,
      mounts: [{ hostPath: store, sandboxPath: "/home/agent/.pnpm-store" }],
    });
    expect(config.sandbox.env).toBeUndefined();
    expect(config.sandbox.writable?.env).toEqual({
      IAM_AFK_PNPM_STORE_DIR: "/home/agent/.pnpm-store",
      IAM_E2E_LIFECYCLE: "fresh",
      TURBO_CACHE_DIR: expect.any(String),
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "/tmp/iam-sandcastle-hooks",
    });
    expect(config.authAdapters).toEqual([]);
    const roles = await loadAgentRoles(cwd);
    const bindings = [
      [config.roles.researcher, roles.code_researcher],
      [config.roles.implementers.implementer_light, roles.implementer_light],
      [config.roles.implementers.implementer_standard, roles.implementer_standard],
      [config.roles.implementers.implementer_deep, roles.implementer_deep],
      [config.roles.reviewers.standards, roles.standards_reviewer],
      [config.roles.reviewers.spec, roles.spec_reviewer],
      [config.roles.repairer, roles.implementer_standard],
      [config.roles.repairerDeep, roles.implementer_deep],
    ] as const;
    for (const [binding, role] of bindings) {
      if (!binding) throw new Error(`Missing role ${role.name}`);
      expect(binding.instructions).toBe(role.instructions);
      expect(binding.provider.name).toBe("codex");
      const { command } = binding.provider.buildPrintCommand({ prompt: "Fixture", dangerouslySkipPermissions: true });
      expect(command).toContain(role.model);
      expect(command).toContain(`model_reasoning_effort="${role.effort}"`);
      expect(binding.provider.env).toEqual({ CODEX_API_KEY: "fixture-api-key" });
    }
    expect(config.roles.implementers.implementer_standard?.provider).toBe(config.roles.repairer.provider);
    expect(config.roles.implementers.implementer_deep?.provider).toBe(config.roles.repairerDeep.provider);
    const { branchPrefix, branchDeclarationKeywords } = config.workflow;
    for (const heading of ["集成分支", "功能分支", "复用功能/集成分支"]) {
      expect(specBranchName(40, `${heading}：feat/design`, branchPrefix, branchDeclarationKeywords)).toBe(
        "feat/design",
      );
    }
    expect(
      config.roles.planner.provider.buildInteractiveArgs?.({ prompt: "", dangerouslySkipPermissions: true }),
    ).toContain("fixture-planner");
    expect(config.lifecycle).toMatchObject({
      prepareCommand: expect.stringContaining("scripts/sandcastle/prepare-workspace.sh"),
      hooksCommand: expect.stringContaining("scripts/sandcastle/enable-git-hooks.sh"),
      beforeExecutor: expect.any(Function),
      afterExecutor: expect.any(Function),
    });
    expect(config.promptExtras?.plan).toContain("implementer_deep");
    expect(config.promptExtras?.implement).toContain("Bun");
    expect(config.promptExtras?.implement).toContain("AGENTS.md");
    expect(config.promptExtras?.implement).toContain(".agents/skills/tdd/SKILL.md");
    expect(config.promptExtras?.["repair-and-verify"]).toContain("pnpm verify:container-smoke");
    expect(config.promptExtras?.["repair-and-verify"]).toContain("pnpm verify:e2e-runtime");
    expect(config.promptExtras?.["repair-and-verify"]).toContain("GLOSSARY.md");
  } finally {
    await rm(store, { recursive: true, force: true });
  }
});

test("the default registry domain stages a private copy and rechecks the source at each prepare", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-docker-"));
  const source = join(directory, "source.json");
  const contents = '{"auths":{"docker.xuanyuan.run":{"auth":"fixture-credential"}}}';
  try {
    await writeFile(source, contents);
    const config = await loadRepoSandcastleConfig({
      cwd,
      env: {
        SANDCASTLE_DOCKER_CONFIG_FILE: source,
        SANDCASTLE_DOCKER_REGISTRIES: " ",
        SANDCASTLE_PNPM_STORE_DIR: join(directory, "store"),
      },
    });
    if (!config.sandbox.dockerAuth) throw new Error("Expected a registry adapter");
    const auth = dockerRegistryAuth(config.sandbox.dockerAuth);
    await auth.check(cwd);
    const prepared = await auth.prepare(cwd);
    const mount = prepared.mounts?.[0];
    try {
      if (!mount) throw new Error("Expected a credential mount");
      const copy = await readFile(mount.hostPath, "utf8");
      const mode = (await stat(mount.hostPath)).mode & 0o777;
      expect(mount).toMatchObject({ sandboxPath: "/home/agent/.docker/config.json", readonly: true });
      expect(mount.hostPath).not.toBe(source);
      expect(copy).toBe(contents);
      expect(mode).toBe(0o600);
    } finally {
      await prepared.close();
    }
    const removed = await stat(mount.hostPath).catch((error: unknown) => error);
    const original = await readFile(source, "utf8");
    expect(removed).toMatchObject({ code: "ENOENT" });
    expect(original).toBe(contents);

    await writeFile(source, '{"auths":{"docker.xuanyuan.run.other.example":{"auth":"fixture-private"}}}');
    const error = await auth.prepare(cwd).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain("fixture-private");
    expect(String(error)).not.toContain(source);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("custom registry domains and file-based Codex auth are selected from host configuration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-auth-fixture-"));
  try {
    const source = join(directory, "auth.json");
    await writeFile(source, '{"tokens":"fixture"}');
    const config = await loadRepoSandcastleConfig({
      cwd,
      env: {
        CODEX_AUTH_FILE: source,
        CODEX_API_KEY: "unused-key-in-file-mode",
        SANDCASTLE_DOCKER_CONFIG_FILE: "registry.json",
        SANDCASTLE_DOCKER_REGISTRIES: "one.example, two.example:5000",
        SANDCASTLE_PNPM_STORE_DIR: join(directory, "store"),
      },
    });
    if (!config.sandbox.dockerAuth) throw new Error("Expected a registry adapter");
    const auth = dockerRegistryAuth(config.sandbox.dockerAuth);
    const registrySource = join(directory, "registry.json");
    await writeFile(registrySource, '{"auths":{"two.example:5000":{"registrytoken":"fixture"}}}');
    await auth.check(directory);
    await writeFile(registrySource, '{"auths":{"docker.xuanyuan.run":{"auth":"fixture"}}}');
    const rejected = await auth.check(directory).catch((reason: unknown) => reason);
    expect(rejected).toBeInstanceOf(Error);

    const adapter = config.authAdapters?.[0];
    if (!adapter) throw new Error("Expected a Codex file adapter");
    const provider = config.roles.reviewers.spec.provider;
    expect(adapter.appliesTo(provider)).toBe(true);
    expect(adapter.appliesTo(claudeCode("other-provider"))).toBe(false);
    expect(provider.env).toEqual({});
    await adapter.check({ cwd, provider });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preflight checks the shared Codex login once and rechecks it on the next invocation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-preflight-"));
  const source = join(directory, "auth.json");
  try {
    await writeFile(source, '{"tokens":"fixture"}');
    const config = await loadRepoSandcastleConfig({
      cwd,
      env: { CODEX_AUTH_FILE: source, SANDCASTLE_PNPM_STORE_DIR: join(directory, "store") },
    });
    const adapter = config.authAdapters?.[0];
    if (!adapter) throw new Error("Expected a Codex file adapter");
    let checks = 0;
    const preflightConfig = {
      ...config,
      sandbox: { ...config.sandbox, dockerAccess: false },
      authAdapters: [
        {
          ...adapter,
          async check(context: Parameters<typeof adapter.check>[0]) {
            checks++;
            await adapter.check(context);
          },
        },
      ],
    };
    await checkExecutors(cwd, preflightConfig);
    expect(checks).toBe(1);
    await rm(source);
    const error = await checkExecutors(cwd, preflightConfig).catch((reason: unknown) => reason);
    expect(String(error)).toContain("requires a readable auth.json");
    expect(checks).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
