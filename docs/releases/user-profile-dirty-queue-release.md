# User Profile Dirty Queue 发布手册

Type: runbook
Status: Current
Last verified: 2026-07-25
Next review: 2026-10-31

## 适用范围

本手册用于退役 user-profile 队列中的旧 `expand-user-profile-scope` 协议，并按 worker-last 顺序发布当前
`UserProfileInvalidation` 实现。当前 `rebuild-user-profile` queue name、payload、`dirtyVersion` 和 deterministic
job ID `rebuild-user-profile|<userId>|<dirtyVersion>` 保持不变；新 worker 已删除旧 scope job consumer，因此发布前必须
证明所有旧 producer 已停止且旧 job 已排空。

事实来源包括 `packages/contracts/src/jobs/user-profile.ts`、`packages/user-profile-read-model/src/` 及其测试、
`packages/jobs/src/queue.ts`、`apps/worker/src/env.ts` 和本手册。本文只定义可审核的发布门禁；本地实现不会执行生产
队列清理、部署或 rollback，也不提供会自动删除 job 或 repeatable registration 的脚本。

## 硬阻断条件

出现以下任一情况时，立即停止发布，不得启动新 worker：

- 任一旧协议 producer 未识别、未停止，或无法证明已经停止。范围包括仓库外服务、旧部署实例、一次性脚本、定时任务和
  repeatable registration；“当前仓库搜索不到 producer”不是生产证据。
- user-profile 队列中名为 `expand-user-profile-scope` 的 waiting、delayed、active 或 failed job 任一不为零。
- 名为 `expand-user-profile-scope` 的 repeatable registration 任一不为零。
- 队列不可访问、查询只覆盖部分分页、证据没有时间戳，或无法证明查询使用了与 production worker 相同的 Redis DB、
  queue name `user-profile` 和 prefix（当前默认是 `iam`）。
- API 或 Admin API 发布后仍有旧版本实例存活，或观察到新的 `expand-user-profile-scope` job。

未知状态按非零处理。不得用“应该为空”、总 job count、抽样页面或只查看 waiting 来替代五类明确证据。

## 发布前准备

1. 记录 API、Admin API、Worker 的候选构建版本或 commit，确认三者来自同一变更集。
2. 建立旧 producer inventory，至少列出 owner、运行位置、版本、触发方式、停止动作、停止时间和证明链接：
   - API 与 Admin API 的全部旧 deployment/replica；
   - 仓库外 producer 和仍在运行的旧服务；
   - cron、one-off command、运维脚本和手工 enqueue 入口；
   - user-profile 队列的 repeatable registration。
3. 准备可以独立发布 API、Admin API 和 Worker 的维护窗口。旧 worker 必须在 producer 切换和排空期间继续运行。
4. 确认可以只读访问 production Bull Board 或经批准的 BullMQ inspection client。production Bull Board 必须启用
   Basic Auth，默认保持 `IAM_WORKER_BULL_BOARD_READ_ONLY=true`。
5. 在候选内容上完成 package-local process smoke：

```bash
pnpm --filter @iam/api test:smoke
pnpm --filter @iam/admin-api test:smoke
pnpm --filter @iam/worker test:smoke
```

## 停止并证明旧 producer 已停止

1. 先停止仓库外 producer、one-off/cron 入口和旧 repeatable producer，并保存平台状态、owner 确认和时间戳。repeatable
   registration 仅暂停调用方不足以满足门禁；最终队列检查必须证明旧 registration 已不存在。
2. 发布 API，等待 rollout 完成并证明全部旧 API replica 已停止。使用正常业务流量或经批准的 source-change smoke，
   对比发布前后的队列证据，确认 API 只产生 `rebuild-user-profile`，没有新增旧 job。
3. API 证据通过后再发布 Admin API；同样证明旧 Admin API replica 全部停止，并确认没有新增旧 job。
4. 再次核对 producer inventory。只有每一项都有“已停止”证据，且 API、Admin API 均不再产生旧 job，才进入队列排空。

这一阶段不得停止旧 worker；它需要继续处理已经存在的合法旧 scope job。

## 检查并排空旧 job

对精确 job name `expand-user-profile-scope` 分别记录以下结果：

| 类别 | 当前 BullMQ 5 inspection API | 通过条件 |
|---|---|---:|
| waiting | `queue.getJobs("waiting", 0, -1, true)` | 0 |
| delayed | `queue.getJobs("delayed", 0, -1, true)` | 0 |
| active | `queue.getJobs("active", 0, -1, true)` | 0 |
| failed | `queue.getJobs("failed", 0, -1, true)` | 0 |
| repeatable | `queue.getRepeatableJobs(0, -1, true)` | 0 |

`queue` 必须连接 production worker 使用的 Redis DB、`user-profile` queue 与相同 prefix。下列片段只说明只读检查逻辑，
不是环境专用脚本；connection secret 必须通过现有受控方式注入，不得写进仓库或 shell history：

```ts
const legacyName = "expand-user-profile-scope";
const states = ["waiting", "delayed", "active", "failed"] as const;

for (const state of states) {
  const jobs = await queue.getJobs(state, 0, -1, true);
  const legacyJobs = jobs.filter(job => job.name === legacyName);
  console.log({ state, count: legacyJobs.length, jobIds: legacyJobs.map(job => job.id) });
}

const registrations = (await queue.getRepeatableJobs(0, -1, true))
  .filter(job => job.name === legacyName);
console.log({
  state: "repeatable",
  count: registrations.length,
  keys: registrations.map(job => job.key),
});

await queue.close();
```

