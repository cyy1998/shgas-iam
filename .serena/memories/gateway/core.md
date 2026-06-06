# Gateway Core

- Gateway workspace package: `gateway/apisix` (`@iam/gateway-apisix`).
- Root scripts delegate to gateway package: `gateway:apisix`, `gateway:apisix:validate`, `gateway:apisix:diff`, `gateway:apisix:apply`.
- Main sync entrypoint: `gateway/apisix/scripts/apisix-sync.ts`; tests live under `gateway/apisix/scripts/__tests__/`.
- Config files live under `gateway/apisix/config/` with dev config and prod example.
- APISIX manifests are split by environment and domain: `gateway/apisix/manifests/{dev,prod}/{iam,tender,gds}/`.
- Each manifest domain currently uses YAML files for `ssl`, `upstreams`, `consumers`, `services`, `routes`, and `plugin-configs`.
- Gateway package uses Bun, TypeScript, Antfu ESLint, and the `yaml` parser.