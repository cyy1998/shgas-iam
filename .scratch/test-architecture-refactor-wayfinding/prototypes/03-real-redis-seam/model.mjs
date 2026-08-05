const options = [
  {
    id: "production-direct",
    name: "A — 直接复用 production Kernel（推荐）",
    interfaceShape: [
      "fixture() -> { subject, authContext, bindingInput, credentialInput }",
      "createSessionKernel({ redis, config, principalAccessFence, cleanupAdapters })",
      "kernel.createPrincipalSession(...) / createClientBinding(...) / issueCredential(...)",
    ],
    knowledge: "只有 production Kernel 知道 key、serialization、TTL、index、transaction 与 artifact Lua。",
    newSurface: "不新增长期 persistence/testing interface；每个 profile 直接 composition production Kernel。",
    deletionTest:
      "API external、OIDC external、API/OIDC/Admin 迁移场景和既有 API Core Redis contract 都能成为真实调用方。",
    decision: "现在即可采用；纯 fixture builder 只有在两个调用方确实重复非平凡领域输入时才共享。",
  },
  {
    id: "redis-test-scope",
    name: "B — 新增窄 Redis test scope",
    interfaceShape: [
      "createSessionKernelRedisTestScope({ redisUrl, config })",
      "  -> { writer: SessionKernel, observer: SessionKernel, dispose() }",
      "scope 内部仍调用 production createSessionKernel；不提供 seedRaw/serialize/commands。",
    ],
    knowledge: "scope 只知道 namespace、client ownership 与 cleanup；production Kernel 仍独占 persistence 语义。",
    newSurface: "新增 test-only resource-owner interface，但不新增第二套 Session persistence adapter。",
    deletionTest:
      "当前等价 scope 只有一个调用方；至少迁入 API external 与 OIDC external 后，才有资格成为长期共享 Module。",
    decision: "暂不新增；若两个迁移调用方出现同一段非平凡资源 ownership/cleanup，再从局部实现抽出。",
  },
];

const scenarios = [
  {
    id: "kernel-state",
    name: "Session Kernel 状态造数",
    direct:
      "领域 fixture -> production createSessionKernel -> 真实 Redis -> HTTP/OIDC/CLI 可观察结果",
    scoped:
      "领域 fixture -> scope.writer（production SessionKernel）-> 真实 Redis -> 协议结果",
    invariant:
      "namespace/HMAC/TTL 必须与被测 entry 一致；Barrier 先通过其 production bootstrap 建立。",
  },
  {
    id: "other-state",
    name: "非 Kernel 的 Redis 状态",
    direct:
      "Subject Access 用 createSubjectAccessBootstrap；Facts 用 createSubjectFactsRedisPublisher；其他状态留在 owner Module。",
    scoped:
      "Session scope 不扩张为通用 Redis framework；各 owner Module 仍使用自己的 production writer seam。",
    invariant:
      "单一 Kernel seam 不得声称能生成 Barrier、Facts、Custom SSO runtime cache 或 OIDC Provider 私有状态。",
  },
  {
    id: "normal-resource",
    name: "普通 Redis Integration 资源",
    direct:
      "调用方创建随机 namespace、writer/observer clients；结束时只删除 owned prefix 并关闭 clients。",
    scoped:
      "scope 集中随机 namespace、writer/observer ownership 与 prefix cleanup；仅在两个调用方重复后抽取。",
    invariant: "不执行 FLUSHDB/FLUSHALL，不扫描或删除其他 owner 的 key。",
  },
  {
    id: "cleanup-cli",
    name: "Legacy cleanup CLI",
    direct:
      "独占 disposable logical DB/instance -> seed target + sentinel -> dry-run/apply/verify -> 全库 inventory diff -> destroy。",
    scoped:
      "同左；固定 allowlist 会 SCAN 整个 DB，故永远不进入 namespace Session scope。cleanup harness 保持 CLI-local。",
    invariant: "ACL、sentinel 与 inventory 各证明不同属性，不能互相替代。",
  },
];

export function createState() {
  return { optionIndex: 0, scenarioIndex: 0 };
}
export function reduce(state, key) {
  if (key === "1") return { ...state, optionIndex: 0 };
  if (key === "2") return { ...state, optionIndex: 1 };
  if (key === "n") {
    return { ...state, scenarioIndex: (state.scenarioIndex + 1) % scenarios.length };
  }
  return state;
}

function renderState(state, ansi) {
  const bold = ansi ? "\u001B[1m" : "";
  const dim = ansi ? "\u001B[2m" : "";
  const reset = ansi ? "\u001B[0m" : "";
  const option = options[state.optionIndex];
  const scenario = scenarios[state.scenarioIndex];
  const flow = option.id === "production-direct" ? scenario.direct : scenario.scoped;

  return [
    `${bold}真实 Redis 测试 seam prototype${reset}`,
    `${dim}问题：删除 RESP shim 后，哪一个最小 interface 值得长期存在？${reset}`,
    "",
    `${bold}候选${reset}: ${option.name}`,
    `${bold}当前场景${reset}: ${scenario.name}`,
    "",
    `${bold}Interface${reset}`,
    ...option.interfaceShape.map(line => `  ${line}`),
    "",
    `${bold}Flow${reset}`,
    `  ${flow}`,
    "",
    `${bold}Knowledge locality${reset}`,
    `  ${option.knowledge}`,
    `${bold}New surface${reset}`,
    `  ${option.newSurface}`,
    `${bold}Scenario invariant${reset}`,
    `  ${scenario.invariant}`,
    `${bold}Deletion test${reset}`,
    `  ${option.deletionTest}`,
    `${bold}Verdict${reset}`,
    `  ${option.decision}`,
    "",
    `${bold}Cleanup safety proof${reset}`,
    "  ACL       -> 禁止 FLUSHDB/FLUSHALL 等能力；不证明 DEL/SCAN 的 target 正确。",
    "  Sentinel  -> 一个非 target canary 在 apply 后仍存在；只证明该样本未被误删。",
    "  Inventory -> 在 disposable DB 中比较完整 before/after；证明本次 fixture 的精确删除集合。",
    "",
    `${bold}Assertion migration${reset}`,
    "  删除 RESP command 顺序/次数断言；改看 HTTP/OIDC/CLI 结果与真实 Redis 状态。",
    "  保留 owner Module interface 下的 Lua 单赢家、CAS、TTL/Redis TIME、并发与 cleanup effect contract。",
  ].join("\n");
}

export function render(state, ansi = true) {
  return [
    renderState(state, ansi),
    "",
    ansi
      ? "\u001B[1m[1]\u001B[0m production direct  \u001B[1m[2]\u001B[0m test scope  \u001B[1m[n]\u001B[0m next scenario  \u001B[1m[q]\u001B[0m quit"
      : "[1] production direct  [2] test scope  [n] next scenario  [q] quit",
  ].join("\n");
}

export function renderSnapshot() {
  const blocks = [];
  for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
      blocks.push(renderState({ optionIndex, scenarioIndex }, false));
    }
  }
  return blocks.join("\n\n---\n\n");
}
