# 前端 Unit 执行环境优化

## Problem Statement

当前完整 Unit Collection 在同机、Turbo 缓存未命中的强制执行中约需 44 秒。主要瓶颈不是测试断言，而是 Admin 与
SSO 的 Vitest 测试把所有 Unit 文件统一放入 jsdom，并为每个文件加载 React Testing Library、MSW、Umi mocks 与浏览器
兼容 setup。SSO 和 Admin 的实际断言执行均不到 1 秒，但环境创建、setup、模块导入与 runner 启动占据绝大多数时间。

这种默认值还会让以后新增的纯函数测试自动承担浏览器环境成本，使测试依赖不透明。测试文件即使只验证映射、校验、选择器或
请求参数，也会和真正需要 `window`、DOM 或 React render 的测试使用相同基础设施。

单纯增加并发不能解决问题。根级 Turbo 已限制同时运行的任务数，而前端 Vitest 在当前高核机器上仍可为单个 package 创建多达
8 个 worker；提高 Turbo 并发后，Admin、Root 与其他任务因资源争用变慢。把 Vitest 降为单 worker 又会使测试文件串行排队，
同样显著变慢。因此需要先消除不必要的执行环境，再依据完整集合的表现调整 worker 预算。

本功能需要在不删除测试、不减少断言、不改变公开测试语言的前提下，让前端 Unit 测试只为真实依赖的基础设施付费，同时保持
Collection Guard、Component Integration、Coverage 与 package-local runner ownership 的既有边界。

## Solution

Admin 与 SSO 的 Unit Collection 继续通过原有 `test:unit` 公开入口运行，但在各自的单个 Vitest 进程内拆分为 Node 与 DOM
两种执行环境。Node 是普通 Unit 的默认环境；只有通过 `*.dom.test.*` 明确标记、且确实验证浏览器或 DOM 行为的测试进入
jsdom。

Node 与 DOM 只是 Unit Collection 的内部执行环境，不形成新的 collection、profile、lane 或公开命令。使用 jsdom 不会
自动把测试变成 Component Integration；Component Integration 仍由跨组件或模块组合行为决定，并继续整体使用 jsdom。
Browser Integration 仍由 Playwright 驱动的真实浏览器持有。

全局 Unit setup 被收窄。DOM project 加载 React Testing Library 与必要的浏览器兼容 setup；Node project 不加载 DOM
setup。MSW 与 jsdom 解耦，只有实际需要 HTTP mock 的测试文件显式注册共享的 MSW lifecycle。每个前端 package 继续拥有
自己的 Vitest projects、setup 与测试支持代码，不新增根级 Vitest workspace 或跨 package 共享配置模块。

改造按证据评估，不设人为的最终耗时门槛。每个独立变化都比较完整 Unit Collection 的前后表现；只保留可重复改善且不降低
测试清晰度的变化。结构拆分完成后再比较固定 2、固定 4 与现有 `25%` 三种 worker 预算，以完整集合而非单 package 的最快
结果作决定。若后续瓶颈来自纯逻辑与 UI 模块的 import 耦合，只有在测量证据明确时才考虑提取生产代码 seam。

## User Stories

