## ADDED Requirements

### Requirement: Existing Backend Production Ports Use Consumer Ownership
API、Admin API 与 OIDC Provider 的 production `*.port.ts` SHALL 直接声明消费模块调用的方法，并 SHALL 使用 consumer-owned 或中立数据 shape。Port contract MUST NOT 通过 concrete repository/service 的完整 type、method selection 或返回值推导获得。

#### Scenario: Repository dependency becomes a narrow port
- **WHEN** service 或 use-case 需要现有 repository 的 reader、writer 或 transaction behavior
- **THEN** 消费方 `*.port.ts` SHALL 直接声明其实际调用的方法签名
- **AND** port MUST NOT import `*.repository.ts` 或通过 `Pick<...Repository>` 定义方法集合

#### Scenario: Service collaborator becomes a narrow port
- **WHEN** use-case 或 domain-aligned service 只消费现有 service facade 的部分方法
- **THEN** 消费方 SHALL 声明职责明确的 outbound port
- **AND** dependency MUST NOT 通过 `Pick<...Service>` 或 concrete service return type 派生

#### Scenario: Existing provider satisfies the consumer contract
- **WHEN** repository、service 或 transaction object 被 composition 注入迁移后的 consumer port
- **THEN** TypeScript compile-time validation SHALL 证明 provider 与 port 结构兼容
- **AND** production wiring MUST NOT use an unchecked type assertion or behaviorless wrapper to hide incompatibility
- **AND** an explicit composition adapter MAY be used only when it performs a tested semantic shape mapping

### Requirement: Production Port Guards Prevent Derived Ownership Regression
三个 backend 的 architecture tests SHALL 扫描各自全部 production `*.port.ts`，并 SHALL 对 repository-owned import 与 concrete repository/service-derived `Pick` 报告文件级违规。

#### Scenario: Repository import fails globally
- **WHEN** 任一 production `*.port.ts` import `*.repository.ts`、`*.repository` 或 `repositories/**` 中由 provider ownership 定义的数据 type
- **THEN** 对应 app 的 architecture test SHALL fail
- **AND** diagnostic SHALL identify the port file and offending module specifier

#### Scenario: Concrete Pick fails globally
- **WHEN** 任一 production `*.port.ts` 使用 `Pick<...Repository>` 或 `Pick<...Service>` 定义 dependency shape
- **THEN** 对应 app 的 architecture test SHALL fail
- **AND** multiline generic syntax MUST NOT evade detection

#### Scenario: Neutral and port contracts remain allowed
- **WHEN** production port import domain/contracts、consumer-owned `*.type.ts` 或使用 `Pick<...Port>`、platform type narrowing
- **THEN** architecture test SHALL allow the dependency
- **AND** existing static enum、schema、error、constant 与 pure type imports SHALL remain uninjected
