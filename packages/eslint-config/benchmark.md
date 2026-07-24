# ESLint 配置加载选型

本包保留三个可重复的 backend profile：

- `backend.config.mjs`：正式共享 preset，保持当前 Antfu 规则语义；
- `lean-backend.config.mjs`：关闭大部分可选 Antfu 规则组，验证“只裁剪选项”的收益上限；
- `curated-backend.config.mjs`：只直接导入 TypeScript、imports、Node 与 unused-imports 插件，验证精选 flat config 的启动下限。

## 规则组审计

| 规则组 | 仓库适用性 | 当前决策 |
|---|---|---|
| formatter | backend 当前同时检查格式；frontend 由 Prettier/Stylelint 负责 | backend 保留，frontend 关闭 |
| Markdown/JSON/YAML/TOML | 根脚本与配置包含这些文件类型，且 Antfu 当前默认启用 | 保留，不能以当前零诊断证明不需要 |
| test/Vitest | Admin、SSO、OIDC 与共享包包含测试文件 | 保留 |
| jsdoc | 当前规则覆盖的一部分，尚无独立迁移授权 | 保留 |
| imports | workspace 普遍使用跨包 import，当前重复导入与 mutable export 检查适用 | 保留 |
| JSX | Admin/SSO 使用 TSX，backend profile 关闭它只用于测量下限 | 正式 frontend 保留；backend 不以此对照改变 frontend 语义 |
| node | backend、root 脚本与 Gateway 都运行在 Node/Bun 环境，并已有局部 Node 规则例外 | 保留 |
| pnpm | monorepo manifest 与 catalog 规则可能适用 | 保留 |
| e18e | 用于依赖和运行时实践检查 | 保留 |
| perfectionist | 当前导入排序与命名排序语义的一部分 | 保留；frontend 保持既有局部关闭 |
| unicorn | 当前通用 JavaScript/TypeScript 质量规则的一部分 | 保留 |
| regexp | Gateway 只有两项局部例外，说明其余规则仍有意生效 | 保留 |

Antfu 9.1.0 的统一入口静态导入多组插件，因此关闭可选规则主要降低 compose 与规则执行成本，不能消除入口固定导入。精选 flat config 启动更快，但缺少 formatter、React、regexp、unicorn、perfectionist、test 等既有诊断，不能作为无语义变化的正式替代。

正式 preset 因此保持 Antfu 语义并集中版本解析；Node compile cache 只作为单独的运行时原型评估，只有真实 lint 的首轮写入和后续热轮均被隔离记录后才能进入正式命令。

## 2026-07-23 五轮结果

同一 `@iam/domain` 文件集合、相同机器、profile 交错运行五轮。`first` 是每个 profile 的首次观测，
`warm` 是其余四轮的中位数；RSS 是对应 lint 子进程的峰值 RSS（warm 行取四个峰值的中位数）：

| Profile | 观测 | Config import | Config compose | Workspace lint | Lint 最大 RSS |
|---|---|---:|---:|---:|---:|
| 当前 Antfu | first | 2183 ms | 408 ms | 13074 ms | 479 MiB |
| 当前 Antfu | warm | 1343 ms | 320 ms | 12864 ms | 474 MiB |
| 正式共享 preset | first | 1293 ms | 312 ms | 12481 ms | 472 MiB |
| 正式共享 preset | warm | 1231 ms | 351 ms | 12570 ms | 478 MiB |
| 精简 Antfu | first | 1299 ms | 92 ms | 10254 ms | 419 MiB |
| 精简 Antfu | warm | 1257 ms | 75 ms | 10223 ms | 403 MiB |
| 精选 flat config | first | 775 ms | 1.3 ms | 6037 ms | 272 MiB |
| 精选 flat config | warm | 729 ms | 1.7 ms | 5827 ms | 273 MiB |

四组 profile 均扫描 42 个文件且当前样本为零诊断；这只能证明现有源文件没有触发差异，不能证明被删规则等价。根据上面的规则组审计，精简与精选 profile 都减少既有检查语义，因此不进入正式 preset。

