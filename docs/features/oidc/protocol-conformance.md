# 固定 OIDC 套件与独立 RP 验证

本记录对应 [#195](https://github.com/cyy1998/shgas-iam/issues/195)，供 #196 复用。实际生产源码固定为
`1ccdeddc54eef8be7ba3b97769e911d028ef3823`；本票只新增验证驱动、夹具、开发依赖和证据，没有修改生产源码。
验证发生在 2026-09-15 的独占本地环境，不表示官方认证、真实接入方部署或生产发布。

## 结果与证据

[逐模块矩阵](conformance-results.json)完整登记 Basic 38、Config 1、RP-Initiated Logout 11 和 Public 补充 9，
共 59 项：本地通过 46、不适用 13、失败 0、未执行 0。原始官方结果与本地判读分开保存：

| 官方结果 | 数量 | 本地处理 |
|---|---:|---|
| PASSED | 32 | 通过；保留原 plan/module ID、variant、run 和日志摘要。 |
| WARNING | 4 | 通过但有下述明确兼容边界，不称无警告。 |
| REVIEW | 10 | 保留 REVIEW；实际查看每张 PNG 与模块要求，另记本地通过。 |
| SKIPPED | 6 | 按实际 Discovery 与官方条件逐项记不适用。 |
| 未创建 | 7 | 3 项明确超范围；4 项被官方 static_client 变体排除。 |

原始材料位于本机 `apps/api/test-results/conformance-195/`，不提交生成的 Token、凭据、JWK 或截图。
`run6` 提供 Basic/Config/Logout 的主体证据；`run7` 只补重新配置后的 bad-id-token-hint 和 Public。
每个 run 保存实际 `environment.json`、`driver-input.json`、原始 plan JSON、每模块 event log、截图及对应
`*-requirement.json`。矩阵记录日志 SHA-256 和本地路径；这些材料未上传外部，不冒称可从远端仓库下载。
完整源码模块清单见 [固定来源清单](conformance-suite-modules.json)。

四项 WARNING 的具体边界：

- `oidcc-scope-profile`、`oidcc-scope-phone`：`VerifyScopesReturnedInUserInfoClaims` 提示没有返回该标准 scope
  的全部可选资料字段；保留当前 name、preferred_username、phone_number 映射，不补造用户事实。
- `oidcc-ensure-request-with-acr-values-succeeds`：`ValidateIdTokenACRClaimAgainstAcrValuesRequest` 提示未返回 acr。
  请求仍成功；不据此新增认证级别、MFA 或再次认证。
- `oidcc-discovery-endpoint-verification`：`OIDCCCheckDiscEndpointClaimsSupported` 提示未提供推荐的
  `claims_supported` 元数据；其他 Discovery、HTTPS endpoints、issuer 与 JWKS 检查通过。

六项官方 SKIPPED 分别为 email、address、all scopes、alternate-happy-flow（实际 Discovery 不支持其要求的范围），
unsigned-request-object（请求对象关闭）和 refresh-token（未声明 refresh grant）。矩阵中的 `conditions` 保留具体
官方条件和原因。scope-profile、scope-phone、claims-essential、安全 redirect 和其他参数检查照常运行。
`claims-essential` 成功不表示实现 claims 参数：该参数按现有约定忽略，UserInfo 仍按当前 Client 范围披露。

未创建项为 client_secret_post 成功、prompt-login 再次认证、max-age=1 再次认证，以及官方
`@VariantNotApplicable(ClientRegistration=static_client)` 排除的 Basic signature/unsigned/request-uri-unsigned
和 Public signature。signature 模块要求动态注册时验证默认签名算法；普通 server 测试及独立 RP 仍实际验证
ID Token 签名、issuer/audience/nonce，不能把专门模块不适用误写为没有验证签名。
不为这些项目新增动态注册、Secret 认证方法、refresh、重复认证或退出通知。

## 截图与独立 RP

十张实际截图全部逐张查看，矩阵的 `localReview` 保存对应模块与条件：

- 两项授权安全 redirect、错误/加 query 的退出 redirect、alg:none hint、缺 hint、伪签 hint 共七张，
  实际显示对应 `invalid_request` 本地错误；页面未转向不安全 callback。
- NoParams、OnlyState、NoPostLogoutRedirectUri 三张在点击确认并到达本地退出完成页后采集，未拿确认页补位。
  完成页文字只表达请求结束，故另由下述独立 RP 检查同类参数下原 Access Token 的 UserInfo 拒绝；不声称官方原模块
  自己执行了这项新增断言。

独立实现使用固定 `openid-client@6.8.1`（锁定 oauth4webapi/jose），测试位于
`apps/api/test-integration/composition/oidc-rp.integration.test.ts`。Public 与 Confidential 分别完成四种退出参数组合：
normal、无参数、仅 state、仅 id_token_hint，共八条真实生产 API 路径。库自身执行 Discovery、S256、state/nonce、
Code 兑换、启用 `enableNonRepudiationChecks` 的签名验证、标准声明及 UserInfo；退出后再次由库访问 UserInfo，
同步断言实际 rejection。该测试 128 次断言通过，未使用 `e2e/system` 的自家 RP helper。
浏览器登录门户 UI 的证据仍属于 #194；本驱动通过正式密码 HTTP、login-guard/resume 和真实 Cookie 完成认证续接。

## 版本与复现入口

官方 [release-v5.2.4](https://gitlab.com/openid/conformance-suite/-/tags/release-v5.2.4) 经 `git ls-remote` 核对为
`ab35a8df4864da35b49eff11483e204e01aa7961`。应用 [S256 补丁](conformance-suite-s256.patch)后，使用
Java 21.0.4、Maven 3.9.11 执行官方构建命令：

```text
git apply --unidiff-zero conformance-suite-s256.patch
mvn -B -Dmaven.test.skip -Dpmd.skip clean package
```

构建成功、Checkstyle 0 violations；这是构建时跳过 suite 自身单测/PMD，不表示跳过本记录的协议模块。
JAR SHA-256 为 `2fd8cd2b390f2edd1f33574b914169235d832e3b65f8dc274ba5deebaaa0d1e62`。
补丁只在 `iam_s256_required=true` 且 Code Flow 时调用官方 S256 sequence 并加入 token verifier；默认关闭。
专门 PKCE 正负用例基类与 valid-pkce 模块保留原请求构造，不修改官方验证断言。

套件使用官方 Compose 指定的 `mongo:6.0.13`；本次 JVM 开启原生 HTTPS、显式合成 PKCS12、loopback 随机端口和
`fintechlabs.devmode=true`，不依赖外部 OAuth 登录。候选 API 在 Bun 1.3.14 独立进程运行正式 composition，使用完整
Drizzle migrations 的随机 schema、真实 PostgreSQL/Redis、合成账号和发布 Facts、公开 Subject Access bootstrap。
合成 TLS 反代不改协议参数或结果。Node 24 + `tsx@4.23.1` 拥有 Playwright Chromium 149.0.7827.55；
`NODE_EXTRA_CA_CERTS` 只给本次 Node 子进程信任显式证书，不修改机器 trust store。

调用方提供独占 `IAM_API_TEST_DATABASE_URL`、`IAM_API_TEST_REDIS_URL`，并启动固定套件及 MongoDB。
配置 JSON 包含 `suiteOrigin`、`outputDirectory`、`candidate` 和 `tls: { keyPath, certPath }`；
可选 `plans`/`modules` 只用于聚焦重跑，未选模块会明确记录 not_run。执行入口：

```text
pnpm --filter @iam/api exec bun run test-integration/composition/oidc-suite.fixture.ts <config.json>
pnpm --filter @iam/api test:integration:composition
pnpm --filter @iam/api test:integration:redis
```

fixture 拥有 API、TLS 反代、PG schema、Redis owner 清理和 Node 进程树；Node driver 拥有浏览器上下文与官方模块驱动。
每次登录现生成加密 credential；截图按官方 `upload` token 填充并核对实际返回的图像回执。
只向计划传可选 variant，固定 variant 由官方计划拥有；Public 使用官方非认证 `oidcc-test-plan` 的冻结九模块选择。
官方 REVIEW 使自动 driver 非零；必须单独完成图像判读与矩阵，不能把自动命令非零隐藏成 suite PASSED。

## 失败记录、验证与清理

预检与早期轮次原始日志均保留在本机 Temp 的 `iam195-*`：HTTP suite 启动被官方 HTTPS filter 拒绝；Bun 下
Playwright pipe/CDP 握手不完成，改用 Node；计划固定 variant 重复输入、对 FINISHED 模块 cancel、截图传错占位标识
均修正。bad-id-token-hint 首次因合成 Secret 31 字节不足官方伪签 HS256 所需 32 字节失败，换足长测试输入后仅重跑
该模块和 Public；其余 run6 结果按生产源码与直接路径未变化复用。未发现需要修改生产协议的失败。
CDP 预检已取得浏览器版本，但 cleanup 的 EBUSY 覆盖了原连接异常；原异常类型未保留，不将其写成确定的超时诊断。

本票完整 Composition 为 3 tests / 206 assertions，通过；完整 API Redis 为 202 tests / 1950 assertions，通过。
完整 API Unit 45 tests / 91 assertions、Component 215 tests / 720 assertions 通过。
Redis 首次在先前强制停止留下 21 个测试 key 的资源上触发现有 SCAN 页数断言，保留失败，未提高阈值；换全新空
独占 Redis 后重跑全部 202 项通过。API Redis 另外继续证明三种 response_mode、标准错误、PKCE 失败、CORS、故障与
退出等完整 owner 矩阵，不把这些能力改称官方模块已执行。

使用 Redis `docker.xuanyuan.run/library/redis:8.8.0`、PG `docker.xuanyuan.run/postgres:18.4` 和 Mongo 6.0.13。
全部四个临时容器（含空库重验 Redis）创建即记录完整 ID，已按各 exact ID 删除并确认不存在；JVM 与本次 API/Node/Chrome
进程树已停止。资源记录见本机 `apps/api/test-results/conformance-195/resources-cleaned.json`。
自动审批检查拒绝删除已退出 CDP 浏览器的 `C:/Users/caiyi/AppData/Local/Temp/iam195-chromium-6hEhKX`，原因
`blocked by policy`；保留该目录，不换工具绕过。未触碰既有 iam182 残留。

最终静态、类型检查及 focused commit 的 SHA 随 #195 验收评论记录。全仓 `pnpm verify`、最终成本对照与聚合账本由
#196 负责。环境停流、Secret 分发、迁移、放流、真实 ORCAS 作用、merge/push 和父 Spec 关闭均未执行。

## R1：中断期间的夹具资源生命周期

R1 的 Spec 轴无 finding，Standards 轴发现信号监听晚于候选初始化且早于候选清理结束移除。
修复仅涉及 conformance 夹具：最外层在读取配置与创建资源之前持续监听 SIGINT/SIGTERM；重复信号只记录中断，
不会恢复默认退出行为。每个资源返回后立即登记只执行一次的清理，再检查中断；即使工厂尚未返回 candidate，
其 catch 也会清理已取得资源。中断后不继续启动 Node 驱动。全部逆序清理尝试结束后才解除监听，单项清理最多等待
10 秒；超时和其他错误传播为失败，并继续尝试其他 owner，不将超时冒称已清理成功。

回归通过同一个 SignalSource 事件适配器，在 PostgreSQL 就绪、Redis seed 完成、API ready 和清理阶段发送重复信号。
这四项使用真实 PG/Redis/生产 API 子进程，验证 schema 集合与 key 数恢复、临时目录不存在、已启动 API 端口关闭，
并确认初始化中断不会到达驱动启动步骤；它们验证事件处理 owner，不冒称向 Windows 控制台注入了真实 Ctrl+C。
另有两项 Component 检查覆盖在途初始化返回后的登记、重复信号、保留原错误、清理错误及清理 deadline 后仍执行剩余项。
完整 Component 为 217 tests / 730 assertions，完整 Composition 为 7 tests / 236 assertions。
协议套件矩阵、独立 RP 语义及生产源码不变，复用上述 run6/run7 结果，不重跑官方套件。
