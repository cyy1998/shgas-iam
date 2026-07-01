## ADDED Requirements

### Requirement: API user-profile DSL env limit
API app SHALL expose user-profile DSL search limits through app-prefixed raw env and grouped runtime config.

#### Scenario: API DSL max limit uses IAM_API prefix
- **WHEN** `apps/api` parses runtime env for user-profile DSL search
- **THEN** raw env schema SHALL accept `IAM_API_USER_PROFILE_DSL_MAX_LIMIT`
- **AND** raw env schema MUST NOT accept `USER_PROFILE_DSL_MAX_LIMIT` or other old naked variable names as fallback

#### Scenario: DSL max limit stays behind env boundary
- **WHEN** API code needs to validate `/internal/users/search-dsl` request limit
- **THEN** app code SHALL consume a grouped runtime config field such as `env.userProfile.dslMaxLimit`
- **AND** app code outside `env.ts` and env tests MUST NOT reference raw env key `IAM_API_USER_PROFILE_DSL_MAX_LIMIT`

#### Scenario: DSL max limit has safe default
- **WHEN** `IAM_API_USER_PROFILE_DSL_MAX_LIMIT` is not provided
- **THEN** API runtime config SHALL provide a bounded default value
- **AND** requests above that effective limit SHALL be rejected before executing profile search
