# 测试编排架构

本文说明测试收集、执行、缓存与资源生命周期。测试分类和编写规则见[测试规范](../development/testing.md)，
命令与参数见[开发命令](../development/commands.md)。Collection 是一个 runner 拥有的测试集合，owner 是维护它的 app、package 或 root 工具。

## 收集与编排

每个测试候选只由一个 collection 收集。各 owner 持有 runner、窄目录配置、fixture 和 setup，仓库不建立跨 package 的
Vitest workspace 或共享 setup。同一 owner 的非浏览器 Integration 只选 Bun 或 Vitest，浏览器由 Playwright 收集。
Admin/SSO 的 Node 与 DOM Unit 在各自单个 Vitest 进程中运行，规则见[路径与命名](../development/testing.md#路径与命名)。

正常业务状态由生产模块建立，破坏变体与状态观察使用 owner 的 `/testing`；消费方不手写协议 key、Lua 或序列化。
维护命令属于生产操作，不因存在测试就成为 collection。真实命令行为由子进程 Integration 验证。

### Root 与 package commands

Turbo 是唯一跨 package 编排器。Root 聚合 Unit，统一准备 Integration 资源，并把完整 E2E 交给 `e2e/system`。
Root Integration 与 package runner 共用 manifest 的 `iamTest.integration` 声明，以 workspace 和执行器选择资源。
单文件筛选仍使用该资源集合，空声明不启动 PG/Redis。内部 runner 只消费本次环境，校验 run ID、记录和完整内部 URL。

资源测试只从正式根入口运行，不接入任意外部 URL 或另建第二套环境。每条命令独立创建环境，可与其他命令并行，
不跨命令复用数据。错误参数、无匹配、缺少条件或首个失败均非零退出，不 skip、自动 retry 或回退环境。
Unit 支持 package-local 执行，E2E 单旅程入口保留用于调试；具体命令由命令页维护。

### 测试收集维护

新增用例维护路径、命名和唯一归属，不登记逐文件清单。修改 include/exclude、Vitest projects 或 workspace scripts 时，
核对 root Turbo 接线并运行受影响 owner 的测试。收集成功不自动证明没有漏收或重复，取舍见
[ADR-0009](../adr/0009-adopt-canonical-test-collections.md)。

### Turbo task graph 与缓存

测试通过 `transit` 传播依赖源码变化，不用 `^test` 执行依赖包的测试。Unit 仅在输入、环境、fixture、时间和随机性可重现时缓存；
Integration 与 E2E 禁用缓存。仓库配置、runner 和资源工具的变化须进入相关输入。
Gateway Unit 使用包内合成 manifest 样例，由默认 workspace inputs 跟踪，不读取调用方部署配置。

Strict env 仅透传 owner 所需的内部地址、run ID、记录、筛选及工具路径；进程归属 marker 只透传、不计入 hash。
Root typecheck 包含工具测试和相关源码。任务定义见[turbo.json](../../turbo.json)。

## 并发、timeout 与清理

预算由根入口与 runner 统一执行，不在各 manifest 重复填写。Unit 允许有界并发；同一 Integration 环境的套件和用例串行、首错停止；
浏览器与 E2E 使用单 Chromium、单 worker、零 retry。用例内部为验证竞态而建立的并发保留。当前数值以 runner 配置为准。

Timeout 防止挂起，不作为性能 SLA。进程使用真实 readiness，并同时观察退出与错误；输出有界，在成功、失败、超时和中断时清理所属进程树、端口和临时目录。
不能以放宽全局 timeout、重试或吞掉 cleanup 错误换取通过。

### 专用资源与隔离

Root 资源管理模块用 Compose 创建可销毁环境，按声明只启动需要的 PG/Redis，通过动态 loopback 端口访问。
创建前登记唯一 run ID、准确 project、配置与产物位置，记录路径相对仓库解析；浏览器 web server 仍由 package harness 管理。
正式测试不使用开发或生产资源。

首个断言、setup、teardown、重置失败或 timeout 后停止启动后续用例。先终止并等待所属测试进程树，再用独立有界预算采集诊断、
清理准确 project。部分初始化失败和可捕获中断走同一出口，原始与清理失败均保留。
默认清理容器、网络及数据卷，保留日志和记录；显式 keep 或异常残留按记录恢复，不按前缀猜测目标或全局 prune。

辅助诊断采集失败只告警并继续清理；初始化、readiness、必需输入、断言证据、进程关闭、数据重置或环境清理失败均使命令非零。
资源生命周期的完整故障验证集中在
[根资源测试](../../scripts/test-integration/resources/managed-resources.integration.test.ts)，消费方另证真实接线。

AFK 使用同一根入口和每命令生命周期。外层须确认 sandbox 已停止，再按 registry 清理，尊重 keep；无法确认时保留恢复记录。
宿主访问与恢复操作见[AFK 工作流](../agents/sandcastle-afk.md)。

### Fixture 与数据重置

PostgreSQL 使用随机 schema、专用连接及整体删除，Admin 注入生产 UnitOfWork 的事务绑定连接，不回退全局数据库实例。
Redis 完成业务观察后先停止本例全部 consumer、子进程和连接，再对本次独占 DB 执行 `FLUSHDB`，控制连接最后关闭。
任一停止失败都禁止 reset，继续尝试其他收尾并汇总失败；禁止 `FLUSHALL`。

非目标数据保护、只读行为和生产关闭必须在 reset 前观察，普通 fixture 无需逐键登记清理或等锁自然过期。
Worker 保留生产连接防误用检查，不另设 cleanup URL 或跨环境推断 Redis 身份。共享连接的取消只能作用于本次 owner，不能影响并行任务。

### 浏览器 harness 与产物

API 协议浏览器测试使用真实候选 API、动态 RP 和专用资源，不 mock IAM 协议请求。
父进程等待 HTTP server、子进程与连接结束后再重置资源，启动失败也收尾。
不同通道使用独立产物目录；固定协议套件使用调用方指定目录，避免被浏览器 runner 清空。

## Full-system E2E

`e2e/system` 拥有独立 project，从空卷开始执行 migrations、正式 runtime、合成 seed、Gateway 发布、旅程与清理。
镜像包含当前候选的配置和脚本，不依赖 daemon 挂载调用方 checkout。仅使用固定测试或本次生成的数据与凭据，不接入生产端点或真实 PII。

### 初始化与就绪

1. Preflight 使用独立 deadline，在资源与 descriptor 创建前失败退出。
2. Descriptor 落盘后先写未尝试迁移的 receipt，再准备 project 内诊断工具与资源；诊断阶段不临时构建，不公开 APISIX Admin host port。
3. Migration receipt 区分未尝试、已尝试、完成与安全失败，不保存原始错误或环境。
4. Seed 通过生产领域能力建立并回读状态，经真实 Worker 收敛，在 Gateway HTTP 发布前执行 PG、Facts 与访问屏障门禁。
   核对 rendered Compose 中各入口的 canonical origin；导出必要 seed receipt 后才删除 seed 容器，缺失或导出失败阻断旅程。
5. 协议 readiness 校验 discovery 各端点及 issuer 的 canonical origin，Custom SSO 两入口配置也须匹配；随后执行浏览器 preflight。

Receipt 只含阶段、时间、安全失败类别或本次公开引用，不保存凭据。具体流程见[e2e/system](../../e2e/system/)。

### 旅程编排

同源旅程在同一 project 中依次运行 Admin、HR、OIDC，经正式前后端观察行为，不用 `page.route` 替代仓库核心服务。
任一失败先采集诊断再清理，cleanup 失败同样阻断通过。

### 双入口验收与产物隔离

完整 collection 在同源基线后，以两个不同 hostname 启动独立 project，复用 migrations、seed、readiness 与正式 APISIX。
双入口文件也纳入基线 selector，独立阶段只运行该文件。通过正式发布接口设置并回读受控 Host rewrite，再验证两协议、Cookie 域隔离及伪造入口拒绝。
测试不改生产 manifest，独立 RP 与固定套件的职责见[验证选择](../development/testing.md#验证选择)。

### 失败诊断与清理

Descriptor 建立后的失败、timeout 和可捕获 signal 统一进入诊断与 cleanup。各诊断源有独立期限，收集已有产物和失败说明；
必需 seed 输入与断言证据不属于可忽略的辅助诊断。
日志和浏览器产物有数量与大小限制，路径越界、symlink 或移动失败告警。原始 trace、截图和视频保留，metadata 不替代原文件。
诊断可能包含合成凭据，以产物目录的访问权限和保留期保护，不宣称内容已经脱敏。

Cleanup 对准确 project 执行清理，禁止模糊扫描、全局 prune 或另行枚举 image IDs。
失败保留 descriptor，显式恢复沿同一记录。进程管理在 Windows 使用 Job，在 Linux 按继承的归属 marker 回收含 detached 后代的进程。
退出与清理均有界，异常收尾不以全部资源 inventory 为零作为硬门禁。命令见
[E2E 入口](../development/commands.md#full-system-e2e)。

## 默认验证与交付

聚合验证只顺序组合各 owner 命令，首错停止，不复制资源配置、preflight 或清理逻辑。
基础 verify、CI 和 release 组合范围见[聚合验证](../development/commands.md#聚合验证)，
结论的适用范围见[验证结果与交付](../development/testing.md#验证结果与交付)。
