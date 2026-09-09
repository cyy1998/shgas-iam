# 旧 Custom SSO Grant 定向维护

Status: Current

Last verified: 2026-09-09

Next review: 2026-10-31

本手册交付 [#160](https://github.com/cyy1998/shgas-iam/issues/160) 的维护入口，适用于
[Spec #157](https://github.com/cyy1998/shgas-iam/issues/157) 的一次消费切换。代码候选不等于环境已切换；
目标环境操作尚未执行。统一消费者版本、受控 smoke、回退和放流沿 [#161 组合升级手册](custom-sso-one-shot-grant-upgrade.md) 执行。

## 窗口与资源前提

仅在**旧 Grant writer 已停止、旧请求已排空、新 Grant writer 尚未启用**的窗口运行全部三条命令。阻断 Custom SSO
authorize、Independent token、Gateway callback 的公开与直连入口、重试来源、后台及人工 writer；核对所有副本和自动恢复模板。
仅设置 Client Maintenance 或等待一个固定 TTL 不构成停止和排空证据。发布 owner 保存实际副本、在途请求、停止时间和确认结果。
命令参数只记录操作者已确认这些前提，不会自行证明或实施停流。

固定源版本、候选 commit、维护镜像、精确 Redis primary/逻辑 DB，以及所有 API/OIDC/cleanup 消费者实际使用的 Kernel namespace。
源版本须符合当前 Kernel 对象版本和旧 redemption v1 契约；更早 namespace 或不兼容备份须另行处理。多套 Redis/namespace
分别留证，不用默认 namespace 的零报告代表其他目标。源对象不带区分新旧兑换契约的版本字段，故本命令匹配所有
`custom-sso/auth_code` Artifact；**新 writer 启用后不得把它作为日常清理任务运行**，否则会使新 Grant 同样失效。

使用固定候选 checkout、Node.js 24、仓库 pnpm 和已安装依赖。该入口不读取 `.env`，不回退 runtime 默认值。
由受控运维环境显式注入：

```text
IAM_OIDC_PROVIDER_REDIS_HOST=<精确 primary host>
IAM_OIDC_PROVIDER_REDIS_PORT=<精确 port>
IAM_OIDC_PROVIDER_REDIS_DB=<精确 logical DB>
IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE=<实际 namespace>
IAM_OIDC_PROVIDER_REDIS_PASSWORD=<需要认证时注入>
```

命令不支持任意 pattern，namespace 中的 Redis glob 字符被拒绝；尾部冒号由 Kernel owner 规范化。关闭凭据回显、shell transcript
和原始调试输出，不把 URL、完整 Redis key、Code、bearer、Cookie、主体资料或密码写入验收记录。

连接账号按实际命令授权。只读 inventory/verify 只使用 `SCAN`、`GET` 和连接管理所需的 `AUTH`/`SELECT`/`INFO`/`QUIT`/`CLIENT`；
apply 额外需要 `EVAL` 以及脚本内的 `GET`、`TYPE`、`DEL`、`ZREM`。命令不会连接 PostgreSQL、HTTP、队列或外部注销服务。
默认总 deadline 五分钟、连接和单次命令 timeout 五秒；信号和 timeout 令流程非零并断开连接。

## 目标与保留范围

| Owner | 发现与处理 | 不属于本命令的范围 |
|---|---|---|
| `@iam/session-kernel/maintenance` | 直接扫描实际 namespace 的 Artifact `active:a:`、`revoked:a:`、`lookup:a:`、`revoked_lookup:a:`，不依赖 client/protocol/parent 索引。按 owner parser 校验版本、identity、用途归属，选择 Custom SSO `auth_code` 的 active 和 tombstone；原子比较本次观察的四个关联值后删除，精确移除该 Artifact 的已知索引成员。 | Principal、Binding、Credential、其他协议/用途 Artifact；不执行全 Kernel namespace 删除、跨协议级联或任意 cleanup ref。 |
| `@iam/custom-sso/maintenance` | 直接扫描 `authorization-grant:redemption:v1:`，严格解析 issued/redeeming/consumed 和 key/record identity，按完整已观察值 CAS 删除，包括没有 Artifact 的孤立 redemption。 | 不读取或重建旧 lease，不恢复已消费 Code，不签发 Credential。 |
| OIDC maintenance runtime | 组合上述两个窄 owner，管理独立命令进程、连接和安全报告。 | 不删除 OIDC protocol store、Provider Session、Client 配置或推进任何协议 epoch。 |

未知版本、损坏 payload、identity 不符、没有可确认 authority 的 lookup、冲突 active/tombstone、错误类型索引或比较失败均保留并
报告非成功。无法判定归属时不扩大删除。只有携带合法完整 tombstone 的孤立 revoked lookup 可以独立确定其归属。
同一轮已尝试的 Artifact identity 不因后续 lookup 扫描而重新选择；replacement 保留，随后保持停流核对 writer 原因。
自然过期或并发变化造成比较失败也按失败处理，由新一轮观察确认，不能推定成功。

索引不是 authority；本命令只移除已确认目标的精确成员，不全清索引，也不声称回收全部孤立历史索引成员。
仅孤立索引成员不能恢复 Code。旧 Artifact cleanup ref 不被当成任意可执行任务；旧 redemption 在第二 owner 阶段独立清理。
两 owner 之间没有事务，前一 owner 失败不反转已完成作用，后一 owner 仍可处理自己的合法目标。

有效 Principal、已签发 Independent/Gateway Credential、非目标 Artifact、OIDC Binding、Code、Token、Provider Session 和
其 lookup/index 是保留集。根期限、Credential 续期策略、Subject Access、Runtime Snapshot、Profile/Facts、队列、Login Restriction、
PostgreSQL 和其他 namespace 保持原职责。不得用 `online-auth:state`、全库/namespace 清空或 epoch 推进代替本命令；
旧 [Redis 时间切换手册](online-auth-redis-time-cutover.md) 的全清及回退步骤不适用于本次维护。

## 执行与独立核验

1. 发布 owner 在窗口内取得保留集的受控基线：有效 Principal、两种已签发 Custom SSO Credential、OIDC Binding/Code/Token/
   Provider Session 的身份与 owner 归属、持久值摘要和绝对 expiry，以及必要的 lookup/anchor 完整性。原始凭据仅由测试人受控持有，
   发布记录只保存安全对照结论。需要自然到期的对象单列，不以总 key 数相等或扫描数量证明保留。
2. 三条命令分别在新进程运行，同一固定候选和同一精确资源；保存安全报告、开始/结束时间和退出码：

   ```bash
   pnpm --filter @iam/oidc-provider custom-sso:grants -- inventory --writers-stopped
   pnpm --filter @iam/oidc-provider custom-sso:grants -- apply --writers-stopped
   pnpm --filter @iam/oidc-provider custom-sso:grants -- verify --writers-stopped
   ```

   inventory 完整扫描且没有无法判定项才 `passed`，存在合法目标本身不使 inventory 失败。apply 的 `passed` 只说明本轮尝试完成，
   不能放流。独立 verify 使用新连接，仅注入 `SCAN`/`GET`，重新扫描全部目标；完整扫描、零目标且零失败/未验证才 `passed`。
3. **退出码 0、完整报告且 `status=passed` 必须同时满足**。报告中 `kernel`/`grants` 分别记录 `targets`、`removed`、`failed`、
   `unverified` 与 `scanComplete`；Grant 另计三种已解析状态，Kernel 的 `retained` 仅为已分类非目标观察数。
   `targets` 是去除重复 SCAN key 后的目标记录观察数，Artifact 与 lookup 可能各计一次，不能当作独立 Code 数；
   `removed` 是确认成功的清理操作数，响应丢失会少计已提交作用。计数相减不能证明剩余库存。
   扫描/连接/退出失败或报告缺失均非成功；启动失败的报告明确 `unverified=true`，不提供虚构成功计数。
4. 每份报告的 `preservation=requires_independent_baseline_comparison` 明确保留集尚需外部对照；目标 verify 不声称已验证会话保留。
   发布 owner 用独立连接或正式 owner 只读入口对照第 1 步基线，确认持久值与绝对 expiry 没有被本次维护改写，逐项记录自然到期。
   保留集无法核对或异常时保持停流，不自动降级成全量登出。
5. 保留集对照和目标 verify 都成功后，才移交统一版本和受控 smoke 阶段。零目标证据必须早于新 writer 和 smoke 创建新 Grant；
   后续创建的新 Grant 合法存在，不能再要求扫描结果为零。旧 Code 拒绝、同根重新授权和既有凭据访问由组合手册分别验收。

## 失败、重跑和能力退役

任一阶段失败，保持流量关闭、旧 writer 停止、新 writer 尚未启动。保留安全报告，核对精确目标、ACL、连接、超时、对象格式与
意外 writer；不要在发布日志粘贴原始 payload 或错误。只有 owner 能确认的数据问题才按另行批准的修复处理；未知状态不由本工具猜测删除。
修复后用同一固定候选从 inventory → apply → 新进程 verify 重跑，再重新对照保留集。重跑从实际库存开始，没有队列、持久恢复日志、
后台 executor 或旧 Code 复活。发生 Redis failover、恢复旧备份或 writer 意外启动时，重新核对窗口和资源，不能复用旧零报告。

已删除 Grant 不可恢复。不能用恢复 Redis 快照找回旧 Code，也不能通过启动旧兑换 writer 把失败重跑变成混跑。
需要回退版本时按[组合升级手册](custom-sso-one-shot-grant-upgrade.md)固定整体回退边界，本手册不授权全清现存会话、部署或放流。

旧三态 decoder、maintenance CAS 与 `/testing` fixture 仅用于本次迁移仍有真实库存的环境；owner 为 Custom SSO/Kernel 维护者。
2026-10-31 复核所有适用环境是否已有目标清零、保留对照与切换记录，以及旧备份是否已禁止直接恢复；全部确认后另行变更退役该入口
及专用 fixture/测试。没有建立永久历史版本词典、双读开关或旧名称 Guard。

自动化证据位于 [真实 Redis 维护测试](../../apps/oidc-provider/test-integration/redis/custom-sso-grant-maintenance.integration.test.ts)：
正式 owner 构造和观察证明定向失效、无索引库存、三态及孤立记录、replacement/CAS、未知数据保留、部分失败重跑、真实 CLI 非零门禁，
并用 Redis ACL 拒绝 `EVAL` 的只读账户完成核验。混合库存对 Principal、两 Credential、OIDC Binding/Code/Token/Provider Session
逐对象比较持久值与绝对 expiry。这些证据不证明目标环境停流、生产崩溃、实际部署或外部 ORCAS 状态。