Node compile cache 的 config-only 对照中，当前 Antfu 热中位数约 1.85 秒、共享 preset 约 1.79 秒，均未优于无 compile cache 的对应中位数。首次写入还分别需要约 2.23 秒和 3.31 秒，因此本次不把 compile cache 加入正式命令。它保留为显式 benchmark 参数，后续 Node 或 runner 升级后可重新测量。

## 2026-07-23 消费端迁移复测

迁移前后都使用默认命令把 backend 与 frontend 交错运行五轮。下表比较排除首次观测后的四轮中位数：

| Profile | 阶段 | Config import | Config compose | Workspace lint | Lint 最大 RSS |
|---|---|---:|---:|---:|---:|
| Backend | 迁移前 | 1593 ms | 358 ms | 15980 ms | 468 MiB |
| Backend | 迁移后 | 1423 ms | 359 ms | 14720 ms | 470 MiB |
| Frontend | 迁移前 | 1510 ms | 509 ms | 15632 ms | 576 MiB |
| Frontend | 迁移后 | 1551 ms | 468 ms | 15733 ms | 587 MiB |

迁移后 backend 规则加载与完整 lint 没有回退；frontend 完整 lint 变化约 0.6%、峰值 RSS 变化约 1.9%，
处于进程级采样波动范围。两组仍保持原文件集合、退出码和诊断键，因此复测支持 ticket 02
“保留 Antfu 语义并集中解析”的选型，不引入 compile cache 或规则裁剪。

## 2026-07-24 首文件分段复测

最终 feature 评审补充了首文件 lint 接缝。每个样本依次用三个独立进程测 config、首文件和完整 workspace，
Node compile cache 关闭；首轮单列，`warm` 是其余四轮中位数。Backend 首文件固定为
`src/audit/index.ts`，frontend 首文件固定为 `src/app.ts`，因此首文件结果不会被目录遍历时间混入。

| Profile | 观测 | Config import | Config compose | 首文件 lint | 首文件 RSS | Workspace lint | Workspace RSS |
|---|---|---:|---:|---:|---:|---:|---:|
| Workspace 正式 backend 入口 | first | 1864 ms | 413 ms | 15046 ms | 417 MiB | 14565 ms | 489 MiB |
| Workspace 正式 backend 入口 | warm | 1821 ms | 356 ms | 14833 ms | 415 MiB | 16303 ms | 491 MiB |
| 共享 backend preset 直连 | first | 1540 ms | 381 ms | 18501 ms | 388 MiB | 28559 ms | 494 MiB |
| 共享 backend preset 直连 | warm | 2691 ms | 524 ms | 17265 ms | 415 MiB | 18069 ms | 486 MiB |
| 精简 Antfu backend | first | 3844 ms | 291 ms | 17832 ms | 346 MiB | 17199 ms | 438 MiB |
| 精简 Antfu backend | warm | 1645 ms | 117 ms | 12318 ms | 346 MiB | 14295 ms | 433 MiB |
| 精选 flat config backend | first | 1635 ms | 43 ms | 8533 ms | 253 MiB | 8185 ms | 306 MiB |
| 精选 flat config backend | warm | 1297 ms | 34 ms | 7427 ms | 251 MiB | 7381 ms | 307 MiB |
| Workspace 正式 frontend 入口 | first | 1897 ms | 508 ms | 16244 ms | 440 MiB | 16633 ms | 554 MiB |
| Workspace 正式 frontend 入口 | warm | 1629 ms | 503 ms | 14625 ms | 439 MiB | 17034 ms | 568 MiB |

五个 profile 共 25 组首文件和完整 lint 都以退出码 0 返回可解析 JSON；backend 每组分别扫描 1/42 个文件且
零诊断，frontend 分别扫描 1/78 个文件并保留完整 lint 的 25 个既有 warnings。正式 Antfu 入口的首文件与
完整 workspace lint 接近，进一步证明主要固定成本来自每个新进程加载插件图，而不是文件数量。精选配置虽然明显更轻，
仍因减少既有规则语义而不进入正式入口。

基准 JSON schema v2 同时记录首文件和 workspace 的墙钟、user/system CPU 与最大 RSS。两个 lint 阶段使用独立的
compile-cache 目录；任何 lint 非零退出或不可解析的 JSON 都会让整个基准命令失败，不再产出可被误记为 passed 的样本。
