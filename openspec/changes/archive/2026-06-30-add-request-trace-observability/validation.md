## Validation Notes

Date: 2026-06-30

Completed checks:

- `pnpm --filter @iam/api-core test`
- `pnpm --filter @iam/api test`
- `pnpm --filter @iam/admin-api test`
- `pnpm --filter @iam/oidc-provider test`
- `pnpm --filter @iam/gateway-apisix test`
- `pnpm --filter @iam/gateway-apisix typecheck`
- `pnpm --filter @iam/admin test`
- `pnpm --filter @iam/admin typecheck`
- `pnpm gateway:apisix:validate -- --env dev:iam`
- `pnpm --filter @iam/gateway-apisix typecheck`
- `pnpm gateway:apisix:validate -- --env dev:iam --env-file .env.example`
- `pnpm gateway:apisix:validate -- --env prod:iam --env-file ../docker/.env.prod.example`
- `docker run --rm -v "$PWD/observability/alloy:/etc/alloy:ro" grafana/alloy:v1.9.2 validate --stability.level=experimental /etc/alloy/iam-logs.dev.alloy`
- `docker run --rm -v "$PWD/observability/alloy:/etc/alloy:ro" grafana/alloy:v1.9.2 validate --stability.level=experimental /etc/alloy/iam-logs.prod.alloy`

Gateway smoke status:

- Recreated the dev Alloy and APISIX services with `APISIX_OTEL_COLLECTOR_ENDPOINT=alloy:4318 docker compose -p shgas-iam --profile observability -f docker/docker-compose-dev.yml up -d --force-recreate --remove-orphans alloy apisix`. This removed the stale local `otel-collector` orphan container from the earlier implementation.
- Applied the IAM APISIX manifest with `pnpm gateway:apisix:apply -- --env dev:iam --env-file .env.example --admin-url http://127.0.0.1:9180/apisix/admin --admin-key dev-local-admin-key-change-me`.
- Confirmed APISIX plugin metadata uses `collector.address=alloy:4318`.
- Rebuilt the local `api` service with `docker compose -p shgas-iam -f docker/docker-compose-dev.yml up -d --build api` so the smoke used this change's current implementation.
- Sent a smoke request:
  - path: `POST http://localhost:30080/api/iam/open/code/verify`
  - `X-Request-Id: smoke-request-trace-alloy-001`
  - `traceparent: 00-dddddddddddddddddddddddddddddddd-eeeeeeeeeeeeeeee-01`
  - body: `{"phoneNumber":"13087009687","usage":"login","code":"000000"}`
- Response evidence: HTTP `200`, response header `X-Request-Id: smoke-request-trace-alloy-001`, body `{"code":200,"data":{"result":false},"message":"success"}`.
- Gateway access log evidence: `requestId=smoke-request-trace-alloy-001`, `traceId=dddddddddddddddddddddddddddddddd`, `spanId=9c9a9c4bad517a96`, `traceparent=00-dddddddddddddddddddddddddddddddd-9c9a9c4bad517a96-01`, `path=/open/code/verify`, `statusCode=200`.
- Backend request log evidence: `sourceApp=iam-api`, `event=http.request.completed`, `requestId=smoke-request-trace-alloy-001`, `traceId=dddddddddddddddddddddddddddddddd`, `path=/open/code/verify`, `statusCode=200`.
- Audit table evidence: `audit_log.id=95`, `source_app=iam`, `action=auth.sms_code.verify`, `outcome=failure`, `request_id=smoke-request-trace-alloy-001`, `trace_id=dddddddddddddddddddddddddddddddd`, `route=/open/code/verify`, `method=POST`, `target_type=mobile`, `target_code=130****9687`.
- Alloy evidence: `otelcol.exporter.debug.apisix` logged a traces batch after the smoke request (`resource spans=1`, `spans=1`).
