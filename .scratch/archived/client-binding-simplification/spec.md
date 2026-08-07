# 收窄 Client Binding 并简化 Custom SSO 生命周期

## Problem Statement

当前 Session Kernel 把 `ClientBinding` 同时用于 Custom SSO 与 OIDC，但两个协议并不具有相同的生命周期需求。Custom SSO 在每次成功兑换时创建一个 Client Binding，再立即创建唯一的 Independent Client Credential 或 Gateway Local Session；两者重复保存 Principal Reference、client、protocol、配置版本、有效期、续期策略、索引和 metadata，并在每次解析时重复校验。这个中间层不出现在 Custom SSO HTTP contract、Authenticated Subject Context 或 Client Subject Projection 中，却增加了 Redis 对象、读写、续期、撤销、补偿和可观测计数。

OIDC 的情况不同：同一个 Provider Session 可以为多个 client 建立彼此隔离的生命周期，每个 client 的 Authorization Code、OIDC Claims Snapshot 和 Access Token 必须绑定到同一条可独立撤销的关系。OIDC Client Binding 因而具有真实语义，但当前 OIDC 又把同一关系同时保存为权威 Kernel Client Binding、最小 lookup/anchor 状态和一份不参与授权、CAS 或 ownership 判定的 `ProviderSessionBinding` full Redis 派生副本。

直接删除 Custom SSO Client Binding 还会失去一个现有的失败补偿能力：Credential Redis 写入可能已经提交，但调用方只收到异常；由于 `credentialId` 当前由 Session Kernel 在写入过程中生成，调用方无法精确找到并撤销结果未知的 Credential。系统不能用“无人拿到 bearer token”或等待 TTL 代替精确恢复，也不能为了原子性把包含投影、ORCAS 和 Grant lease 的整个流程耦合进一个跨模块大事务。

## Solution

把 Client Binding 收窄为 OIDC 专属领域概念。Custom SSO Authorization Grant 直接签发 client-scoped Credential，由 Credential 自己承载 Principal Reference、client、mode、配置版本、有效期、续期、Subject Access 与 client/protocol 撤销语义；Custom SSO 不再创建、解析或上报独立 Client Binding。

每个 Custom SSO Grant redemption attempt 最多拥有一个 Credential，并使用 reservation `attemptId` 作为写入前已知的 Credential identity。Session Kernel 接受该 identity，并以原子、fail-closed 的创建规则拒绝 active identity 冲突和 tombstone 重用。Credential 写入结果不确定、Grant lease 丢失或 consume 失败时，Custom SSO 按已知 identity 精确撤销；Grant 被释放后，下一次兑换产生新的 attempt 与 identity。

OIDC 保留权威 Kernel OIDC Client Binding，以及 `(Provider Session, client)` lookup、Principal anchor、generation membership 和 mapping owner。删除 `ProviderSessionBinding` full Redis 派生副本；provider-facing view 统一从 lookup 解析并经过 Kernel、Principal Session、Subject Access、client 与配置版本校验后重建。OIDC 的 Authorization Code、OIDC Claims Snapshot、Access Token、UserInfo、多 client 隔离、anchor generation CAS 和精确 cleanup 语义保持不变。

Admin 撤销响应继续保留 `revoked.bindings` 字段，审计与结构化日志继续记录该计数，但它只统计实际撤销的 OIDC Client Binding。Custom SSO 只计入 Credential，不创建虚拟 binding 维持历史数字。

发布采用维护窗口硬切换：冻结全部 IAM 认证与会话流量，部署 credential-only Custom SSO 与新的 OIDC 状态表示，随后清空全部 IAM live authentication/session state，验证没有旧会话残留后再恢复流量。清理范围包括 Principal Session、Custom SSO Grant/Credential/旧 Client Binding，以及 OIDC Provider Session、OIDC Client Binding、Protocol Artifact、Credential 和 token/session 状态；所有用户在发布后重新登录。用户、client 配置、Secret、Subject Facts 和其他持久业务数据不在清理范围。运行时不同时支持旧、新两种 artifact 形状。

## User Stories

