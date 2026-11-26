import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { codex } from "@ai-hero/sandcastle";
import { codexFileAuth } from "../scripts/sandcastle/adapters/codex-auth.ts";
import { type AgentRole, implementerNames, loadAgentRoles } from "../scripts/sandcastle/adapters/codex-roles.ts";
import { createTestResourceLifecycle } from "../scripts/sandcastle/adapters/test-resources.ts";
import { defineSandcastleConfig, type Role, type SandcastleConfig } from "../scripts/sandcastle/core/config.ts";

const sandboxHome = "/home/agent";
const sandboxStore = `${sandboxHome}/.pnpm-store`;
const repositoryDocs =
  "按 AGENTS.md 路由阅读命中的工程文档、docs/agents/workflow.md 与 docs/agents/sandcastle-afk.md。";
const validation = `
Bun 的真实 I/O 先普通 await，再对结果或已捕获的 rejection 做同步断言。真实资源测试从根 pnpm test:integration 或 pnpm test:e2e 进入，每条命令独立管理资源。
运行完整受影响范围的行为测试、typecheck、适用文档检查和 git diff --check。保留提交 Hook，核对 Hook 修复并重跑失效检查。`;

const promptExtras = {
  plan: `${repositoryDocs}
结合 GLOSSARY.md 理解业务术语。范围明确且风险低时选 implementer_light，常规切片选 implementer_standard。安全或授权边界、事务和并发一致性、跨 runtime 生命周期、复杂重构或难解失败选 implementer_deep。`,
  explore: `${repositoryDocs}\n按需要核对 GLOSSARY.md 和相关 ADR，记录各票可复用的模块位置、公开验证入口及未决问题。`,
  implement: `${repositoryDocs}${validation}`,
  "resolve-conflict": `${repositoryDocs}${validation}`,
  "review-standards": `${repositoryDocs}\n依据仓库工程文档与 code-review skill 的 Standards 轴检查适用约定。`,
  "review-spec": `${repositoryDocs}\n按父 Spec、全部相关 tickets 的实际验收条款及 GLOSSARY.md 核对固定候选。`,
  "repair-and-verify": `${repositoryDocs}${validation}
按 docs/agents/sandcastle-afk.md 的最终验证要求选择基础门禁，并在修复提交后以固定评审基线运行 pnpm verify:container-smoke --base <sha> 和 pnpm verify:e2e-runtime --base <sha>。按 Spec 与风险补齐 Integration、E2E 和其他必要检查。
按 .agents/skills/pr/SKILL.md 和 GLOSSARY.md 起草 PR 正文。`,
} satisfies NonNullable<SandcastleConfig["promptExtras"]>;

type RepoConfigOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  model?: string;
  draft?: boolean;
  /** Host credential captured before loading the checkout's .env file. */
  projectToken?: string;
};

export async function loadRepoSandcastleConfig({
  cwd,
  env = process.env,
  model,
  draft,
  projectToken,
}: RepoConfigOptions) {
  const definitions = await loadAgentRoles(cwd);
  const authMode = env.CODEX_AUTH?.trim().toLowerCase() || "chatgpt";
  const apiKey = env.CODEX_API_KEY?.trim();
  if (authMode !== "chatgpt" && authMode !== "api-key") {
    throw new Error("CODEX_AUTH 仅接受 chatgpt 或 api-key。");
  }
  if (authMode === "api-key" && !apiKey) throw new Error("CODEX_AUTH=api-key 时需要 CODEX_API_KEY。");

  const codexHome = resolve(cwd, env.CODEX_HOME?.trim() || join(homedir(), ".codex"));
  const nativeCodex = (roleModel: string, effort: AgentRole["effort"]) =>
    codex(roleModel, {
      effort,
      env: authMode === "api-key" && apiKey ? { CODEX_API_KEY: apiKey } : {},
      sessionStorage: { hostSessionsDir: join(codexHome, "sessions") },
    });
  const bindRole = ({ model: roleModel, effort, instructions, description }: AgentRole): Role => ({
    provider: nativeCodex(roleModel, effort),
    description,
    instructions,
  });
  const roles = {
    planner: { provider: nativeCodex(model ?? (env.SANDCASTLE_MODEL?.trim() || "gpt-6-astra"), "high") },
    researcher: bindRole(definitions.code_researcher),
    implementers: Object.fromEntries(implementerNames.map((name) => [name, bindRole(definitions[name])])),
    reviewers: { standards: bindRole(definitions.standards_reviewer), spec: bindRole(definitions.spec_reviewer) },
    repairer: bindRole(definitions.implementer_standard),
    repairerDeep: bindRole(definitions.implementer_deep),
  };
  const providers = [
    roles.planner,
    roles.researcher,
    ...Object.values(roles.implementers),
    roles.reviewers.standards,
    roles.reviewers.spec,
    roles.repairer,
    roles.repairerDeep,
  ].map(({ provider }) => provider);
  const projectUrl = env.SANDCASTLE_PROJECT_URL?.trim();
  const ghToken = env.GH_TOKEN?.trim();
  const dockerConfigSource = env.SANDCASTLE_DOCKER_CONFIG_FILE?.trim();
  const registries = (env.SANDCASTLE_DOCKER_REGISTRIES?.trim() || "docker.xuanyuan.run")
    .split(",")
    .map((name) => name.trim());
  const hostStore = resolve(cwd, env.SANDCASTLE_PNPM_STORE_DIR?.trim() || join(homedir(), ".pnpm-store"));
  await mkdir(hostStore, { recursive: true });

  return defineSandcastleConfig({
    repo: "cyy1998/shgas-iam",
    sandbox: {
      image: env.SANDCASTLE_IMAGE?.trim() || "iam-sandcastle:local",
      dockerfile: ".sandcastle/Dockerfile",
      dockerAccess: true,
      mounts: [{ hostPath: hostStore, sandboxPath: sandboxStore }],
      env: {
        IAM_AFK_PNPM_STORE_DIR: sandboxStore,
        IAM_E2E_LIFECYCLE: "fresh",
        TURBO_CACHE_DIR: "/tmp/iam-sandcastle-turbo/cache",
        // Local Git config outranks the container-global value set by enable-git-hooks.sh.
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.hooksPath",
        GIT_CONFIG_VALUE_0: "/tmp/iam-sandcastle-hooks",
        ...(ghToken ? { GH_TOKEN: ghToken } : {}),
      },
      dockerAuth: dockerConfigSource
        ? {
            source: dockerConfigSource,
            registries,
            sandboxPath: `${sandboxHome}/.docker/config.json`,
          }
        : undefined,
    },
    lifecycle: {
      prepareCommand: "sh scripts/sandcastle/prepare-workspace.sh </dev/null",
      prepareTimeoutMs: 1_200_000,
      hooksCommand: "sh scripts/sandcastle/enable-git-hooks.sh </dev/null",
      ...createTestResourceLifecycle(),
    },
    workflow: {
      draft: draft ?? /^(?:1|true)$/i.test(env.SANDCASTLE_PR_DRAFT?.trim() ?? ""),
      projects: Boolean(projectUrl),
      project: projectUrl ? { url: projectUrl, token: projectToken?.trim() || undefined } : undefined,
    },
    roles,
    authAdapters:
      authMode === "chatgpt"
        ? [
            codexFileAuth({
              source: env.CODEX_AUTH_FILE?.trim() || join(codexHome, "auth.json"),
              sandboxHome: `${sandboxHome}/.codex`,
              providers,
            }),
          ]
        : [],
    promptExtras,
  });
}
