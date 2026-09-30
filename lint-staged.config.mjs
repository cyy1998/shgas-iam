export default {
  "*": ["node scripts/run-quality.mjs lint-fix --files", "node scripts/run-quality.mjs format --files"],
};
