---
status: accepted
---

# 显式配置 Custom SSO 回调类型

后续 [ADR-0038](0038-derive-managed-sso-callback-from-redirect-origin.md) 保留本文的显式类型，另行确认托管回调从
业务落地 origin 推导、托管配置移除地址的决定，已由 Spec #201 实现并完成本地行为验证。
本文的托管固定地址约定保留为被取代的历史决定；当前同代及旧版直升流程分别见
[同代手册](../releases/managed-callback-origin-preserving-upgrade.md)和[跨代手册](../releases/b648-managed-callback-upgrade.md)，环境尚未迁移。

## 2026-09-16 重新讨论：显式回调类型

维护者在原候选完成后修改 Q1：增加由管理员选择的“托管回调 / 业务回调”配置，不再根据 URL 判断类型。
本轮继续复用 `codex/custom-sso-callback-path`。显式类型修订已实现；下文原路径候选仅作历史记录，
其中 Q1/Q4/Q5/Q8 的 URL 分类要求已由本节取代。目标环境尚未迁移或部署。

已确定的领域含义：回调类型表达回调由 IAM 托管还是由业务处理，独立于回调地址。
Q9/Q11 已确认：托管回调不要求特定路径，授权始终跳转到管理员填写的完整地址；类型只改变判定与相应校验，
不改写地址或自动转发到另一地址。回调类型不由域名或路径推导，业务回调使用 `/sso/callback` 也仍属于业务回调。
保留 URL 格式校验，管理员负责让填写的托管地址具备托管回调处理能力。

Q10 已确认：继续使用固定完整回调；退出不比较当前类型；切换类型不清空会话、不改写旧 Code/Token 用途、
不删除已有 Secret；OIDC 和前端同源限制不变。原 Q2–Q8 的其他决定保留，依赖 URL 分类的 Q4、Q5、Q8 随本轮修订。

只读调查确认：当前配置 schema 与数据库 CHECK 均严格限制字段，Admin 详情及编辑前会解析存量配置，
Snapshot 也消费同一配置 schema。因此新增必填类型必须处理存量数据及新旧读取端的协调切换。
现有旧配置升级工具仅服务双协议列仍存在的过渡布局，不能直接迁移已收缩的单协议存量。
修订前业务回调允许保存 ORCAS 开关但不会执行；本轮已改为拒绝该配置组合。

Q12 已确认：新建配置不设默认回调类型，管理员必须主动选择；编辑回填已保存的类型。
Q13=B 已确认：单协议存量仅在一次性迁移时按原 URL 规则回填，在线运行及后续编辑完全读取显式类型。
Q16=A 已确认：本次单协议存量按解析后的 pathname 精确等于 `/sso/callback` 回填托管，其余回填业务。
这是维护者明确选择的迁移规则；不自动保留更早的 IAM 内外网完整回调白名单分类结果。
Q14 已确认：旧双协议迁移按 Independent → 业务回调、Gateway → 托管回调直接映射，不按 URL 分类。
Q15 已确认：禁止业务回调开启 ORCAS；管理界面与后端均应阻止保存该组合。

Q17 已确认：存量迁移结果为业务回调且 ORCAS 已开启时，迁移关闭该开关，并报告受影响 Client。
Q18 已确认：采用协调切换，暂停相关流量及配置写入，补齐类型、更新数据库约束，统一更新相关服务，
重建并核验配置 Snapshot 后恢复；新代码拒绝缺少类型的配置，不提供在线 URL 推断回退。

数据库更新范围为 `client.sso_config` JSONB 配置中新增显式回调类型、按上述规则补齐 Custom SSO 存量，
以及同步更新 `client_sso_config_check` 约束。无需为此新增独立表或独立列；OIDC 配置不增加回调类型。
配置数据迁移不等于清空在线会话：Q10 的现有会话、Code/Token 用途与已有 Secret 保留要求继续成立。
原 Q7 的“不引入状态 schema migration”只指在线协议产物，不再能解释为本次不需要数据库配置迁移。

