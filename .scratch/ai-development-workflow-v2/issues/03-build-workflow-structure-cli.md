# 03 — 交付 v2 结构校验 CLI

**What to build:** 提供一个只读、可脚本化的 workflow checker，只校验 v2 记录文档的格式完整性与静态一致性，并在不改写 legacy 历史的前提下给出简短中文诊断；不通过 Git 历史还原或证明信息来源。

**Blocked by:** 01

**Status:** resolved

- [x] Checker 能从仓库根发现全部 v2 feature 目录，并区分 standard、quick 与未 adoption 的 legacy features。
- [x] 无参数模式校验所有 v2 records；feature 选择模式只校验指定 slug，并对不存在、重复或无法解析的 feature 给出明确错误。
- [x] V2 ledger 的中文标题、顶层字段唯一性与顺序、必需章节、枚举、列表、表格和 SHA 字面格式按 tracker 契约校验。
- [x] Standard 与 quick workflow 的必需文件和允许结构分别得到验证；未 adoption 的 legacy records 只计数，不因旧格式失败。
- [x] Checker 只做当前文档集内可直接判断的静态一致性检查，例如目录与 `Feature-Slug`、ticket 文件编号和 blocker 引用。
- [x] Checker 不解析 Git refs、不遍历提交历史、不重放 checkpoint 或状态转换，也不证明命令执行、聊天授权、评审结果、证据新鲜度或信息来源。
- [x] Checker 的所有模式保持只读，不创建目录、编辑记录、切换分支、暂存文件、提交或修改 Git refs。
- [x] 成功输出简洁稳定；失败输出包含文件位置、观测格式、预期结构和下一安全动作，并使用中文叙述。
- [x] CLI tests 在临时目录构造有效与无效的 standard/quick/legacy 文档树，观察退出码、诊断和只读保证，不要求构造真实 Git 历史。
- [x] 提供可独立运行的 workflow checker 与专用 CLI test 命令，为后续记录格式扩展和 hook 接入保留稳定公开接口。

## Resolution

- Ticket base: `35463537dca61592d10536e0a79e46a997fb695b`
- Reviewed content head: `36cd9ad6e07b9922510dd761198c17562204ac49`
- Candidate commits: `006a2de547f126a3499e97a9ad32f31d91ace51b`, `cabfd9c1340ad0f6e1ddce10b3b5a793020d2af8`, `cbeffe15812bacf4f1a28990ba040108a1c30f53`, `0e80f1bb0b1dc46360d8655481b528543079e6fd`, `36cd9ad6e07b9922510dd761198c17562204ac49`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `pnpm test:workflow` — passed，39 个 CLI tests、193 个 expectations
  - `pnpm lint` — passed，仅有仓库既有 warning
  - `pnpm typecheck` — passed，14 个 workspace tasks
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.

## Reopen 2026-07-19

- Reason: 本地 squash 交付在 Windows CRLF checkout 上触发 checker 误报，CLI 尚未兼容仓库实际换行环境。
- Previous reviewed content head: `36cd9ad6e07b9922510dd761198c17562204ac49`
- Remediation base: `6e5005545c7036a4c30bb937fb204d8f84f6ba4f`
- Status transition: resolved -> claimed

## Resolution 2026-07-19

- Ticket base: `6e5005545c7036a4c30bb937fb204d8f84f6ba4f`
- Reviewed content head: `2ef812d780a2580571c6ead50222efba1ea47570`
- Candidate commits: `2ef812d780a2580571c6ead50222efba1ea47570`
- Final squash commit: `pending`
- Validation:
  - `pnpm install --frozen-lockfile` — passed
  - `pnpm test:workflow` — passed，99 个 CLI tests、510 个 expectations，包含 delivery、spec 与 ticket 的 CRLF 回归覆盖
  - `pnpm lint` — passed，仅有仓库既有 warning
  - `pnpm typecheck` — passed，14 个 workspace tasks
  - `git diff --check` — passed
- Review: Standards and Spec review passed with no unresolved findings.
