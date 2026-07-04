## ADDED Requirements

### Requirement: REST response helpers preserve envelope data types
REST response helper functions SHALL return typed API envelope values and SHALL NOT erase `data` to `any`.

#### Scenario: Success helper preserves data type
- **WHEN** code calls `resp.ok(data)` with a statically known data type
- **THEN** the returned value SHALL be typed as a success `ApiEnvelope` whose `data` type matches the provided data
- **AND** the returned envelope code SHALL be typed as success code `200`
- **AND** the helper SHALL NOT return `any`

#### Scenario: Success helper without data returns null data
- **WHEN** code calls `resp.ok()` without an explicit data value
- **THEN** the returned value SHALL keep the existing runtime shape `{ code: 200, data: null, message: "success" }`
- **AND** the returned value SHALL be typed with `data` as `null`

#### Scenario: Failure helper preserves diagnostic data type
- **WHEN** code calls `resp.fail(code, message, data)` with diagnostic data
- **THEN** the returned value SHALL be typed as an `ApiEnvelope` whose `data` type matches the diagnostic data
- **AND** the returned envelope code SHALL preserve the provided error code type
- **AND** the helper SHALL NOT return `any`

#### Scenario: Failure helper without data keeps null data
- **WHEN** code calls `resp.fail(code, message)` without diagnostic data
- **THEN** the returned value SHALL keep the existing runtime shape `{ code, data: null, message }`
- **AND** the returned value SHALL be typed with `data` as `null`

### Requirement: REST route handlers type-check response envelopes against OpenAPI schemas
REST route handlers SHALL retain enough response body type information for Hono/zod-openapi route handler types to compare returned envelopes with route response schemas.

#### Scenario: Handler response matches route schema
- **WHEN** a route response schema documents a success envelope with `data` type `T`
- **AND** the annotated route handler returns `c.json(resp.ok(data))` where `data` is assignable to `T`
- **THEN** TypeScript typecheck SHALL accept the handler return type

#### Scenario: Handler response does not match route schema
- **WHEN** a route response schema documents a success envelope with `data` type `T`
- **AND** the annotated route handler returns `c.json(resp.ok(data))` where `data` is not assignable to `T`
- **THEN** TypeScript typecheck SHALL reject the handler return type
- **AND** the mismatch SHALL NOT be hidden by `any` from the response helper

#### Scenario: Route handler type annotations remain the contract boundary
- **WHEN** a backend route module defines local route handler aliases from `BaseRouteHandler`, `PublicRouteHandler`, `InternalRouteHandler`, or an equivalent app route handler type
- **THEN** those handler aliases SHALL remain responsible for connecting OpenAPI route definitions to implementation return types
- **AND** response helper typing SHALL support that existing contract boundary without requiring per-handler runtime parsing

### Requirement: Admin REST adapters preserve generated handler response types
admin-api REST adapters that generate handlers from shared REST/tRPC operations SHALL preserve response envelope type checking against their OpenAPI route handler types.

#### Scenario: Adapter generated REST handler matches route schema
- **WHEN** an admin operation is converted to a REST handler through the adapter helper
- **AND** the operation output is assignable to the route success schema `data` type
- **THEN** TypeScript typecheck SHALL accept the generated handler as the corresponding admin route handler

#### Scenario: Adapter generated REST handler does not match route schema
- **WHEN** an admin operation is converted to a REST handler through the adapter helper
- **AND** the operation output is not assignable to the route success schema `data` type
- **THEN** TypeScript typecheck SHALL reject the generated handler or its type constraint
- **AND** the adapter SHALL NOT rely on an unconstrained cast that hides the mismatch

#### Scenario: Adapter runtime behavior is unchanged
- **WHEN** an admin operation succeeds through REST
- **THEN** the REST handler SHALL continue returning the existing success envelope shape
- **AND** the tRPC procedure behavior SHALL remain outside the REST envelope response body
