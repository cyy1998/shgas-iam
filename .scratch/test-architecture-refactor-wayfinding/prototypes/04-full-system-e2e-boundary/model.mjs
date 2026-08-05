const options = [
  {
    id: "playwright-owned",
    name: "A — Playwright hooks 持有 lifecycle",
    interfaceShape: [
      "playwright globalSetup() -> compose up / migrate / seed / wait",
      "spec helpers -> journey-local readiness 与 fixture",
      "globalTeardown() -> diagnostics / compose down -v",
    ],
    ownership:
      "Playwright 同时拥有 browser assertions、系统 lifecycle、诊断和清理；Compose 与 seed 细节会泄漏到 hooks/spec helpers。",
    deletionTest:
      "没有一个可删除的深 Module；相同 project/port/readiness/cleanup 知识会散落到两条 journey、root command 与 CI post-job。",
    verdict: "拒绝：正常路径看似最小，但 timeout、启动失败和 Ctrl+C 会把 ownership 切碎。",
  },
  {
    id: "project-scoped",
    name: "B — project-scoped 一次性 orchestrator（推荐）",
    interfaceShape: [
      "public: pnpm test:e2e",
      "internal: run -> exact descriptor -> fixed phases -> diagnostics -> cleanup",
      "Playwright -> 只接收 gatewayOrigin 与 run-scoped 领域凭据",
    ],
    ownership:
      "root-owned E2E workspace 持有唯一 Compose project、固定 lifecycle 和 artifacts；Playwright 只持有两条用户 journey。",
    deletionTest:
      "删除后 project/port/migration/seed/readiness/diagnostics/cleanup 会重新分散到两条 journey、root command 与 CI；该 Module 有 leverage 与 locality。",
    verdict:
      "采用：一个深 command interface，内部可有局部 helper，但不公开 adapter/plugin/state-machine interface。",
  },
  {
    id: "generic-platform",
    name: "C — 可插拔 E2E 平台",
    interfaceShape: [
      "createRun({ serviceAdapters, seedProviders, readinessPlugins })",
      "persistent phase state machine + run registry",
      "label janitor + resume/retry orchestration",
    ],
    ownership:
      "平台抽象拥有任意服务拓扑、任意 journey 和跨 run 恢复；当前 IAM Compose 只是一个 adapter 集合。",
    deletionTest:
      "当前只有一套系统拓扑、一个 Compose adapter 和两条同生命周期 journey；删掉插件层后复杂度不会在多个真实调用方重现。",
    verdict: "拒绝首期：为并发 runner、宿主崩溃恢复和第二套 E2E 产品线预付复杂度。",
  },
];

const lenses = [
  {
    id: "system-gate",
    name: "共享系统启动 gate",
    invariant:
      "共享 gate 启动 PostgreSQL、Redis、etcd、APISIX、API、Admin API、OIDC Provider、Worker、Admin 与 SSO；readiness 与业务断言分离。",
    flows: {
      "playwright-owned":
        "globalSetup 同时拉起 infra/runtimes/frontends；每个 spec 再补自己发现缺失的 wait/seed。",
      "project-scoped":
        "preflight -> descriptor/project -> infra healthy -> migrate -> seed -> runtimes ready -> render Gateway hosts=127.0.0.1 -> route probes -> Playwright。",
      "generic-platform":
        "registry 创建 run -> service adapters 逐个推进 phase -> readiness plugins 汇总 -> journey scheduler。",
    },
    minimum:
      "浏览器与 Node 只访问 http://127.0.0.1:<dynamic-port>；其他 ports 留在 Compose network。不依赖 .localhost、hosts 文件或 resolver override。",
  },
  {
    id: "admin-custom-sso",
    name: "Admin Custom SSO journey",
    invariant:
      "Admin、SSO、Gateway、API Custom SSO、Admin API 与其依赖均为真实 repo-owned runtime；不使用 page.route 替代核心 HTTP 边。",
    flows: {
      "playwright-owned":
        "spec 自己创建 Admin client/user fixture、等待页面与 API，并在 teardown 猜测哪些资源属于自己。",
      "project-scoped":
        "共享 seed 产生 active admin subject + Custom SSO client；browser 走 /iam-admin -> /sso/authorize -> /portal/login -> password API -> callback -> /api/iam/rpc read-back。",
      "generic-platform":
        "journey plugin 声明 required services、seed provider、route capability 与 cleanup hooks。",
    },
    minimum:
      "保留真实密码登录、Session/Cookie、Gateway route、Custom SSO callback 与 Admin API 配置结果；CAP=false、orcas.enabled=false，避开 SMS/WeChat。",
  },
  {
    id: "oidc-pkce",
    name: "独立 OIDC Authorization Code + PKCE journey",
    invariant:
      "OIDC Provider、SSO/API authentication、Gateway authorize/token/UserInfo 路径和 production Session 状态均真实；RP 是 test-owned 外部边。",
    flows: {
      "playwright-owned":
        "spec 内拼 authorize URL、PKCE、callback intercept、token exchange 与 fixture cleanup。",
      "project-scoped":
        "RP helper 生成 S256 verifier/challenge；browser 走 /oidc/auth -> /portal/login -> password API -> /oidc/resume，随后真实 token + /oidc/me。",
      "generic-platform":
        "OIDC journey plugin 注册 RP adapter、protocol phases 与 token artifact store。",
    },
    minimum:
      "test-owned callback 可由 journey-local helper 接住；issuer/redirect 精确使用 127.0.0.1 canonical origin，HTTP local 的 binding Cookie Secure=false、Path=/oidc。",
  },
  {
    id: "seed-readiness",
    name: "migrations、seed 与 readiness",
    invariant:
      "空 project volumes 上显式跑真实 migrations；当前没有 Docker seed seam，首期 seed 保持 E2E-local 并复用 production owner，不复制 Redis persistence 语义。",
    flows: {
      "playwright-owned":
        "setup/spec helpers 直接写 DB/Redis，日志与失败阶段混在 Playwright 输出。",
      "project-scoped":
        "one-shot migrate/seed 产生脱敏 receipt；OIDC /health、Worker /healthz、frontend /healthz 与 app probes 先直连验证，Gateway 再验证 routed contract。",
      "generic-platform":
        "migration/seed/readiness providers 按 dependency graph 调度并把 phase 写入 registry。",
    },
    minimum:
      "一个 seedE2EScenario 输入 runId/origin，返回两条 journey 所需领域凭据；不建 seed DSL。Worker health 只在 Compose network 探测，不额外公开 host port。",
  },
  {
    id: "diagnostics-cleanup",
    name: "诊断与精确清理",
    invariant:
      "任何失败都先保存 compose ps/health、bounded logs、Gateway config 状态、migration/seed 输出和 Playwright artifacts，再对精确 project 执行 down -v。",
    flows: {
      "playwright-owned":
        "globalTeardown 尝试诊断和清理；setup 失败、runner timeout 或 teardown 未注册时路径不一致。",
      "project-scoped":
        "orchestrator 的单一 finally 调用 idempotent collectDiagnostics + cleanup(projectName, down -v --remove-orphans)；cleanup failure 也是失败。",
      "generic-platform":
        "diagnostic collectors 与 resource adapters 逐 phase checkpoint，janitor 后台回收过期 labels。",
    },
    minimum:
      "artifact/run descriptor 记录精确 project、origin 和资源 labels，不记录 secret/token；禁止全局 Docker prune、按模糊前缀删除或无范围 volume 清理。",
  },
  {
    id: "interrupt-recovery",
    name: "Ctrl+C、CI post-job 与宿主崩溃",
    invariant:
      "正常、断言失败、timeout 和可捕获 signal 共用相同 cleanup；SIGKILL/宿主断电无法由进程内 finally 保证。",
    flows: {
      "playwright-owned":
        "依赖 Playwright teardown；外层进程中断时没有稳定 project pointer 交给 CI 或人工恢复。",
      "project-scoped":
        "run descriptor 先于创建资源落盘；signal handler 与 CI post-job 按 exact project 重复 cleanup；宿主崩溃后只允许显式 cleanup descriptor，不自动扫全机。",
      "generic-platform":
        "persistent registry + TTL janitor 自动发现、resume 或回收 orphaned runs。",
    },
    minimum:
      "首期不承诺透明 resume；残留 run 以精确 descriptor 可诊断、可幂等清理即可。出现第二种 runner 或反复 orphan 证据后再评估 janitor。",
  },
];

