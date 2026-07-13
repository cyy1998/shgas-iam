## Verification Evidence

### Migration Baseline

- 2026-07-13：`pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/claims.test.ts src/__tests__/provider-wiring.test.ts src/__tests__/session-security.test.ts src/__tests__/configuration.test.ts src/__tests__/token-flow.test.ts src/__tests__/architecture.test.ts`
  - 结果：6 files、15 tests passed。
  - 覆盖：claims snapshot/token extra、provider protocol wiring、client auth rate limit、configuration、authorization-code token flow、non-Hono DI architecture。

### TDD Red / Green

- Characterization green：扩展 `claims.test.ts` 的完整 access-token extra、scope-filtered snapshot、ID Token authorization filtering 与 Authorization Code `auth_time` 断言后，单文件 3/3 tests passed。
- Characterization green：逐片增加 unresolved credential no-revoke、provider binding mismatch revoke、global session mismatch revoke、credential config metadata mismatch revoke；每个目标用例均单独通过。
- Security composition red：`provider-wiring.test.ts` 引用目标 `composition/security/index.ts` 后，Vitest collection 因 missing module 失败（0 tests），与预期一致。
- Security composition green：实现 `createOidcProviderSecurity` 后，`provider-wiring.test.ts` 3/3 tests passed。
- Claims Adapter naming red：claims suite 切换到 `createOidcClaimsAdapter` 后，7/7 tests 以 `createOidcClaimsAdapter is not a function` 失败。
- Claims Adapter naming green：重命名 factory/type/deps 和全部调用点且不保留 alias 后，`claims.test.ts` 7/7 tests passed。
- Composition ownership red：新增 architecture guard 后，旧 production 明确报出 5 个目标违规：`composition/services/index.ts` 存在并物化两个 security factories，`composition/provider/index.ts` 依赖 mixed services 且使用 `globalSessionResolver` alias。guard 初版误报合法 provider consumers，已在 production 修改前收窄到 factory ownership。
- Composition ownership green：新增 `composition/security`、由 provider composition 物化 claims/policy、直接消费 `session.oidcSession` 并删除 `composition/services` 后，claims/provider-wiring/architecture 3 files、15 tests passed。
- Docs：更新现有 `backend-architecture.md` 与 `backend-implementation.md`；未新增 `docs/**/*.md`，两份文档已在 `docs/index.md` 标记 Current，无需新增索引条目。

### Final Verification

- Focused final：`pnpm --filter @iam/oidc-provider exec vitest run src/__tests__/claims.test.ts src/__tests__/provider-wiring.test.ts src/__tests__/session-security.test.ts src/__tests__/configuration.test.ts src/__tests__/token-flow.test.ts src/__tests__/architecture.test.ts`，6 files、22 tests passed。
- Full test：`pnpm --filter @iam/oidc-provider test`，19 files、73 tests passed；`http-server-logging` 3/3 passed，未触发 timing timeout。
- Typecheck：`pnpm --filter @iam/oidc-provider typecheck` passed。
- Lint：首次发现并修复 `composition/provider/index.ts` 的 1 条 import-order diagnostic；最终 `pnpm --filter @iam/oidc-provider lint` passed。
- Docs：`pnpm check:docs` passed，28 docs indexed。
- Verify skill：仓库 workflow 指定的 `$openspec-verify-change` 当前不可用；使用 `docs/workflows/verify.md` 的 Scope/Baseline/Select/Coverage/Run/Inspect/Record 门禁作为替代并记录全部证据。
- OpenSpec：child 与 umbrella `openspec validate ... --strict --no-interactive` passed；`pnpm check:openspec` 36/36 items passed，archive integrity 72 archives passed。仅保留既有精确 waiver：`2026-05-27-normalize-employment-organization-context` 有 2 个历史 incomplete tasks。
- Diff hygiene：`git diff --check` passed。
- Live smoke：探测 `http://127.0.0.1:30002/oidc/.well-known/openid-configuration` 与 Docker 映射 `http://127.0.0.1:30015/oidc/.well-known/openid-configuration`，均为 HTTP 000；当前没有运行中的 OIDC Provider，因此未覆盖 live discovery/JWKS/UserInfo smoke。真实 `oidc-provider` configuration/token-flow tests 与 full suite 已覆盖本 child 的可执行协议风险，运行态 smoke 留待服务可用或 Archive 前复核。

### Contract And Scope Review

- Discovery/supported flows/PKCE/client auth/redirect/CORS：configuration、provider-wiring、token-flow 与 full suite 保持通过；未修改对应配置常量或 public issuer path。
- Claims/token/session：production 仅重命名 Claims Adapter symbols 和移动 composition wiring；claims snapshot/token extra/binding/config/revocation focused assertions全部通过。
- Redis/provider storage：未修改 stores、storage、Redis key、TTL 或 Session Kernel implementation；provider composition 继续把相同 `oidcSession`/token facades 注入相同 hooks。
- Schema/dependency/deployment：无 `packages/db`、schema、migration、`package.json`、lockfile、env 或 deployment file diff。
- Port scope：`claims.port.ts`、`interaction.port.ts` 和 production port shapes 未修改，留给 `strengthen-backend-consumer-owned-ports`。
- Diff scope：仅包含本 child OpenSpec artifacts/evidence、OIDC claims/tests/composition wiring 与两份相邻 current docs；无下一 child 或无关历史修复。
