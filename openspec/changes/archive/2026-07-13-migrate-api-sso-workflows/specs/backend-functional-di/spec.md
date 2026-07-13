## ADDED Requirements

### Requirement: SSO Workflows Use Operation-Specific Application Use-Cases

API backend SHALL expose authorize、callback、code exchange、OA login、WeChat login and logout as separate Application Use Case
facades. Each facade SHALL own its workflow coordination and SHALL receive only protocol-independent input and minimal request context.

#### Scenario: Authorize owns client and session authorization
- **WHEN** `/sso/authorize` has resolved the principal token and token source
- **THEN** route SHALL call the authorize use-case with client code、redirect URL、token、token source and request context
- **AND** the use-case SHALL preserve client lookup、redirect allowlist validation and Custom SSO Session authorization order
- **AND** the route SHALL continue to choose login or callback redirect from the use-case result

#### Scenario: Callback owns Gateway local-session creation
- **WHEN** `/sso/callback` receives code、client and redirect URL
- **THEN** route SHALL call the callback use-case with primitives and request context
- **AND** the use-case SHALL preserve client/redirect validation、one-time auth-code consume、required ORCAS login and Gateway
  local-session creation order
- **AND** ORCAS failure MUST prevent returning a Gateway local token

#### Scenario: Code exchange owns Independent local-session creation
- **WHEN** `/sso/token` receives code、client and client secret
- **THEN** route SHALL call the code-exchange use-case
- **AND** the use-case SHALL preserve client-secret validation、one-time auth-code consume and Independent local-session creation order
- **AND** it SHALL return the existing sid、ttl and userInfo result

#### Scenario: Third-party logins own identity and PrincipalSession workflow
- **WHEN** OA or WeChat login receives validated protocol primitives
- **THEN** route SHALL call the matching OA-login or WeChat-login use-case
- **AND** OA login SHALL preserve timestamp/signature、Formal active-user、password-independent PrincipalSession and audit semantics
- **AND** WeChat login SHALL preserve exchange、cache/retry、active-user、PrincipalSession and audit semantics

#### Scenario: Logout owns session invalidation
- **WHEN** `/sso/logout` or OA pre-login cleanup resolves a session token
- **THEN** route SHALL call the logout use-case
- **AND** the use-case SHALL delegate to the existing Custom SSO Session logout behavior
- **AND** cookie deletion and redirect SHALL remain route-owned

### Requirement: SSO Collaborators Ports And Guards Enforce Ownership

Shared SSO workflow collaborators SHALL use explicit roles, new SSO `*.port.ts` modules SHALL directly declare consumed methods and
neutral data shapes, and architecture tests SHALL prevent migrated route application workflow from returning.

#### Scenario: Redirect validator preserves allowlist behavior
- **WHEN** authorize or callback validates a client redirect URL
- **THEN** both use-cases SHALL consume the same injected redirect validator contract
- **AND** the validator SHALL preserve http/https syntax、wildcard/path matching、invalid historical pattern skipping and warning context
- **AND** it MUST NOT own client lookup or HTTP redirect construction

#### Scenario: SSO port owns its methods and data shapes
- **WHEN** an SSO use-case needs client、user、session、integration、Redis、delay or audit behavior
- **THEN** its port SHALL declare only the methods it calls
- **AND** it MUST NOT use `Pick<...Repository>`、`Pick<...Service>` or import concrete route/service/adapter modules or repository-owned
  DTO types
- **AND** composition SHALL adapt existing production implementations structurally

#### Scenario: SSO route application regression fails architecture guard
- **WHEN** migrated `routes/sso` restores `sso.service.ts`、`sso.port.ts`、a `create*Service` factory or stateful workflow dependency
- **THEN** API architecture tests SHALL fail with the offending file、role or dependency
