import { expect, test } from "bun:test";
import { fingerprintTemplateInputs, obsoleteTemplateDatabases, templateDatabaseName } from "../template-fingerprint.ts";

test("migrations and seed contents determine one stable PostgreSQL identifier", () => {
  const migration = { path: "migrations/001/migration.sql", content: "select 1" };
  const seed = { path: "seed.ts", content: "seed('admin')" };
  const baseline = fingerprintTemplateInputs([migration, seed]);
  expect(fingerprintTemplateInputs([seed, migration])).toBe(baseline);
  expect(fingerprintTemplateInputs([{ ...migration, content: "select 2" }, seed])).not.toBe(baseline);
  expect(fingerprintTemplateInputs([migration, { ...seed, content: "seed('guest')" }])).not.toBe(baseline);
  expect(templateDatabaseName(baseline)).toMatch(/^iam_e2e_tpl_[a-f0-9]{48}$/);
});

test("pruning stays within template names managed by the E2E runtime", () => {
  const current = templateDatabaseName(fingerprintTemplateInputs([{ path: "seed.ts", content: "current" }]));
  const old = templateDatabaseName(fingerprintTemplateInputs([{ path: "seed.ts", content: "old" }]));
  expect(obsoleteTemplateDatabases([current, old, "iam_e2e_tpl_unowned", "iam_e2e", "template0"], current)).toEqual([
    old,
  ]);
});