export function createState() {
  return { optionIndex: 1, lensIndex: 0 };
}

export function reduce(state, key) {
  if (key === "1") return { ...state, optionIndex: 0 };
  if (key === "2") return { ...state, optionIndex: 1 };
  if (key === "3") return { ...state, optionIndex: 2 };
  if (key === "n") {
    return { ...state, lensIndex: (state.lensIndex + 1) % lenses.length };
  }
  return state;
}

function renderState(state, ansi) {
  const bold = ansi ? "\u001B[1m" : "";
  const dim = ansi ? "\u001B[2m" : "";
  const reset = ansi ? "\u001B[0m" : "";
  const option = options[state.optionIndex];
  const lens = lenses[state.lensIndex];

  return [
    `${bold}Full-system E2E 最小系统边界 prototype${reset}`,
    `${dim}问题：哪一种 lifecycle ownership 足够可靠，又没有预建测试平台？${reset}`,
    "",
    `${bold}候选${reset}: ${option.name}`,
    `${bold}观察场景${reset}: ${lens.name}`,
    "",
    `${bold}Interface${reset}`,
    ...option.interfaceShape.map((line) => `  ${line}`),
    "",
    `${bold}Ownership${reset}`,
    `  ${option.ownership}`,
    "",
    `${bold}Scenario flow${reset}`,
    `  ${lens.flows[option.id]}`,
    "",
    `${bold}Invariant${reset}`,
    `  ${lens.invariant}`,
    `${bold}Minimum reliable shape${reset}`,
    `  ${lens.minimum}`,
    "",
    `${bold}Deletion test${reset}`,
    `  ${option.deletionTest}`,
    `${bold}Verdict${reset}`,
    `  ${option.verdict}`,
  ].join("\n");
}

export function render(state, ansi = true) {
  return [
    renderState(state, ansi),
    "",
    ansi
      ? "\u001B[1m[1]\u001B[0m Playwright-owned  \u001B[1m[2]\u001B[0m project-scoped  \u001B[1m[3]\u001B[0m platform  \u001B[1m[n]\u001B[0m next lens  \u001B[1m[q]\u001B[0m quit"
      : "[1] Playwright-owned  [2] project-scoped  [3] platform  [n] next lens  [q] quit",
  ].join("\n");
}

export function renderSnapshot() {
  const blocks = [
    `${options.map((option) => `${option.name}: ${option.verdict}`).join("\n")}`,
  ];

  for (let lensIndex = 0; lensIndex < lenses.length; lensIndex += 1) {
    blocks.push(renderState({ optionIndex: 1, lensIndex }, false));
  }

  return blocks.join("\n\n---\n\n");
}