1. As an IAM user, I want Custom SSO login behavior to remain unchanged, so that an internal lifecycle simplification does not disrupt access to business systems.
2. As an Independent client integrator, I want `POST /sso/token` to keep returning the same `sid`, `ttl`, and `subject` contract, so that my integration requires no protocol changes.
3. As a Gateway client integrator, I want callback redirects, local-session bearer values, and cookies to remain compatible, so that the gateway login flow continues to work after the cutover.
4. As a Custom SSO client, I want every issued Credential to remain scoped to my client code and current mode, so that credentials cannot be replayed across clients or modes.
5. As a Custom SSO client, I want configuration-version changes to invalidate old Grants and Credentials, so that stale configuration cannot continue authorizing access.
6. As an IAM user, I want disabled or deleted account state to invalidate Custom SSO Credentials, so that removing Client Binding does not bypass Subject Access Barrier enforcement.
7. As an IAM user, I want logout and session revocation to terminate my Custom SSO Credentials, so that credential-only lifecycle preserves current logout guarantees.
8. As a security operator, I want every Grant redemption attempt to own at most one Credential, so that duplicate issuance cannot arise from retries or concurrency.
9. As a security operator, I want Credential identity to be known before Redis persistence, so that an ambiguous write can be precisely confirmed or revoked.
10. As a security operator, I want an active Credential identity collision to fail closed, so that a new issuance cannot overwrite an existing bearer credential.
11. As a security operator, I want a revoked Credential identity to remain protected by its tombstone, so that retry cannot resurrect a previously invalidated credential.
12. As an IAM user, I want a transient redemption failure to release the Grant safely, so that I can retry without extending the original Grant expiry.
13. As an IAM user, I want a retried Grant redemption to receive a new attempt identity, so that a compensated earlier attempt cannot conflict with the retry.
14. As an on-call engineer, I want a Credential write that committed before a connection failure to be recoverable by identity, so that no unexplained active credential remains until TTL.
15. As an IAM maintainer, I want Custom SSO to store one lifecycle object instead of a binding-plus-credential pair, so that session behavior is easier to understand and change.
16. As an IAM maintainer, I want Custom SSO metadata and ownership checks to have one authoritative copy, so that duplicated values cannot drift or require cross-object validation.
17. As an IAM maintainer, I want principal, client, protocol, renewal, and revocation indexes to exist only where they carry behavior, so that Redis inventory has less redundant state.
18. As an IAM maintainer, I want future protocols not to reuse OIDC Client Binding by default, so that protocol-specific lifecycle differences remain explicit.
19. As an OIDC relying party, I want Authorization Code Flow behavior and token contracts to remain unchanged, so that the storage simplification is invisible to clients.
20. As an OIDC relying party, I want an Authorization Code to be issued only after a valid OIDC Client Binding and OIDC Claims Snapshot exist, so that code ownership remains fail closed.
21. As an OIDC relying party, I want Access Tokens and UserInfo to remain bound to the same client, Principal Session, Provider Session and configuration version, so that token substitution is rejected.
22. As an OIDC relying party, I want OIDC Claims Snapshot replay semantics to remain unchanged, so that later profile changes do not alter claims associated with an existing token.
23. As an IAM user, I want one Provider Session to continue supporting multiple OIDC clients independently, so that authorizing one client does not replace another.
24. As an IAM user, I want revoking one OIDC client lifecycle to leave other clients in the same Provider Session intact, so that client-specific logout or invalidation remains isolated.
25. As a security operator, I want Principal Session rotation to retain anchor generation and mapping-owner CAS protection, so that a stale authorization attempt cannot overwrite a newer login.
26. As an on-call engineer, I want OIDC publish response loss to retain idempotent confirmation semantics, so that an uncertain publication does not revoke a binding that may already own the mapping.
27. As an IAM maintainer, I want the OIDC provider-facing binding view to be reconstructed from authoritative state, so that a redundant full Redis record cannot become a second source of truth.
28. As an IAM maintainer, I want removal of the OIDC full record to preserve lookup, anchor and generation membership TTLs atomically, so that cleanup and concurrency behavior remain correct.
29. As an Admin operator, I want the session-revocation response shape to keep `revoked.bindings`, so that existing administrative clients do not break structurally.
30. As an Admin operator, I want `revoked.bindings` to count only real OIDC Client Binding objects, so that the reported number describes actual lifecycle state.
31. As an audit investigator, I want audit records and structured logs to use the same binding-count semantics as the Admin response, so that operational evidence is internally consistent.
32. As an observability owner, I want dashboards to distinguish OIDC bindings from Custom SSO credentials, so that reduced binding counts are not mistaken for incomplete revocation.
33. As a release engineer, I want the release procedure to invalidate all IAM live authentication and session state, so that the hard cut does not require application-level compatibility or migration logic.
34. As a release engineer, I want the release procedure to stop before session invalidation when maintenance-mode or target-environment preconditions fail, so that active traffic cannot recreate state during the cutover.
35. As a release engineer, I want all IAM authentication and session traffic frozen during deployment and reset, so that no old or new session can escape the boundary.
36. As an IAM user, I expect every existing login to become invalid after the release, so that the new lifecycle starts from a clean state even though I must authenticate again.
37. As an IAM operator, I want users, client configuration, Secrets and subject data preserved by the reset, so that only live login state is discarded.
38. As a release engineer, I want post-reset smoke coverage for Independent Custom SSO, Gateway Custom SSO and OIDC, so that fresh login works before traffic fully resumes.
39. As a test maintainer, I want feature behavior asserted through stable module Interfaces, so that internal key and object refactors do not force widespread test rewrites.
40. As a security reviewer, I want a real Redis contract test for commit-then-error behavior, so that exact ambiguous-write compensation is executable rather than assumed.
41. As an IAM maintainer, I want the glossary and ADR to use `OIDC Client Binding` consistently, so that implementation terminology does not drift back into Custom SSO.
42. As a future implementation agent, I want the accepted design, exclusions and test seams in one spec, so that implementation can be divided without reopening resolved decisions.

