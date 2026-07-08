## Context

REST 和 tRPC 的错误处理已经能识别 `CustomError` 以及满足 `{ code, message, httpStatus }` 结构的 domain business error。问题出在部分客户端输入类错误仍使用裸 `new CustomError(message)`，而 `CustomError` 默认值是 `COMMON.INTERNAL_ERROR` 和 HTTP `500`。因此“非法请求”“手机号不能为空”“旧密码与新密码相同”等可预期 4xx 场景会被序列化为内部错误。

已有规范要求稳定业务失败优先使用具名错误类，并允许 `@iam/domain/<domain>` 暴露 domain business error。OpenSpec 历史任务也记录过剩余裸 `CustomError` 是遗留技术债。本次设计沿用这些边界，不改变全局错误处理器的识别机制。

## Goals / Non-Goals

**Goals:**

- 为通用客户端请求错误新增具名错误类型，默认返回 `COMMON.BAD_REQUEST` 和 HTTP `400`。
- 将遗留裸 `CustomError` 中属于客户端输入、请求前置条件或稳定业务失败的场景迁移到具名错误。
- 保持真正内部失败继续返回 `COMMON.INTERNAL_ERROR` 和 HTTP `500`。
- 保持 REST envelope、tRPC formatter、日志事件结构和 OpenAPI common error response 形状不变。
- 为后续新增错误提供明确分类规则，减少新的裸 `CustomError`。

**Non-Goals:**

- 不修改 `CustomError` 默认值。
- 不把所有 `COMMON.INTERNAL_ERROR` 改成 `COMMON.BAD_REQUEST`。
- 不改变 Hono `HTTPException` 适配规则；坏 JSON、空 JSON body 等 parser 错误仍按当前规范保留现状。
- 不为每条低价值一次性前置条件新增独立 `ApiErrorCode`。
- 不改变前端错误响应解析结构。

## Decisions

### 1. 新增 `BadRequestError`

在 `packages/api-core/src/errors/BadRequestError.ts` 新增通用 API infrastructure error：

```ts
export class BadRequestError extends CustomError {
  constructor(message: string = "请求参数错误") {
    super(message, {
      code: ApiErrorCode.BadRequest,
      httpStatus: BAD_REQUEST,
    });
    this.name = "BadRequestError";
  }
}
```

它用于无法归属到稳定领域错误、但明确由客户端请求输入或请求前置条件导致的失败，例如缺少必须 header、组合参数不满足当前 API 约束、工具函数在请求边界发现非法 URL。

替代方案是改 `CustomError` 默认值为 400。该方案会把未知或暂未分类的内部失败误降级为客户端错误，削弱诊断和告警，因此不采用。

### 2. 稳定领域语义继续放 `@iam/domain`

如果错误属于可复用的领域条件，优先新增或复用 domain error，而不是全部塞进 `BadRequestError`。例如用户密码规则、client OIDC 配置、组织层级约束等，若前端或多个入口可能分支处理，应放在对应 `packages/domain/src/<domain>/errors.ts`，并使用明确类名、稳定默认 message、`ApiErrorCode` 和 `httpStatus`。

当没有独立业务 code 时，可以使用 `ApiErrorCode.BadRequest`，但仍通过类名表达语义，便于测试和日志识别。

### 3. 迁移时按调用点分类

剩余裸 `CustomError` 按三类处理：

- 客户端输入/请求前置条件：迁移为 `BadRequestError`。
- 稳定领域业务失败：迁移为对应 domain error，必要时新增具名类。
- 真实内部或外部依赖失败：保留 `CustomError` 默认 500，或在后续单独拆成内部错误类型。

初始候选迁移包括认证入口缺少 `Client` header、open 重置密码输入边界、用户查询参数数量限制、权限委托仓储缺少必要参数、admin employment 期望祖先组织不匹配等。会话创建失败、授权码创建失败、短信供应商失败等不在本次降级为 4xx。

### 4. 不调整 `HTTPException`

Hono body parser 抛出的 `HTTPException` 当前按规范返回保留 status 但 code 为 `COMMON.INTERNAL_ERROR`。本次聚焦裸 `CustomError` 导致的 500，不改变该兼容行为。若之后要把 malformed JSON 改为 `COMMON.BAD_REQUEST` 或 `COMMON.VALIDATION_FAILED`，应单独提出规范变更。

### 5. 测试以 contract 为中心

测试重点不是每个 message 的字符串快照，而是：

- 新错误类携带 `ApiErrorCode.BadRequest` 和 HTTP `400`。
- REST handler 收到新错误类型时返回 `400 COMMON.BAD_REQUEST`，日志为 handled 4xx。
- 已迁移调用点不再返回 `500 COMMON.INTERNAL_ERROR`。
- 保留的内部失败仍返回 500。

## Risks / Trade-offs

- [Risk] 把真实内部错误误分类为 400 会隐藏服务端问题。→ 迁移清单按调用点审查，只有明确由客户端输入导致的场景才迁移。
- [Risk] 统一使用 `COMMON.BAD_REQUEST` 会降低前端细粒度分支能力。→ 稳定、外部有意义的业务条件仍新增 domain error；低价值临时条件才用通用错误。
- [Risk] `HTTPException` 仍会出现 `400 COMMON.INTERNAL_ERROR`，用户可能继续困惑。→ 在本变更中明确列为非目标，并保留后续独立变更空间。
- [Risk] 裸 `CustomError` 可能再次被引入。→ 增加测试或代码审查任务，至少覆盖已知迁移区域，并在后端实现约定中优先使用具名错误。