Q19 的整体修订方案与验证范围已由维护者调用 `implement` 确认并授权实施。
补充管理页面必选与回填、ORCAS 组合校验、真实数据库迁移及重复执行验证，覆盖业务类型使用 `/sso/callback`
和托管类型使用其他路径；保留原协议与浏览器验证。尚未执行环境迁移或部署。

## 显式类型实施与验证

配置使用必填 `callbackType: managed | business`；Admin 必选并回填，业务 ORCAS 由共享 schema 与数据库约束拒绝。
在线 URL 分类 helper 及其 composition 注入已移除，Code/Token/续接的存储形状保持不变。
迁移准备命令与版本化 DDL 使用同一约束，完整切换与备份恢复见[维护手册](../releases/unified-session-maintenance.md#显式回调类型的保留状态升级)。

已完成 Contracts、Domain 与受影响 runtime 的 Unit/typecheck，API Redis 281 项、API Browser 4 项、
Admin 显式类型浏览器 1 项、数据库 PostgreSQL 22 项、Admin 配置与 Snapshot PostgreSQL/Redis 27 项、
Worker 旧升级与收缩 9 项，以及 API/Admin API/Admin Component 回归、API Composition 30 项与 Admin 构建。
静态检查与 `git diff --check` 已通过；双轴评审在最终候选上执行。
测试资源为任务独占 PostgreSQL 18.4、Redis 8.8.0 和 Chromium；不证明目标环境已切换。

## 原路径候选记录（历史）

维护者于 2026-09-16 在 `grill-with-docs` 讨论中确认以下 Q1–Q8。本文记录已确认的修改目标，
维护者已整体确认并授权实施，代码与自动化验证已完成，尚未合入或部署。目标是让业务域名代理的 IAM 回调可以完成托管交付并写入该主机的 Cookie。

## 已确认的决定

### Q1：托管回调不受 IAM 内外网 origin 白名单限制

Client 配置的 callback 路径为 `/sso/callback` 时识别为托管回调，域名不限；其他路径由业务自行处理。
管理员负责确保该地址确实代理到 IAM；业务自行实现的同名路径也会被归类为托管。
不增加显式的托管/业务模式开关。URL 格式与路径匹配细节见 Q4。

本决定修订 [ADR-0035 Q18/Q23](0035-unify-user-and-client-session-lifecycles.md#q18q23单个回调-url-自动决定-custom-sso-接入)
中要求按可信 IAM origin 下的完整回调 URL 识别、不能只按路径识别的约束。

### Q2：继续使用 Client 配置的完整回调地址

授权继续跳转 Client 配置的完整 callback URL，不根据本次业务 `redirectUrl` 推导 callback。
这保留 [ADR-0036 Q6](0036-bind-oidc-to-internal-and-external-issuers.md#q6custom-sso-回调按实际配置执行)
的固定回调选择。Cookie 仍由浏览器实际访问的回调主机承接。

### Q3：退出不再比较当前回调分类

使用 Custom SSO Token 退出时，删除 Token 的 managed/business 类型与当前 Client callback 分类的一致性检查。
修改回调方式后，原 Token 不再仅因该分类变化而无法退出；其他有效性检查保留。
该决定针对退出，不自动取消 Code 兑换的用途、回调和落地地址绑定。

### Q4：严格匹配解析后的路径，允许 query

使用 URL 解析后的 `pathname` 精确匹配 `/sso/callback`；`/sso/callback/` 和 `/SSO/callback` 不属于托管路径。
允许原有 query，协议参数 `code/client/redirectUrl/state` 由 IAM 控制。继续保留现有 HTTP(S)、无凭据和无非空
fragment 的格式要求，不扩大 URL 格式清理范围；空 query/fragment 按现有 URL 解析规则处理，不参与 pathname 分类。

### Q5：相关功能统一采用新分类

授权、托管回调兑换、Secret 自动生成、ORCAS 和旧配置迁移统一按 Q4 分类，不再以 IAM 内外网 origin 或完整
回调 URL 白名单决定托管资格。业务域名的托管回调可执行已经配置的 ORCAS 集成。
Code 继续绑定签发时的完整回调、用途和落地地址，不允许通过改变回调分类转换已签发 Code 的用途。

### Q6：限定为 Custom SSO 托管分类和退出

本次只修改 Custom SSO 托管分类及 Q3 的退出检查。前端导航同源检查、OIDC 入口、issuer 绑定及内外网 origin
配置格式要求保持现状，不将它们纳入本次放宽范围。

### Q7：保留现有会话和协议产物

升级不清空会话，不改写已有 Code/Token 的用途，不引入状态 schema migration。
已有 Code 和授权续接保留签发时的回调及兑换方；旧 business Code 继续按原 Secret 认证与绑定规则兑换，
不能转到托管回调使用。旧 Token 继续受既有有效性规则约束，并可按 Q3 退出；新授权使用新分类。
仅凭分类变化不删除已有 Secret，确保仍在有效期内的旧 business 流程可完成。

### Q8：验证分类、协议配套与业务域名 Cookie

实施时完成以下验证，并区分自动化候选验证与实际部署证据：

- 路径分类覆盖业务域名、端口、query、大小写及尾斜杠。
- 新托管回调成功，业务兑换保持正常，两种 Code 不可混用，原回调及落地地址绑定继续生效。
- 修改回调分类后，原 Token 仍可退出；其他有效性检查保留。
- Secret、ORCAS 与旧配置迁移统一采用新分类。
- 旧 Code、续接和 Token 保留原用途，切换不清空会话；旧 business 兑换和新 managed 授权均有行为证据。
- 通过真实浏览器与代理验证业务域名回调在该主机写入 Cookie，固定回调及最终跳转正确。

业务域名代理到 IAM 的实际部署由管理员负责，沿用 Q1；本轮讨论和后续自动化测试不代表已修改目标环境代理。

## 实施与验证

在线授权、回调、Admin Secret 和旧配置迁移复用 Domain 的路径判定；原 origin 白名单注入已删除。
退出移除当前 callback 分类比较；授权清理配置 query 中的 `state`，协议值由授权事实决定。
旧迁移 manifest 移除两项 origin/URL 列表，具体格式与保留状态升级说明见
[统一维护手册](../releases/unified-session-maintenance.md#显式回调类型的保留状态升级)。

2026-09-16 在任务独占 Redis 8.8.0、PostgreSQL 18.4 和 Chromium 下完成：

- 受影响五个 workspace（Domain、Custom SSO、API、Admin API、Worker）的 Unit 与 typecheck 全部通过。
- `pnpm --filter @iam/api test:integration:redis`：281 项通过，包含双协议原有回归与新增托管/旧产物/退出场景。
- `pnpm --filter @iam/api test:integration:component`：218 项通过。
- `pnpm --filter @iam/api test:integration:browser`：4 项通过；业务 `localhost` 代理真实 IAM `127.0.0.1` 回调，
  证明固定 query、原 state、最终跳转与 host-only Cookie。代理为真实 HTTP 测试代理，不证明生产 APISIX 路由已部署。
- Admin PostgreSQL `client-sso-management.integration.test.ts`：19 项通过；业务域托管不新建 Secret，已有 Secret 保留。
- Worker PostgreSQL `client-sso-upgrade-command.integration.test.ts`：8 项通过；数据库收缩命令另 1 项通过。
- `pnpm verify:static` 与 `git diff --check` 通过；未执行合入阶段的全仓 `pnpm verify` 或目标环境部署。

首次回归暴露旧退出拒绝和旧业务同名 callback 的断言冲突，已按新契约修订后重跑通过；没有将失败视为基线豁免。

## 恢复点

目标分支 `main`，讨论基线 `66c5c42f`，功能分支 `codex/custom-sso-callback-path`。
Q1=A、Q2=A、Q3=取消、Q4–Q8=是已确认。维护者已确认整体设计并调用 `implement`；在当前功能分支直接实施，
先独立提交设计文档，完成约定验证及双轴评审后提交实现。未授权合入或部署。