## Implementation Decisions

- `OIDC Client Binding` is the canonical term. It represents a client-specific lifecycle inside an OIDC Provider Session and is not a Custom SSO concept, client configuration, Credential or Client Subject Projection.
- The Session Kernel continues to own Principal Session, Credential, Protocol Artifact, tombstone, renewal and indexed revocation mechanics. Its binding lifecycle remains available for OIDC; Custom SSO stops creating or resolving it.
- Custom SSO Authorization Grant remains the one-time authorization state machine. Grant validation, redirect binding, client mode, configuration version, state, lease heartbeat, release and consume semantics remain unchanged.
- Each reserved Grant attempt owns at most one Custom SSO Credential. The reservation `attemptId` is the Credential identity known before the write; a released Grant receives a new attempt and therefore a new identity on retry.
- Credential issuance accepts a caller-supplied identity. Creation must atomically reject an existing active object, any matching tombstone, or conflicting ownership; it must never overwrite an existing Credential.
- A successful Custom SSO Credential continues to contain the Subject Access transition, Principal Reference, Principal Session reference, protocol, client code, renewal policy, expiry and strict mode/configuration metadata needed for independent validation.
- Custom SSO no longer duplicates mode or configuration version into a Client Binding. Credential resolution validates the Credential itself, the current client runtime/configuration, Subject Access Barrier and Principal Session.
- Independent Client Credential and Gateway Local Session remain distinct domain outcomes even if both use the Session Kernel Credential mechanism. Gateway-only ORCAS Session Identity remains isolated to Gateway metadata and contexts.
- Credential issue failure, ambiguous completion, Grant lease loss, consume conflict or post-issue validation failure must attempt exact revocation by the known identity before the Grant can be safely released. A missing object is a successful compensation outcome; Redis unavailability remains fail closed and observable.
- Custom SSO external HTTP, redirect, Cookie, response envelope and Client Subject Projection contracts do not change. No binding identifier is exposed.
- Principal Session logout, Subject Access disable/delete, client disable/delete, Custom SSO configuration change and protocol invalidation continue to revoke Custom SSO Credentials through their existing principal/client/protocol indexes.
- Session renewal extends eligible Custom SSO Credentials directly. Removing the parallel binding update must not widen expiry beyond the Principal Session or absolute expiry.
- OIDC retains one authoritative Kernel OIDC Client Binding per active `(Provider Session, client)` relationship, including the metadata and cleanup ownership required for anchor generation and client mapping.
- OIDC retains the minimal lookup from `(Provider Session, client)` to binding owner, the authoritative Principal anchor, generation membership and mapping-owner comparison. These states continue to be changed atomically by the OIDC state adapter.
- The full provider-session binding Redis value is removed. Normal reads and silent-client ensure flow both resolve the minimal lookup, validate the Kernel OIDC Client Binding and Principal Session, then reconstruct the provider-facing view.
- Removing the OIDC full value must not remove or weaken publication confirmation, response-loss recovery, compare-delete cleanup, last-member anchor removal, client isolation, configuration-version validation or Subject Access checks.
- OIDC Authorization Code, Access Token and OIDC Claims Snapshot ownership fields and validation remain intact. The feature does not merge OIDC and Custom SSO artifacts.
- Admin Session Management retains the numeric `revoked.bindings` response member. It reports actual OIDC Client Binding revocations only; Custom SSO affects Credential counts.
- Audit details and structured revocation logs use the same counter definition. Observability documentation must call out the expected post-cutover drop in Custom SSO binding counts.
- No database schema migration is required. All affected lifecycle state remains Redis-owned in accordance with the live-login-state decision.
- The feature is released through a maintenance-window hard cut. Runtime code does not support old and new Custom SSO or OIDC state representations at the same time.
- Release Operations owns the full IAM live-session invalidation through the environment's approved operational mechanism. This feature does not add an application-level reset command or Redis cleanup library; the release checklist is responsible for maintenance-mode, target-environment and clean-state verification.
- The reset invalidates Principal Sessions and all Custom SSO and OIDC live authentication/session state. Every user must authenticate again after traffic resumes.
- The reset must not delete or mutate persistent users, clients, protocol configuration, Secrets, Subject Facts or unrelated Redis state. It is not an unrestricted Redis database flush.
- OIDC full binding values may be removed or allowed to expire only after the new code no longer reads them. Any repository-external operator or script dependency on that key shape must be checked before release.
- ADR-0010 is the controlling architectural decision. It partially replaces the earlier Custom SSO Client Binding requirement while leaving the independent Custom SSO configuration, version barrier, Secret and redirect decisions intact.