1. 作为日常开发者，我希望完整 Unit Collection 更快完成，以便缩短修改后的反馈周期。
2. 作为日常开发者，我希望继续使用同一个 `test:unit` 入口，以便不必理解或手工组合内部执行环境。
3. 作为日常开发者，我希望暖缓存不是唯一的加速来源，以便首次运行或相关输入变化后仍有可接受的反馈速度。
4. 作为测试维护者，我希望纯函数测试默认运行在 Node，以便不会无意启动浏览器模拟环境。
5. 作为测试维护者，我希望真正依赖 DOM 的 Unit 通过明确文件命名表达依赖，以便成本和语义一眼可见。
6. 作为测试维护者，我希望使用 `window.history` 等浏览器 API 的测试仍获得 jsdom，以便优化不会改变测试行为。
7. 作为测试维护者，我希望 React render 与 DOM assertion 继续使用 Testing Library setup，以便用户可见组件行为保持可信。
8. 作为测试维护者，我希望只使用 MSW 的测试可以在 Node 中运行，以便 HTTP mock 不被错误等同于浏览器环境。
9. 作为测试维护者，我希望只有使用 HTTP mock 的文件注册 MSW lifecycle，以便普通 Unit 不承担无关 setup。
10. 作为测试维护者，我希望 Node 测试暴露生产模块在 import 时对浏览器全局的隐藏依赖，以便不会用全局 shim 掩盖边界问题。
11. 作为测试维护者，我希望隐藏依赖被发现时按真实测试行为分类，以便不会为了提高 Node 测试比例改变语义。
12. 作为前端维护者，我希望 Admin 与 SSO 各自拥有测试配置和 setup，以便 package 可以独立演进。
13. 作为前端维护者，我希望本次不引入根级共享 Vitest 模块，以便两个消费者不会过早形成跨 package 耦合。
14. 作为架构维护者，我希望 Node 与 DOM 被定义为 Unit 的执行环境，以便不会扩张现有 canonical test vocabulary。
15. 作为架构维护者，我希望 DOM Unit 与 Component Integration 保持不同概念，以便环境选择不会替代行为边界。
16. 作为架构维护者，我希望 Browser Integration 继续特指真实浏览器测试，以便 jsdom Unit 不被误称为 browser test。
17. 作为测试维护者，我希望 Component Integration 的收集和运行语义保持不变，以便性能优化不扩大到未经测量的测试层。
18. 作为测试维护者，我希望 Coverage 一次覆盖 Node 与 DOM Unit 并生成一份合并报告，以便现有消费方式不变。
19. 作为测试维护者，我希望本次不新增覆盖率百分比门槛，以便性能改造不夹带新的质量政策。
20. 作为仓库维护者，我希望 Collection Guard 继续发现漏收、重收和公开命令不可达，以便多 projects 不会遗失测试。
21. 作为仓库维护者，我希望 Node/DOM 规则由稳定不变量保护，以便未来配置变化不会悄悄恢复全局 jsdom。
22. 作为仓库维护者，我希望守卫不保存当前测试数量或逐文件映射，以便测试自然增删不会制造无意义维护。
23. 作为仓库维护者，我希望性能数据只作为改造证据而非 CI 秒数门禁，以便不同机器不会产生假失败。
24. 作为仓库维护者，我希望 worker 数量依据完整集合实测决定，以便单 package 的局部最优不会拖慢整体。
25. 作为仓库维护者，我希望 worker 调优发生在环境拆分之后，以便不同变量的收益可以区分。
26. 作为仓库维护者，我希望测试文件和断言数量不因优化减少，以便速度提升不是通过降低验证范围获得。
27. 作为仓库维护者，我希望公开 package commands 保持兼容，以便现有本地流程和 Turbo task graph 无需迁移。
28. 作为仓库维护者，我希望 OIDC Provider 保持现有 Node Unit 配置，以便没有同类问题的 package 不被无端重构。
29. 作为仓库维护者，我希望生产代码 seam 只有在 import profiling 提供证据时才调整，以便第一轮改造保持聚焦。
30. 作为后续实施 agent，我希望规格明确哪些是架构决策、哪些留给 tickets 排序，以便切片时不重新讨论已确认边界。

## Implementation Decisions

- 优化范围是 Admin 与 SSO 的 Unit Collection。OIDC Provider 已默认使用 Node，不进入同类配置改造。
- 完整 Unit Collection 是主要性能观察场景。强制执行用于排除 Turbo task cache 干扰，但不改变开发者使用的公开命令。
- `test:unit` 保持唯一公开入口；不新增 `test:unit:node` 或 `test:unit:dom` 公共命令。
- Node 与 DOM 是 Unit Collection 内部的 execution environments，不是新的 collection、Integration profile 或 test lane。
- 普通 `*.test.ts[x]` 属于 Node Unit；`*.dom.test.ts[x]` 是唯一 DOM Unit 标记。
- `*.integration.test.ts[x]` 继续表达 Component Integration；`*.spec.ts` 继续服务现有 Playwright Browser/E2E 语义。
- 每个前端 package 在一个 Vitest 进程中定义 Node 与 DOM 两个 package-local projects，避免串行启动两个 Vitest CLI。
- Node project 不加载全局 DOM setup。DOM project 负责 jsdom、Testing Library cleanup、浏览器兼容 mocks 与确有需要的 package-local reset。
- MSW 不决定测试运行环境。需要 HTTP mock 的测试通过 package-local helper 显式启用 server lifecycle。
- 初始 DOM 分类只覆盖明确访问浏览器全局或执行 React DOM render 的测试；其余 Unit 先进入 Node，并用实际运行验证隐藏依赖。
- Node 运行暴露隐藏浏览器依赖时，不为整个 Node project 添加全局 shim。只有测试行为确实需要浏览器能力时才改为 DOM Unit；否则修正模块边界。
- 前端共享 Vitest 配置只保留 alias、exclude、coverage、timeout 与资源预算等真正共享的内容。
- Component Integration 继续整体使用 jsdom 与完整 setup，本功能不重新分类其测试文件。
- Coverage 保持 package-local 单命令、单进程、单份合并报告，并同时覆盖 Node 与 DOM projects。
- Admin 与 SSO 分别持有配置和测试支持代码；两个消费者不足以证明需要根级共享 Vitest 抽象。
- worker 预算不预先写死。结构拆分后比较固定 2、固定 4 与现有 `25%`，只保留能稳定改善完整集合的设置。
- 不设置最终秒数目标。下一步若收益落入测量噪声、需要显著增加配置复杂度或扩大生产代码改造，则停止继续优化。
- 生产代码中的纯逻辑提取不是第一轮必做项；只有后续 profiling 明确指向 UI import 耦合时才评估。
- 当前测试架构文档将记录 Unit execution environments、Node 默认、DOM 显式 opt-in、按需 setup 与 package-local ownership。
- 当前编码风格文档将记录测试文件命名。公开命令没有变化，因此不新增命令入口。
- 本决策不修改业务领域 glossary，也不创建 ADR；它容易回退，不满足长期不可逆决策的门槛。
- 实施切片、顺序与 blocking edges 由后续 `$to-tickets` 决定，不属于本规格的实现决策。

