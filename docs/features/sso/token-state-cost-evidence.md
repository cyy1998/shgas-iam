# Token 状态原始基线成本证据

Status: Current

Last verified: 2026-09-10

Next review: 2026-10-31

[Spec #170](https://github.com/cyy1998/shgas-iam/issues/170) 原始基线为
`33305c0463747e535ccb8e1fc98b42efb598b954`，设计 `89c04cf9fdfe6dfc7786651a63f983177581d8b0`无runtime差异。
本页所有baseline数据重新从原始SHA运行，不使用 #171–#173 的阶段成本相加或推算。
候选production树为 `d945f5f721ada527a8c2e6600309a5d78aaf251a`，#176仅补行为断言和文档；固定最终候选完整SHA、
该树一致性核对和最终gate结果由 [#176](https://github.com/cyy1998/shgas-iam/issues/176) 评论记录。
完整验收项及人工边界见[最终账本](token-state-contract.md)。

## 方法与可比性

2026-09-10，Windows / PowerShell 7，Bun 1.3.14、Node 24.18.0、pnpm 11.14.0、ioredis 5.11.1、oidc-provider 9.9.1。
同一任务独占Redis镜像 `docker.xuanyuan.run/library/redis:8.8.0`，动态loopback 38288，PONG后使用。
源码由 `git archive`导出至独立目录，`pnpm install --frozen-lockfile --ignore-scripts`建立独立workspace依赖链接。
原始锁文件、package manifests和production源码保持不变；没有把候选node_modules软链给旧源码。
首次offline安装因本地store缺zod 4.4.3 tarball非零，随后按同锁文件联网安装成功；不是测试失败或豁免。
对原始2665个tracked文件用 `git hash-object --no-filters --stdin-paths`逐项比较树中的blob ID，只有下述两个观测测试文件不同；
额外复制一个Kernel cost测试。候选生产文件未回放或替换，基线与候选测试完全串行，测量窗口无其他测试访问此Redis。
采样后把基线目录完整移至仓库外 `D:/projects/iam-ticket-176-baseline-source`，避免Bun根测试按路径筛选时重复收集其中的测试。
首次root Unit因此出现第二份Playwright加载冲突；移出后原命令109/109通过。复现时也应在采样后移出基线目录再运行候选全仓gate，
或者从一开始使用仓库外的新目录并按同一锁文件独立安装；不要把基线源码留在候选扫描树内。

纯测试观测改动只有：API既有观测block加入iam根及局部根窗口和warmup/ECHO排空；OIDC既有UserInfo观测block加入Code兑换、
完整请求耗时和MONITOR排空；复制Kernel Artifact cost测试。实际fixture其他行为保留原始版本。
API基线4/4，OIDC聚焦2/2（其余82项未选择），Kernel局部1/1；候选相同采样入口通过。
候选另完整回归，不将聚焦skip算通过。

API使用正式Hono认证middleware和Custom SSO主体交付，经生产Kernel创建根及正式Custom SSO authorize/兑换取得凭据。
Barrier、Client/Gate、Facts是可控出站，Redis窗口只覆盖Kernel；Gateway authz是API正式authz入口，未经过真实APISIX代理。
ORCAS模式回归使用替身，未计入成本表，不证明真实ORCAS延迟、幂等或退出。
OIDC使用正式Provider HTTP Code→Token和AccessToken UserInfo、真实Kernel/Binding/协议store和主体缓存，
Client/Gate、账户/Facts来源是fixture出站。Code每次fresh签发在测量窗口外；UserInfo用同一正常token。
因此表中“HTTP”指该fixture全部请求，不是包含生产PostgreSQL/Barrier/Gateway/外部系统的总基础设施成本。

ioredis `sendCommand`记录每条客户端命令开始/完成；请求从调用到响应body读取完成计时。
MONITOR只保存命令名和client/lua来源，不记录key、token或payload。API/OIDC先warmup，再用ECHO排空MONITOR，串行五次。
Kernel Artifact代表窗口按原cost测试串行五次，无额外warmup，首样本如实保留。
连接、seed、Code签发、warmup、ECHO和cleanup不进入样本；EVAL内部TIME/GET/SET等不另算网络往返。
串行波次按命令开始/完成窗口计算；本次全部观察为串行，网络调用数等于波次。
RTT是客户端发送至完成的时长，含调度和Redis执行，不是纯链路延迟；五样本不用于SLO或稳定延迟分位数承诺。
旧previous-key路径仅为历史静态参考，本次正常基线命中current，不为新版本加入兼容。

## 可复现命令

在固定最终候选根目录执行以下PowerShell；`$taskBaseline`必须是新建隔离目录。
先由调用方创建专用Redis、记录精确ID、动态端口并PONG确认；不要复用文中端口到未知资源。

```powershell
$taskBaseline = 'D:/projects/iam-service/test-results/ticket-176-baseline-source'
New-Item -ItemType Directory -Path $taskBaseline -Force | Out-Null
git archive --format=tar --output=test-results/ticket-176-baseline.tar 33305c0463747e535ccb8e1fc98b42efb598b954
tar -xf test-results/ticket-176-baseline.tar -C $taskBaseline
pnpm install --frozen-lockfile --ignore-scripts --dir $taskBaseline

# 只移植既有观测窗口；其他基线测试与全部production文件不变。
$apiPath = 'apps/api/test-integration/redis/custom-sso-operation-http.integration.test.ts'
$old = [IO.File]::ReadAllText("$taskBaseline/$apiPath")
$new = [IO.File]::ReadAllText((Join-Path $PWD $apiPath))
$a = $old.IndexOf('    if (mode === "gateway" || mode === "independent") {')
$b = $old.IndexOf('    for (const deniedState of', $a)
$c = $new.IndexOf('    if (mode === "iam" || mode === "gateway" || mode === "independent") {')
$d = $new.IndexOf('    for (const deniedState of', $c)
if (@($a,$b,$c,$d).Where({ $_ -lt 0 }).Count) { throw 'API observation boundary missing' }
[IO.File]::WriteAllText("$taskBaseline/$apiPath", $old.Substring(0,$a)+$new.Substring($c,$d-$c)+$old.Substring($b))
$oidcPath = 'apps/oidc-provider/test-integration/redis/subject-access-authorization.integration.test.ts'
$old = [IO.File]::ReadAllText("$taskBaseline/$oidcPath")
$new = [IO.File]::ReadAllText((Join-Path $PWD $oidcPath))
$a = $old.IndexOf('  it("observes successful UserInfo Redis command round trips through Provider HTTP"')
$b = $old.IndexOf('  it("oIDC HTTP authorization renews', $a)
$c = $new.IndexOf('  it.each(["UserInfo", "Code exchange"] as const)')
$d = $new.IndexOf('  it("oIDC HTTP authorization renews', $c)
if (@($a,$b,$c,$d).Where({ $_ -lt 0 }).Count) { throw 'OIDC observation boundary missing' }
[IO.File]::WriteAllText("$taskBaseline/$oidcPath", $old.Substring(0,$a)+$new.Substring($c,$d-$c)+$old.Substring($b))
Copy-Item packages/session-kernel/test-integration/redis/session-kernel-artifact-cost.integration.test.ts "$taskBaseline/packages/session-kernel/test-integration/redis/session-kernel-artifact-cost.integration.test.ts"
```

分别在隔离基线根和候选根运行完全相同命令，注入各owner专用测试Redis URL指向同一任务实例：

```text
pnpm --filter @iam/api exec bun test --max-concurrency=1 test-integration/redis/custom-sso-operation-http.integration.test.ts --test-name-pattern 'Public UserInfo'
pnpm --filter @iam/oidc-provider exec vitest run --config vitest.integration.redis.config.ts test-integration/redis/subject-access-authorization.integration.test.ts -t 'observes successful' --disableConsoleIntercept
pnpm --filter @iam/session-kernel exec bun test --max-concurrency=1 test-integration/redis/session-kernel-artifact-cost.integration.test.ts
```

分别使用 `IAM_API_TEST_REDIS_URL`、`IAM_OIDC_PROVIDER_TEST_REDIS_URL`、`IAM_SESSION_KERNEL_TEST_REDIS_URL`。
候选Kernel实际同一命令还加入 `test-integration/redis/session-kernel-artifact-state.integration.test.ts`，14/14通过；
cost窗口独占且测试文件顺序执行，该额外行为不进入成本样本。
原始安全日志在 `test-results/ticket-176-{baseline,candidate}-{api,oidc,kernel}.log`，含逐命令起止时间与RTT；
以下逐样本表提交保存，日志为可再生成产物。资源按创建时准确ID清理，结果沿 #176 验收评论。

## 逐样本原始观察

单位 ms；每格 RTT 的顺序与同组命令序列一致。每组五次，无删样或重试；一次客户端命令算一次网络调用，串行波次由起止窗口计算。

### iam/userinfo

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 2.127 | 4 | 4 | 0.449, 0.404, 0.375, 0.443 |
| 1 | 2.199 | 4 | 4 | 0.465, 0.403, 0.370, 0.566 |
| 2 | 2.157 | 4 | 4 | 0.532, 0.395, 0.339, 0.497 |
| 3 | 1.983 | 4 | 4 | 0.396, 0.413, 0.360, 0.415 |
| 4 | 3.979 | 4 | 4 | 0.481, 0.331, 2.220, 0.476 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 0.931 | 1 | 1 | 0.547 |
| 1 | 0.811 | 1 | 1 | 0.425 |
| 2 | 0.883 | 1 | 1 | 0.511 |
| 3 | 1.119 | 1 | 1 | 0.649 |
| 4 | 0.996 | 1 | 1 | 0.528 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

### iam/kernel-root

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 1.618 | 4 | 4 | 0.368, 0.410, 0.339, 0.370 |
| 1 | 1.786 | 4 | 4 | 0.345, 0.453, 0.394, 0.476 |
| 2 | 1.810 | 4 | 4 | 0.461, 0.372, 0.387, 0.474 |
| 3 | 1.568 | 4 | 4 | 0.344, 0.295, 0.419, 0.402 |
| 4 | 3.249 | 4 | 4 | 0.469, 0.345, 0.402, 1.888 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 0.599 | 1 | 1 | 0.507 |
| 1 | 0.497 | 1 | 1 | 0.413 |
| 2 | 0.490 | 1 | 1 | 0.410 |
| 3 | 0.479 | 1 | 1 | 0.413 |
| 4 | 0.470 | 1 | 1 | 0.398 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

### gateway/userinfo

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 2.331 | 4 | 4 | 0.437, 0.359, 0.431, 0.466 |
| 1 | 4.397 | 4 | 4 | 0.565, 0.450, 0.345, 0.672 |
| 2 | 2.132 | 4 | 4 | 0.494, 0.381, 0.311, 0.428 |
| 3 | 2.125 | 4 | 4 | 0.453, 0.376, 0.364, 0.417 |
| 4 | 2.056 | 4 | 4 | 0.388, 0.416, 0.388, 0.378 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 1.125 | 1 | 1 | 0.628 |
| 1 | 1.110 | 1 | 1 | 0.548 |
| 2 | 1.209 | 1 | 1 | 0.537 |
| 3 | 1.114 | 1 | 1 | 0.589 |
| 4 | 1.005 | 1 | 1 | 0.429 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

### gateway/authz

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 3.876 | 4 | 4 | 0.415, 0.355, 0.375, 2.121 |
| 1 | 2.119 | 4 | 4 | 0.490, 0.340, 0.314, 0.453 |
| 2 | 1.953 | 4 | 4 | 0.431, 0.389, 0.303, 0.339 |
| 3 | 2.047 | 4 | 4 | 0.434, 0.323, 0.410, 0.438 |
| 4 | 2.007 | 4 | 4 | 0.394, 0.415, 0.389, 0.436 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 0.867 | 1 | 1 | 0.418 |
| 1 | 0.809 | 1 | 1 | 0.426 |
| 2 | 1.073 | 1 | 1 | 0.520 |
| 3 | 0.858 | 1 | 1 | 0.457 |
| 4 | 0.847 | 1 | 1 | 0.514 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

### independent/userinfo

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 1.853 | 4 | 4 | 0.445, 0.333, 0.302, 0.373 |
| 1 | 1.821 | 4 | 4 | 0.496, 0.333, 0.302, 0.330 |
| 2 | 1.885 | 4 | 4 | 0.352, 0.329, 0.391, 0.397 |
| 3 | 1.746 | 4 | 4 | 0.393, 0.319, 0.311, 0.348 |
| 4 | 2.016 | 4 | 4 | 0.394, 0.361, 0.446, 0.359 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 1.358 | 1 | 1 | 0.729 |
| 1 | 1.280 | 1 | 1 | 0.701 |
| 2 | 1.000 | 1 | 1 | 0.483 |
| 3 | 0.846 | 1 | 1 | 0.430 |
| 4 | 0.814 | 1 | 1 | 0.426 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 2, 2, 2, 2, 2，这些不另计网络调用。

### OIDC AccessToken UserInfo HTTP

原始基线客户端命令：`GET,GET,GET,EVAL,GET,MGET,GET,MGET,GET,GET,GET,EVAL,GET,GET,EVAL,GET,EVAL,MGET`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 11.932 | 18 | 18 | 0.572, 0.392, 0.442, 0.657, 0.403, 0.337, 0.357, 0.397, 0.531, 0.436, 0.364, 0.420, 0.330, 0.307, 0.438, 0.334, 0.662, 0.328 |
| 1 | 14.173 | 18 | 18 | 0.726, 0.600, 0.589, 0.541, 0.373, 0.436, 0.371, 0.318, 0.397, 0.371, 0.372, 0.398, 0.388, 0.386, 0.369, 0.349, 0.589, 0.418 |
| 2 | 14.031 | 18 | 18 | 0.465, 0.393, 0.350, 0.421, 0.399, 0.412, 0.419, 0.349, 0.422, 0.342, 0.364, 0.464, 0.396, 0.372, 0.460, 0.373, 0.543, 0.370 |
| 3 | 13.105 | 18 | 18 | 0.375, 0.360, 0.366, 0.362, 0.497, 0.385, 0.376, 0.350, 0.375, 0.316, 0.298, 0.405, 0.330, 0.298, 0.340, 0.334, 0.393, 0.382 |
| 4 | 14.860 | 18 | 18 | 0.457, 0.421, 0.368, 0.366, 0.409, 0.396, 0.344, 0.301, 0.333, 0.335, 0.338, 0.313, 0.334, 0.342, 0.436, 0.334, 0.573, 0.354 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 14, 14, 14, 14, 14，这些不另计网络调用。

候选客户端命令：`EVAL,GET,MGET,GET,MGET,EVAL,GET,GET,EVAL,GET,EVAL,MGET`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 13.210 | 12 | 12 | 0.916, 0.492, 0.390, 0.416, 0.342, 0.422, 0.416, 0.524, 0.453, 0.394, 0.534, 0.348 |
| 1 | 14.169 | 12 | 12 | 0.602, 0.559, 0.479, 0.486, 0.364, 0.407, 0.482, 0.336, 0.430, 0.474, 0.649, 0.445 |
| 2 | 14.712 | 12 | 12 | 0.666, 0.543, 0.411, 0.448, 0.433, 0.508, 0.443, 0.469, 0.533, 0.417, 0.660, 0.419 |
| 3 | 14.654 | 12 | 12 | 0.632, 0.446, 0.385, 0.422, 0.425, 0.476, 0.443, 0.387, 0.476, 0.497, 0.564, 0.362 |
| 4 | 15.526 | 12 | 12 | 0.934, 0.576, 0.452, 0.452, 0.494, 0.461, 0.423, 0.477, 0.813, 0.450, 0.596, 0.362 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 14, 14, 14, 14, 14，这些不另计网络调用。

### OIDC Code HTTP

原始基线客户端命令：`MGET,GET,GET,GET,EVAL,GET,GET,EVAL,GET,MGET,MGET,GET,GET,EVAL,EVAL,GET,GET,EVAL,GET,GET,EVAL,EVAL,GET,EVAL,GET,EVAL,GET,EVAL,EVAL,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 25.042 | 30 | 30 | 0.707, 0.478, 0.418, 0.322, 0.420, 0.474, 0.337, 0.403, 0.472, 0.396, 0.430, 0.440, 0.413, 0.521, 0.456, 0.427, 0.402, 0.452, 0.403, 0.336, 0.395, 0.559, 0.453, 0.402, 0.371, 0.426, 0.422, 0.420, 0.505, 0.526 |
| 1 | 27.138 | 30 | 30 | 0.529, 0.479, 0.341, 0.280, 0.342, 0.363, 0.333, 0.376, 0.363, 0.582, 0.420, 0.336, 0.436, 0.463, 0.421, 0.395, 0.336, 0.667, 0.340, 0.336, 0.362, 0.544, 0.384, 0.350, 0.364, 0.357, 0.357, 0.419, 0.510, 0.497 |
| 2 | 27.630 | 30 | 30 | 0.560, 0.418, 0.432, 0.386, 0.409, 0.449, 0.429, 0.384, 0.417, 0.335, 0.431, 0.398, 0.446, 0.460, 0.491, 0.373, 0.390, 0.420, 0.425, 0.423, 0.393, 0.559, 0.386, 0.421, 0.368, 0.399, 0.370, 0.406, 0.754, 0.490 |
| 3 | 35.057 | 30 | 30 | 0.749, 0.581, 0.520, 0.491, 1.094, 0.811, 0.465, 0.515, 0.440, 0.503, 0.560, 0.432, 0.436, 1.685, 0.769, 0.543, 0.485, 0.603, 0.671, 0.485, 0.493, 0.594, 0.498, 0.553, 0.456, 0.749, 0.576, 0.543, 0.832, 0.686 |
| 4 | 30.418 | 30 | 30 | 0.719, 0.431, 0.413, 0.425, 0.451, 0.395, 0.362, 0.388, 0.328, 0.379, 0.343, 0.408, 0.371, 0.467, 0.479, 0.369, 0.439, 0.420, 0.362, 0.440, 0.410, 0.503, 0.376, 0.400, 0.394, 0.424, 0.389, 0.410, 0.441, 0.547 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 58, 58, 58, 58, 58，这些不另计网络调用。

候选客户端命令：`MGET,EVAL,GET,GET,EVAL,GET,MGET,MGET,GET,EVAL,EVAL,GET,GET,EVAL,GET,GET,EVAL,EVAL,GET,EVAL,GET,EVAL,GET,EVAL,EVAL,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 29.112 | 26 | 26 | 1.372, 0.666, 0.509, 0.659, 0.565, 0.539, 0.656, 0.437, 0.534, 0.619, 0.695, 0.431, 0.536, 0.446, 0.418, 0.359, 0.438, 0.560, 0.499, 0.466, 0.534, 0.495, 0.627, 0.574, 0.532, 0.501 |
| 1 | 21.843 | 26 | 26 | 0.889, 0.502, 0.436, 0.376, 0.434, 0.385, 0.449, 0.416, 0.434, 0.544, 0.428, 0.323, 0.318, 0.353, 0.514, 0.424, 0.443, 0.510, 0.407, 0.447, 0.327, 0.414, 0.569, 0.504, 0.634, 0.702 |
| 2 | 27.126 | 26 | 26 | 0.944, 0.517, 0.513, 0.701, 0.443, 0.448, 0.410, 0.449, 0.405, 0.555, 0.454, 0.446, 0.311, 0.407, 0.532, 0.327, 0.372, 0.446, 0.342, 0.413, 0.374, 0.398, 0.405, 0.402, 0.591, 0.518 |
| 3 | 28.692 | 26 | 26 | 0.861, 0.538, 0.872, 0.460, 0.437, 0.419, 0.459, 0.415, 0.580, 0.487, 0.444, 0.386, 0.413, 0.586, 0.463, 0.464, 0.434, 0.499, 0.523, 0.403, 0.494, 0.523, 0.423, 0.475, 0.655, 0.550 |
| 4 | 30.349 | 26 | 26 | 0.864, 0.612, 0.490, 0.463, 0.737, 0.520, 0.466, 0.422, 0.473, 0.582, 0.458, 0.526, 0.451, 0.403, 0.374, 0.479, 0.541, 0.514, 0.551, 0.567, 0.382, 0.368, 0.457, 0.508, 0.629, 0.679 |

五次 MONITOR 客户端命令数均等于观测器计数；Lua 内部命令数量依次为 65, 65, 65, 65, 65，这些不另计网络调用。

### Kernel authorization_code

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 3.756 | 4 | 4 | 0.484, 0.411, 0.408, 0.440 |
| 1 | 2.754 | 4 | 4 | 1.348, 0.425, 0.413, 0.375 |
| 2 | 1.642 | 4 | 4 | 0.366, 0.364, 0.337, 0.453 |
| 3 | 1.586 | 4 | 4 | 0.325, 0.366, 0.386, 0.356 |
| 4 | 1.471 | 4 | 4 | 0.363, 0.308, 0.292, 0.370 |

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 2.339 | 1 | 1 | 0.514 |
| 1 | 3.402 | 1 | 1 | 1.559 |
| 2 | 1.535 | 1 | 1 | 1.407 |
| 3 | 0.657 | 1 | 1 | 0.576 |
| 4 | 0.498 | 1 | 1 | 0.412 |

### Kernel return_handle

原始基线客户端命令：`GET,GET,GET,EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 2.097 | 4 | 4 | 0.617, 0.389, 0.306, 0.667 |
| 1 | 1.400 | 4 | 4 | 0.367, 0.298, 0.279, 0.319 |
| 2 | 1.341 | 4 | 4 | 0.296, 0.285, 0.318, 0.335 |
| 3 | 1.800 | 4 | 4 | 0.383, 0.316, 0.315, 0.674 |
| 4 | 2.333 | 4 | 4 | 0.294, 0.248, 0.444, 0.379 |

候选客户端命令：`EVAL`。

| 样本 | 请求/局部墙钟 | 网络调用 | 串行波次 | 各命令往返完成时长 |
|---|---|---|---|---|
| 0 | 0.502 | 1 | 1 | 0.400 |
| 1 | 0.543 | 1 | 1 | 0.475 |
| 2 | 0.579 | 1 | 1 | 0.502 |
| 3 | 0.564 | 1 | 1 | 0.483 |
| 4 | 0.440 | 1 | 1 | 0.384 |