## Testing Decisions

- Good tests assert observable behavior through a Module Interface: returned protocol result, accepted or rejected Credential, Grant state, revocation summary, OIDC code/token lifecycle, cleanup outcome and stable error classification. Business-level tests must not depend on raw Redis key names or serialized internal objects.
- Two highest-level business seams are used because Custom SSO and OIDC intentionally own separate protocol lifecycles. Creating one cross-protocol seam would contradict the accepted architecture.
- The Custom SSO final-operation Interface is the primary seam for Independent Grant redemption and Gateway login completion. It must cover successful credential-only issuance, unchanged external results, current configuration checks, Subject Access behavior, Grant lease loss, consume conflict, retry with a new attempt, logout and protocol/client invalidation.
- Existing Custom SSO session-kernel adapter component integration tests are prior art. Replace binding-specific assertions with observable Credential, Grant, response and revocation outcomes rather than layering new tests over obsolete object-shape tests.
- A narrow Session Kernel Redis contract seam covers the failure that cannot be proven at the HTTP level: `MULTI/EXEC` commits and the adapter then reports an error. The test must prove that the caller-known identity resolves or revokes the committed Credential, that no active object survives compensation, and that missing-write compensation is idempotent.
- Session Kernel contract coverage must include active identity collision, tombstone reuse, index consistency, direct Credential renewal, principal cascade, client/protocol invalidation and natural expiry. Existing Session Kernel integration tests are prior art.
- The OIDC authorization lifecycle Interface is the primary OIDC seam. Tests must cover Authorization Code creation before persistence, Claims Snapshot binding, Access Token registration, UserInfo replay, silent authorization for a second client, independent client revocation and Principal Session rotation.
- Existing OIDC Redis adapter and authorization-lifecycle component integration tests are prior art for the highest-level behavior. They should continue passing without inspecting the deleted full value.
- A narrow OIDC provider-session state Redis contract verifies the changed Lua/storage representation: publication, response-loss confirmation, refresh TTL, owner comparison, generation membership, last-member anchor cleanup and destroy fences work with only lookup/anchor/member state. This is the only seam that should assert absence of the deleted full Redis record.
- Admin Session Management contract tests keep the `revoked.bindings` response member and prove that OIDC revocation increments it while Custom SSO Credential revocation does not. Audit-event and structured-log tests must assert the same semantics.
- No repository-owned reset operation is added by this feature. Application integration tests must prove that missing server-side state invalidates old Cookies, SIDs and tokens; Release Operations separately owns environment-specific invalidation evidence and clean-state verification.
- Release smoke coverage must prove old Cookies, SIDs and tokens no longer authenticate, then cover a fresh IAM login followed by Independent token exchange, Independent authenticated user-info, Gateway callback/local session, Gateway authorization, Custom SSO logout and OIDC Authorization Code/Token/UserInfo.
- Failure tests must distinguish retryable Subject Projection or Subject Access unavailability from invalid client, configuration mismatch, consumed Grant and invalid Credential; the feature must not broaden `401`, `403` or `503` mappings.
- Performance checks should demonstrate that Custom SSO happy-path lifecycle writes, reads, renewals and revocations do not increase and that OIDC lookup-to-Kernel reconstruction does not add a new database read relative to the existing authoritative read path.
- Documentation validation uses the repository docs index guard and whitespace validation. Implementation tickets select focused Unit/Integration collections according to the affected Module; full repository verification is deferred to merge preparation.