若 production inspection tool 强制分页，必须遍历到最后一页并保存每页范围；不得把第一页为零当作全队列为零。处理非零项时：

- waiting 由旧 worker 正常消费；
- delayed 等待到期，或按既有变更流程决定是否在 Bull Board 中 promote；
- active 等待旧 worker 完成，不要为追求零计数强杀；
- failed 必须由业务 owner 决定 retry、修复或显式处置，不能静默删除合法工作；
- repeatable registration 必须先追溯并停止其 producer，再按 production 变更流程移除 registration。

任何 Bull Board retry、promote、remove 或 clean 都是独立的 production 运维动作：只允许在批准的维护窗口内临时使用
`IAM_WORKER_BULL_BOARD_READ_ONLY=false`，并限定 user-profile 队列和已确认的旧 job。本文不授权自动清理，不得清空
其他队列，也不得删除 `user_profile_dirty` 中的 pending/failed 事实。

## Worker-last 发布顺序

1. 保持旧 worker 运行，直到 waiting、delayed、active、failed 和 repeatable 五项第一次全部为零。
2. 保存第一次零值快照及查询时间，再停止全部旧 worker，等待进程和 active job 完整退出。
3. 在旧 worker 已停止、API/Admin API 仍为新版本的条件下，重新执行 producer inventory 与五项查询。
4. 只有最终复核仍全部为零，才能发布并启动新 worker。
5. 启动后确认日志中的 enabled modules 包含 `user-profile`，再执行 health、Bull Board 和 rebuild smoke。

如果最终复核出现任一旧 job，或出现新的/未知 producer，保持新 worker未发布；恢复到可处理旧协议的 worker 方案前必须由
发布 owner 明确决策，处理后从 producer 证明步骤重新开始。

## 发布后 smoke 与现有恢复操作

- Worker health：

```bash
curl -fsS http://localhost:30016/healthz
```

- 打开 Bull Board；开发 compose 默认入口为 `http://localhost:30016/admin/queues`。确认能看到 user-profile 队列；
  dashboard-only service 使用 `IAM_WORKER_ENABLED_MODULES=none`，不得消费 job。
- 触发一条经批准的 source change，确认 after-commit enqueue 的 job name 是 `rebuild-user-profile`，job ID 形如
  `rebuild-user-profile|<userId>|<dirtyVersion>`，并且没有旧 scope job。
- 查询 worker 日志，确认完成、跳过、stale 或失败记录包含 `userId`、`dirtyVersion`、`jobId`、`jobName` 和结果状态。
- dirty wake-up 丢失或 enqueue 失败时，修复依赖后运行现有 repair：

```bash
pnpm --filter @iam/worker user-profile:repair
```

  repair 只按 dirty row 的当前 `dirtyVersion` 重投 rebuild job，不推进版本。它不能替代旧 scope job 的五项排空证据。
- 只有需要主动全量重建且容量窗口已批准时才运行 backfill：

```bash
pnpm --filter @iam/worker user-profile:backfill
```

  backfill 会创建新的 Backfill dirty fact、推进 `dirtyVersion` 并增加队列压力，不是 no-op。

## 中止与 rollback 边界

| 场景 | 处理方式 | 门禁影响 |
|---|---|---|
| producer 无法证明已停止 | 保留旧 worker，停止后续发布并补齐 inventory | 不得进入队列排空结论 |
| 旧 job 任一类别非零 | 保留旧 worker，按 owner 决策处理并重查全部五项 | 不得发布新 worker |
| API/Admin API rollout 后又产生旧 job | 停止后续 rollout，定位残留旧实例或仓库外 producer | producer 与队列证据全部失效 |
| 新 worker 启动后发现旧 job | 停止新 worker，按已批准方案恢复兼容 worker 并调查来源 | 从 producer 证明步骤重新开始 |
| API 或 Admin API rollback 到旧版本 | 明确把它视为旧 producer 重新启用 | 先前零值证据失效，不得继续 worker 发布 |
| rebuild enqueue 失败或 job 丢失 | 修复依赖后运行 `user-profile:repair` | 不改变旧协议排空门禁 |

Rollback、部署、retry、remove、clean 和 repeatable registration 变更都由 production 发布 owner 单独授权和执行，不属于
本地实现动作。回滚后重新执行 health、Bull Board、producer inventory 和五项队列检查；不得用 repair 或 dirty fact
存在来推断旧 scope work 已安全处理。

## 证据清单

发布记录至少保存：

- 三个候选构建版本和 API → Admin API → Worker 的实际发布时间；
- 完整 producer inventory，以及每个旧 deployment、仓库外入口、cron/one-off 和 repeatable producer 的停止证明；
- API 与 Admin API rollout 后“不再产生旧 job”的观察证据；
- 停止旧 worker 前与停止后的两组 waiting、delayed、active、failed、repeatable 零值结果，包含查询工具、分页范围、
  Redis DB/queue/prefix 标识和时间戳；
- 旧 worker 停止、新 worker启动、health、Bull Board、rebuild job 与日志 smoke 结果；
- 期间执行过的任何人工 retry/promote/remove/clean、repair、backfill 或 rollback 的 owner、理由和审计链接。
