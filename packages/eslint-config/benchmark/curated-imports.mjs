export default Promise.all([
  import("@typescript-eslint/eslint-plugin"),
  import("@typescript-eslint/parser"),
  import("eslint-plugin-import-lite"),
  import("eslint-plugin-n"),
  import("eslint-plugin-unused-imports"),
]);