## Out of Scope

- Removing the OIDC Client Binding lifecycle itself.
- Merging OIDC Provider Session, Principal Session or OIDC Claims Snapshot into one object.
- Sharing Custom SSO and OIDC configuration, Secret, wire contracts, snapshots, grants, credentials or sessions.
- Changing Custom SSO endpoint paths, request parameters, response envelopes, redirect behavior, Cookie names or subject projection wire shape.
- Changing OIDC discovery, endpoints, scopes, claims, token formats, client authentication, redirect rules or logout behavior.
- Changing Subject Identifier, Subject Facts, Client Subject Projection, Authorization Freshness Barrier or Subject Access Barrier semantics.
- Adding a database table or PostgreSQL shadow for Client Binding, Credential, Grant or other live session state.
- Accepting ambiguous Credential writes as harmless orphan state until TTL.
- Combining projection, ORCAS, Grant consume and Credential persistence into one cross-module Redis transaction or Lua script.
- Maintaining a rolling runtime compatibility path for both old and new Custom SSO artifact shapes.
- Building a new general-purpose session-reset command, Redis cleanup library or deployment automation.
- Preserving any active Principal Session, Custom SSO session or OIDC session/token across the hard cut.
- Deleting users, clients, protocol configuration, Secrets, Subject Facts or unrelated Redis state during the session reset.
- Emitting virtual Custom SSO binding counts for Admin, audit or observability compatibility.
- Introducing refresh tokens, consent, pairwise subject, dynamic client registration or other unrelated OIDC capabilities.
- Reworking ORCAS login ownership or third-party systems' own local sessions.
- Proving that every production environment has already completed earlier Subject Projection migration; release execution must gather its own current-state evidence.

## Further Notes

- Stable terminology is defined in `CONTEXT.md`; ADR-0010 records the accepted lifecycle, recovery, counter and cutover decisions. The existing independent Custom SSO configuration and Client Subject Projection decisions remain authoritative where ADR-0010 does not explicitly replace them.
- Repository code and executable tests prove the current binding-backed behavior. Repository documents do not prove the live Redis contents or deployment version of every environment; release preparation must verify that the reset covers every deployed IAM live-state namespace and collect maintenance-window evidence.
- The post-deployment full-session reset is a Release Operations responsibility rather than a `ready-for-agent` implementation ticket. Executing it still requires separate environment-specific authorization.
- The current OIDC full binding key has no known production authorization consumer, but deployment repositories, dashboards and operator scripts are outside the evidence available here and must be checked before removal.
- This spec is ready to be decomposed with `/to-tickets`. Publishing the spec does not authorize implementation, cleanup, deployment, merge, push or any external side effect.