## Testing Decisions

- 最高层测试 seam 是完整 Unit Collection。使用相同 runner、相同 Turbo concurrency 与绕过 task cache 的命令记录改造前后墙钟，避免把缓存命中算作收益。
- 性能比较采用重复运行并观察稳定趋势，不把单次最快值或固定秒数提交为自动化门禁。
- Admin 与 SSO 的 package-local `test:unit` 必须各自收集并通过 Node 与 DOM Unit，且现有测试文件与断言不减少。
- Admin 与 SSO 的 package-local `test:coverage` 必须同时运行两个 projects 并生成一份合并报告。
- Admin 与 SSO 的 Component Integration 必须继续通过，以证明共享配置拆分没有改变其 jsdom、setup 与收集语义。
- Collection Guard 是漏收、重收、path naming 与 root command 可达性的既有最高 seam。多 projects 必须通过真实 Vitest machine list 被观察，不新增第二套文件扫描器。
- 根测试编排契约只验证稳定不变量：Admin/SSO Unit 同时提供 Node 与 DOM 环境、DOM 后缀只进入 DOM、Node 排除 DOM 后缀、Node 不加载全局 DOM setup，以及 Component Integration 仍使用 jsdom。
- 守卫不记录当前 Node/DOM 测试数量，不维护逐文件完整映射，不固定配置对象的全部形状，也不断言性能秒数。
- MSW helper 通过实际使用它的测试验证 lifecycle；不为 helper 建立与调用行为重复的低层测试。
- 如果 Node 分类失败，测试必须先证明失败来自真实浏览器行为还是模块 import 耦合，再决定改名或调整 seam；不通过增加全局 shim 让失败消失。
- worker 对照以完整 Unit Collection 为判断 seam，单独 package 数据只用于解释，不作为最终选择依据。
- 受影响 package 运行 lint 与 typecheck；文档变更运行 docs index guard；所有变更运行 whitespace diff 检查。
- 本功能不需要 PostgreSQL、Redis、Docker、Playwright 或外部网络资源。

## Out of Scope

- 删除测试文件、减少断言或用静态检查替换有行为价值的 Unit 测试。
- 修改 Unit、Integration、E2E 的 canonical public vocabulary。
- 新增公开的 Node/DOM Unit commands。
- 重构 OIDC Provider、后端 Bun Unit 或资源型 Integration tests。
- 重新分类 Component Integration 或 Browser Integration。
- 建立根级 Vitest workspace、根级共享 frontend setup 或跨 package 测试配置包。
- 新增覆盖率阈值、性能 CI gate、机器无关的硬耗时 SLA 或 benchmark artifact。
- 通过清空操作系统缓存、修改 Turbo cache 语义或提高根级 Turbo concurrency 制造性能数字。
- 在第一轮无 profiling 证据时提取生产代码纯逻辑模块。
- 修改业务领域 glossary、创建 ADR 或改变现有应用行为。
- 在本规格中预先确定 ticket 粒度、实施顺序或 blocking edges。

## Further Notes

- 诊断基线来自 Windows 本地 32 逻辑处理器环境。完整强制 Unit Collection 两次测量约为 44.3 秒和 44.5 秒。
- 完整运行中 SSO Unit 约 21 秒、Admin Unit 约 10 秒；隔离运行时两者实际断言分别约 0.54 秒与 0.38 秒，主要成本来自 environment、setup、import 与 runner startup。
- 根级 Turbo concurrency 从 2 提高到 3 没有改善完整墙钟，反而放大多个任务的持续时间；单 Vitest worker 又使 SSO 与 Admin 显著变慢。
- 当前 `25%` 在该机器上等于单个 Vitest package 最多 8 个 worker。该数字随机器核数变化，因此只能在结构优化后通过完整集合重新评估。
- 当前工作分支由维护者明确指定为 `codex/remove-obsolete-tooling-tests`。该分支已有工具链测试删除改动，本 feature 必须保留并适应该工作区现状。
