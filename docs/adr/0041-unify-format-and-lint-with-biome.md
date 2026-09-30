---
status: accepted
---

# 统一 Biome 格式与规则检查，并由提交 Hook 自动修复

决策前，后端使用 Antfu ESLint，Admin/SSO 组合使用 ESLint、Prettier 和 Stylelint；格式风格和命令入口存在差异。
采用 Biome 统一格式与规则检查，将日常修复放到 pre-commit，减少依赖人或 AI 记住执行检查的步骤。
本决策于 2026-09-29 接受；实施与验收沿 [Spec #217](https://github.com/cyy1998/shgas-iam/issues/217) 跟踪，当前行为见
[编码约定](../development/coding-style.md)与[命令入口](../development/commands.md)。

## 已确认的方向

- pre-commit 对本次暂存文件自动格式化，并应用 Biome 标记为安全的 lint 修复；剩余 lint 错误阻断提交，
  不启用 unsafe 修复。
- 保留统一的 format、lint 相关公开命令。AI 日常流程不再要求手动重复执行这两类命令；
  verify / CI 聚合验证保留自动只读检查，不在最终验证时改写源码。
- 全仓格式采用 2 空格、双引号、分号和 120 列目标宽度，取消前后端不同的格式风格。
  目标宽度是 formatter 的换行偏好，不要求所有不可拆分文本都满足硬性长度限制。
- Biome 为主要工具；仅为未支持的文件类型保留补充工具，由统一命令和同一 pre-commit 入口自动调度。
  统一入口不等于要求单一执行引擎，不能为移除工具而静默丢失现有覆盖。
- 采用 Biome 推荐规则作为基线，逐项核对本仓显式定制并保留必要约束；不要求复刻 Antfu 全部预设。
  无法覆盖的关键检查单独裁决，不能以引擎替换为由默认删除。
- 迁移时一次性整理全部纳入检查的自有代码并建立通过基线，机械格式变更与行为修复分别提交；
  生成文件、vendored 资源和冻结历史排除，不采用随文件修改逐步迁移的长期过渡模式。
- Hook 自动运行 Biome import 整理，最终只读检查验证同一规则；不启用副作用 import 重排。
  独立 format 命令只负责排版，不整理 import。
- typecheck 保留现有开发与最终验证入口，本次不加入 pre-commit 或 pre-push，也不由 Biome lint 替代。
- Hook 始终只处理本次暂存文件。检查配置或相关依赖变化时也不在 Hook 内扩大为全仓检查，
  完整影响范围由 verify / CI 的全仓只读检查兜底。
- YAML 只使用 Prettier 排版，不保留 ESLint 或额外的通用 YAML linter。
  配置语义与可用性由对应工具在实际使用、验证或发布流程中的专属验证负责，不能用格式检查通过替代。
  这些专属验证继续遵守各自现有入口与流程，不加入 pre-commit。

## 理由与代价

仅依靠 AI 选择检查范围并手动运行，可能遗漏最后一次修改或部分受影响文件；提交 Hook 将这些确定性操作绑定到提交。
本地 Hook 可以被绕过，且合并会产生新的文件组合，因此保留最终候选的自动只读检查。
这比完全删除聚合验证中的 format/lint 更能维持统一风格，也避免在日常流程中反复要求手动运行相同命令。

统一风格会产生机械差异；更换规则引擎也不意味着原 ESLint/Stylelint 规则逐条等价。
当前前端有 7 个 Less 文件，Gateway 的现有 lint 路径覆盖 8 个 YAML 文件。
Biome 当前的[语言支持](https://biomejs.dev/internals/language-support/)不能完整接管这些类型，
其 Markdown、YAML 支持仍列为开发中。不能通过静默忽略文件来宣称原有覆盖已经保留。
为此保留未支持类型的补充工具，接受有限的多引擎维护成本；前后端统一命令与提交行为仍由仓库拥有。
YAML 明确放弃现有通用 ESLint 规则覆盖：为少量配置文件保留 ESLint 的维护成本不值得，
由 Prettier 统一排版，并由消费配置的工具验证其实际契约。专属验证不等价于旧 lint 规则逐条迁移，
也不意味着每次提交时已经执行；适用时仍须按相应验证或发布流程完成。
一次性建立基线会增加迁移 diff 和并行分支冲突，但避免让全仓只读检查长期依赖旧格式例外。

## 落地方案

公开命令保留 root 和 workspace 两种使用方式，并共享同一配置与文件分工：

| 命令           | 职责                                        |
| -------------- | ------------------------------------------- |
| `format`       | 仅自动排版，不整理 import，不修复代码规则。 |
| `format:check` | 只读检查排版。                              |
| `lint`         | 只读检查代码规则与 import 整理要求。        |
| `lint:fix`     | 应用安全代码规则修复与 import 整理。        |

日常 AI 流程不要求手动调用以上命令。现有 verify / verify:static / CI 聚合入口自动组合只读检查，
其余文档、架构、测试收集检查以及 typecheck、测试与 build 保留各自职责。

Biome 负责 JS/TS、JSX/TSX、JSON/JSONC 和 CSS。Prettier 仅为 Less、YAML、Markdown 等未支持类型提供排版；
Less 保留 Stylelint，YAML 不引入通用 linter；移除 JS/TS 的 Antfu 链路，也不为 YAML 保留 ESLint。
YAML 的专属验证沿用实际消费工具的入口，例如现有 `pnpm gateway:apisix:validate` 及
[Gateway 发布流程](../releases/apisix-gateway-release.md)，不由 format/lint 命令代为执行。
这保留当前 Less 源码，不把样式语言转换混入工具迁移。补充工具不与 Biome 对同一文件重复排版；
没有可靠安全修复分类的规则默认只报错，不能因其支持 `--fix` 就视为满足安全修复要求。
Markdown 只做排版并继续使用现有文档检查，不新增 prose lint；未支持文件类型明确列出，不宣称已检查。
仓库自有且被这些工具支持的文件纳入统一范围；依赖锁文件、生成输出、vendored 资源、冻结历史及外来 skill 副本排除。

沿用 Husky，增加 lint-staged 负责暂存文件调度、修复结果重新暂存和部分暂存保护。
允许对被选中文件的暂存版本做整文件格式化，但不把该文件原有的未暂存代码改动带入提交。
工具失败或恢复未暂存改动时发生冲突则中止提交，保留备份和恢复提示；不得用全仓 `git add` 收尾。
仅有被排除文件或无匹配文件时正常跳过，不把“没有适用任务”当作失败。

普通宿主与 Sandcastle 的实施、合入执行器应具有相同的提交检查行为；依赖安装与环境预检需要确保 Hook 可运行。
Sandcastle 容器可写挂载宿主 Git 元数据，标准 Husky 安装会修改共享的 local `core.hooksPath`。
因此保留安装阶段的 `HUSKY=0`，使用容器进程级 Git 配置指向容器私有 Hook 启动器，再调用仓库同一 pre-commit 脚本，
不重写宿主 `.git/config` 或 `.husky/_`。需要通过真实提交 smoke 验证成功、失败阻断与宿主配置保持不变。
普通 `git commit` 走上述 Hook；Git 自动生成的 merge commit 不保证触发 pre-commit，
本方案不新增 pre-merge-commit，合并结果由已有最终 verify 全仓只读检查覆盖。
本地 Hook 不宣称不可绕过，verify / CI 仍是最终只读校验入口；本次不隐含新增远端 CI 服务或分支保护配置。

现有生成目录与 vendored 资源边界见[仓库地图](../architecture/repository-map.md)，冻结历史仍保持只读。
迁移范围与实施验收由来源 Spec 承载；本决策不授权修改业务行为或发布。
