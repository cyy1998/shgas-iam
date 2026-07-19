import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, expect, test } from "bun:test";

const checkerPath = join(import.meta.dirname, "..", "check-workflow.ts");
const preCommitHookPath = join(import.meta.dirname, "..", "..", ".husky", "pre-commit");
const temporaryRoots: string[] = [];
const ledgerFields = [
  "Workflow-Version",
  "Feature-Slug",
  "Workflow-Kind",
  "Stage",
  "Feature-Branch",
  "Target-Branch",
  "Target-Base",
  "Ticketing-Authorization",
  "Implementation-Authorization",
  "Authorized-Implementation-Scope",
  "Current-Ticket",
  "Current-Ticket-Base",
  "Change-Types",
  "Affected-Workspaces",
  "Validation-Plan",
  "Content-Head",
  "Verified-Content-Head",
  "Reviewed-Content-Head",
  "Merge-Target-Tip",
  "Final-Squash-Commit",
] as const;
const ledgerHeadings = [
  "范围与验收",
  "Validation Plan",
  "阶段证据",
  "验证记录",
  "评审记录",
  "授权记录",
  "Waivers",
  "重开与修复",
  "Merge brief",
  "Delivery receipt",
] as const;

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (!root.startsWith(tmpdir()))
      throw new Error(`拒绝清理非临时目录：${root}`);
    rmSync(root, { recursive: true, force: true });
  }
});

test("合法 standard 记录树通过全局格式检查", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("Workflow 记录格式检查通过：1 个 v2 feature，0 个 legacy feature。\n");
});

test("合法 standard 记录树使用 CRLF 时仍通过格式检查", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const featureRoot = join(repository, ".scratch", "example-feature");
  const markdownPaths = [
    join(featureRoot, "delivery.md"),
    join(featureRoot, "spec.md"),
    join(featureRoot, "issues", "01-example.md"),
  ];
  for (const path of markdownPaths) {
    const content = readFileSync(path, "utf8").replace(/\r?\n/g, "\r\n");
    writeFileSync(path, content, "utf8");
  }

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("Workflow 记录格式检查通过：1 个 v2 feature，0 个 legacy feature。\n");
});

test("pre-commit 拒绝 staged 非法但工作树已修复的记录", () => {
  const repository = createHookRepository();
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const validDelivery = readFileSync(deliveryPath, "utf8");
  writeFileSync(deliveryPath, validDelivery.replace(/^Stage:.*\n/m, ""), "utf8");
  runGit(repository, "add", ".scratch/example-feature/delivery.md");
  writeFileSync(deliveryPath, validDelivery, "utf8");

  const result = runPreCommitHook(repository);

  expect(result.exitCode).toBe(1);
  expect(`${result.stdout}${result.stderr}`).toContain("缺少必需字段 `Stage`");
});

test("pre-commit 接受 staged 合法但工作树已损坏的记录", () => {
  const repository = createHookRepository();
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const validDelivery = readFileSync(deliveryPath, "utf8");
  writeFileSync(deliveryPath, validDelivery.replace(/^Stage:.*\n/m, ""), "utf8");

  const result = runPreCommitHook(repository);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Workflow 记录格式检查通过：1 个 v2 feature，0 个 legacy feature。");
});

test("缺少必需 ledger 字段时报告文件和修复动作", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace("Feature-Slug: example-feature\n", "");
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toBe(`Workflow 记录格式检查失败：
- .scratch/example-feature/delivery.md：观测值：缺少必需字段 \`Feature-Slug\`；预期：顶层 header 恰好包含一个 \`Feature-Slug: <value>\`；下一步：补充且只保留一个 \`Feature-Slug: <value>\`。
`);
});

test("重复 ledger 字段时拒绝不明确的记录", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace(
    "Feature-Slug: example-feature\n",
    "Feature-Slug: example-feature\nFeature-Slug: shadow-feature\n",
  );
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("观测值：字段 `Feature-Slug` 必须恰好出现一次，实际出现 2 次");
});

test("ledger 顶层字段顺序错误时报告相邻字段", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace(
    "Feature-Slug: example-feature\nWorkflow-Kind: standard",
    "Workflow-Kind: standard\nFeature-Slug: example-feature",
  );
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("观测值：顶层字段顺序错误；`Workflow-Kind` 必须位于 `Feature-Slug` 之后");
});

test("ledger 字段移入正文时仍视为缺少顶层字段", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8")
    .replace("Feature-Slug: example-feature\n", "")
    .replace("## 范围与验收\n", "## 范围与验收\n\nFeature-Slug: example-feature\n");
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("缺少必需字段 `Feature-Slug`");
});

test("可识别 v2 ledger 的每个其余顶层字段都必须存在", () => {
  for (const field of ledgerFields.filter(field => field !== "Workflow-Version")) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
    const delivery = readFileSync(deliveryPath, "utf8").replace(new RegExp(`^${field}:.*\\n`, "m"), "");
    writeFileSync(deliveryPath, delivery, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`缺少必需字段 \`${field}\``);
  }
});

test("ledger 枚举字段只接受契约允许值", () => {
  const cases = [
    ["Workflow-Kind", "extended"],
    ["Stage", "done"],
    ["Ticketing-Authorization", "yes"],
    ["Implementation-Authorization", "yes"],
    ["Validation-Plan", "ready"],
  ] as const;

  for (const [field, value] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceLedgerField(repository, field, value);

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`字段 \`${field}\` 的值 \`${value}\` 不在允许范围内`);
  }
});

test("ledger SHA 字段只接受完整十六进制值或契约占位符", () => {
  const cases = [
    ["Target-Base", "abc"],
    ["Content-Head", "1234"],
    ["Verified-Content-Head", "head"],
    ["Reviewed-Content-Head", "reviewed"],
    ["Merge-Target-Tip", "main"],
    ["Final-Squash-Commit", "done"],
    ["Current-Ticket-Base", "base"],
  ] as const;

  for (const [field, value] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceLedgerField(repository, field, value);

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`字段 \`${field}\` 的 SHA 格式错误`);
  }
});

test("Feature-Slug 必须使用规范格式并与目录一致", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  replaceLedgerField(repository, "Feature-Slug", "other_feature");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("字段 `Feature-Slug` 必须是小写 kebab-case");
  expect(result.stderr).toContain("字段 `Feature-Slug` 必须与目录名 `example-feature` 一致");
});

test("delivery 使用规范中文交付记录标题", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace("# 示例功能交付记录", "# Example 交付记录");
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("delivery 标题必须使用 `# <中文功能名>交付记录` 格式");
});

test("delivery 的每个必需章节都必须存在", () => {
  for (const heading of ledgerHeadings) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
    const delivery = readFileSync(deliveryPath, "utf8").replace(`## ${heading}\n`, "");
    writeFileSync(deliveryPath, delivery, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, heading).toBe(1);
    expect(result.stderr, heading).toContain(`缺少必需章节 \`## ${heading}\``);
  }
});

test("delivery 的必需章节不得重复", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const duplicatePath = join(repository, ".scratch", "example-feature", "delivery.md");
  const duplicate = readFileSync(duplicatePath, "utf8").replace("## 验证记录\n", "## 验证记录\n\n## 验证记录\n");
  writeFileSync(duplicatePath, duplicate, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("章节 `## 验证记录` 必须恰好出现一次，实际出现 2 次");
});

test("delivery 的必需章节按契约排序", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const unorderedPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const unordered = readFileSync(unorderedPath, "utf8")
    .replace("## 阶段证据", "## __TEMP__")
    .replace("## 验证记录", "## 阶段证据")
    .replace("## __TEMP__", "## 验证记录");
  writeFileSync(unorderedPath, unordered, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("章节顺序错误；`## 验证记录` 必须位于 `## 阶段证据` 之后");
});

test("delivery code fence 内的字段与章节示例不参与校验", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = `${readFileSync(deliveryPath, "utf8")}
\`\`\`markdown
Workflow-Version: 2
Feature-Slug: shadow-feature
## 验证记录
\`\`\`
`;
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("standard workflow 必须包含 spec", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  rmSync(join(repository, ".scratch", "example-feature", "spec.md"));

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("standard feature 缺少 `spec.md`");
});

test("standard workflow 的 spec.md 必须是普通文件", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const specPath = join(repository, ".scratch", "example-feature", "spec.md");
  rmSync(specPath);
  mkdirSync(specPath);

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("standard feature 的 `spec.md` 不是普通文件");
});

test("standard spec 使用中文一级标题", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const specPath = join(repository, ".scratch", "example-feature", "spec.md");
  writeFileSync(specPath, "# Example specification\n\n**Status:** approved\n", "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("spec 标题必须使用 `# <中文标题>` 格式");
});

test("standard spec 的 Status 唯一且只接受 draft 或 approved", () => {
  const cases = [
    ["missing", "# 示例规格\n"],
    ["duplicate", "# 示例规格\n\n**Status:** draft\n**Status:** approved\n"],
    ["invalid", "# 示例规格\n\n**Status:** ready-for-agent\n"],
  ] as const;

  for (const [name, spec] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const specPath = join(repository, ".scratch", "example-feature", "spec.md");
    writeFileSync(specPath, spec, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain(name === "invalid"
      ? "spec 的 `Status` 只接受 `draft` 或 `approved`"
      : "spec 的 `Status` 必须恰好出现一次");
  }
});

test("spec code fence 内的 Status 示例不参与结构校验", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const specPath = join(repository, ".scratch", "example-feature", "spec.md");
  writeFileSync(specPath, `# 示例规格

**Status:** approved

\`\`\`markdown
**Status:** draft
\`\`\`
`, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("standard workflow 必须包含至少一张 ticket", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  rmSync(join(repository, ".scratch", "example-feature", "issues"), { recursive: true });

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("standard feature 必须在 `issues/` 中包含至少一张 ticket");
});

test("standard workflow 的 ticket 路径必须是普通文件", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  rmSync(ticketPath);
  mkdirSync(ticketPath);

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("ticket 路径 `01-example.md` 不是普通文件");
  expect(result.stderr).not.toContain("EISDIR");
});

test("quick workflow 使用 quick 分支格式", () => {
  const repository = createRepository();
  writeValidQuickFeature(repository);
  replaceLedgerField(repository, "Feature-Branch", "codex/small-change", "small-change");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("quick feature 的 `Feature-Branch` 必须是 `codex/quick-small-change`");
});

test("失败诊断包含位置、观测值、预期结构和下一安全动作", () => {
  const repository = createRepository();
  writeValidQuickFeature(repository);
  replaceLedgerField(repository, "Feature-Branch", "codex/small-change", "small-change");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain(".scratch/small-change/delivery.md");
  expect(result.stderr).toContain("观测值：");
  expect(result.stderr).toContain("预期：");
  expect(result.stderr).toContain("下一步：");
});

test("quick workflow 使用 not-applicable ticket 授权", () => {
  const repository = createRepository();
  writeValidQuickFeature(repository);

  expect(runChecker(repository).exitCode).toBe(0);

  replaceLedgerField(repository, "Ticketing-Authorization", "granted", "small-change");
  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("quick feature 的 `Ticketing-Authorization` 必须是 `not-applicable`");
});

test("quick workflow 在范围与验收章节直接记录 checkbox", () => {
  const repository = createRepository();
  writeValidQuickFeature(repository);
  const deliveryPath = join(repository, ".scratch", "small-change", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace("- [ ] 快速改动记录格式完整。", "- 快速改动记录格式完整。");
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("quick feature 的 `范围与验收` 必须包含至少一个 checkbox");
});

test("feature 选择模式只检查指定 v2 记录", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);

  const selected = runChecker(repository, ["--feature", "example-feature"]);

  expect(selected.exitCode).toBe(0);
  expect(selected.stderr).toBe("");
  expect(selected.stdout).toBe("Workflow 记录格式检查通过：feature `example-feature`。\n");
});

test("feature 选择模式拒绝不存在的 slug", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);

  const missing = runChecker(repository, ["--feature", "missing-feature"]);

  expect(missing.exitCode).toBe(1);
  expect(missing.stderr).toContain("未找到 feature `missing-feature`");
});

test("feature 选择模式拒绝同名普通文件", () => {
  const repository = createRepository();
  mkdirSync(join(repository, ".scratch"), { recursive: true });
  writeFileSync(join(repository, ".scratch", "example-feature"), "not a feature directory", "utf8");

  const result = runChecker(repository, ["--feature", "example-feature"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("feature `example-feature` 无法解析：对应路径不是目录");
});

test("feature 选择模式拒绝多个 v2 目录声明同一 slug", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const originalRoot = join(repository, ".scratch", "example-feature");
  const duplicateRoot = join(repository, ".scratch", "shadow-feature");
  mkdirSync(join(duplicateRoot, "issues"), { recursive: true });
  for (const file of ["delivery.md", "spec.md"]) {
    writeFileSync(join(duplicateRoot, file), readFileSync(join(originalRoot, file), "utf8"), "utf8");
  }
  writeFileSync(
    join(duplicateRoot, "issues", "01-example.md"),
    readFileSync(join(originalRoot, "issues", "01-example.md"), "utf8"),
    "utf8",
  );

  const result = runChecker(repository, ["--feature", "example-feature"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Feature-Slug `example-feature` 被 2 个 v2 feature 声明");
});

test("feature 选择模式用中文诊断不可读取的 delivery", () => {
  const repository = createRepository();
  mkdirSync(join(repository, ".scratch", "example-feature", "delivery.md"), { recursive: true });

  const result = runChecker(repository, ["--feature", "example-feature"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("feature `example-feature` 无法解析：`delivery.md` 不是普通文件");
  expect(result.stderr).not.toContain("EISDIR");
});

test("参数错误会说明观测值且保持记录树只读", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const before = snapshotTree(repository);

  const result = runChecker(repository, ["--all"]);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("收到参数：`--all`");
  expect(result.stderr).toContain("下一步：使用 `pnpm check:workflow`");
  expect(snapshotTree(repository)).toEqual(before);
});

test("全局模式只计数 legacy feature", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const legacyRoot = join(repository, ".scratch", "legacy-effort");
  mkdirSync(legacyRoot, { recursive: true });
  writeFileSync(join(legacyRoot, "delivery.md"), "# Legacy delivery\n\nStatus: in-progress\n", "utf8");

  const global = runChecker(repository);
  expect(global.exitCode).toBe(0);
  expect(global.stdout).toBe("Workflow 记录格式检查通过：1 个 v2 feature，1 个 legacy feature。\n");
});

test("feature 选择模式拒绝未 adoption 的 legacy 记录", () => {
  const repository = createRepository();
  const legacyRoot = join(repository, ".scratch", "legacy-effort");
  mkdirSync(legacyRoot, { recursive: true });
  writeFileSync(join(legacyRoot, "delivery.md"), "# Legacy delivery\n\nStatus: in-progress\n", "utf8");

  const selected = runChecker(repository, ["--feature", "legacy-effort"]);

  expect(selected.exitCode).toBe(1);
  expect(selected.stderr).toContain("feature `legacy-effort` 尚未 adoption 为 v2");
});

test("没有 Workflow-Version 2 的 delivery 仍按 legacy 处理", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace("Workflow-Version: 2\n", "");
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe("Workflow 记录格式检查通过：0 个 v2 feature，1 个 legacy feature。\n");
});

test("Validation Plan 使用固定四列表头", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const missingHeaderPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const missingHeader = readFileSync(missingHeaderPath, "utf8").replace(
    "| Scope | Change-Types | Affected-Workspaces | Required-Commands |",
    "| Scope | Commands |",
  );
  writeFileSync(missingHeaderPath, missingHeader, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`Validation Plan` 缺少固定四列表头");
});

test("Validation Plan 使用唯一的固定四列分隔行", () => {
  for (const separator of ["", "|-|-|-|-|"]) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
    const delivery = readFileSync(deliveryPath, "utf8").replace("|---|---|---|---|", separator);
    writeFileSync(deliveryPath, delivery, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, separator || "missing").toBe(1);
    expect(result.stderr, separator || "missing").toContain("`Validation Plan` 必须包含唯一的固定四列分隔行");
  }
});

test("Validation Plan 的唯一表头与分隔行必须相邻", () => {
  const cases = [
    [
      "duplicate header",
      "| Scope | Change-Types | Affected-Workspaces | Required-Commands |\n| Scope | Change-Types | Affected-Workspaces | Required-Commands |\n|---|---|---|---|",
    ],
    [
      "separated rows",
      "| Scope | Change-Types | Affected-Workspaces | Required-Commands |\n| feature | agent-config | root | `pnpm test:workflow` |\n|---|---|---|---|",
    ],
  ] as const;

  for (const [name, replacement] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
    const delivery = readFileSync(deliveryPath, "utf8").replace(
      "| Scope | Change-Types | Affected-Workspaces | Required-Commands |\n|---|---|---|---|",
      replacement,
    );
    writeFileSync(deliveryPath, delivery, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("`Validation Plan` 的唯一表头必须紧邻唯一固定分隔行");
  }
});

test("Validation Plan 的数据行包含四个非空单元格", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const malformedRowPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const malformedRow = readFileSync(malformedRowPath, "utf8").replace(
    "| feature | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |",
    "| feature | agent-config | root |",
  );
  writeFileSync(malformedRowPath, malformedRow, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`Validation Plan` 数据行必须包含 4 个非空单元格");
});

test("Validation Plan 的 scope 行唯一且覆盖当前文档中的 tickets", () => {
  const cases = [
    ["duplicate", "| ticket:01 | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |\n| ticket:01 | agent-config | root | `pnpm test:workflow` |", "scope `ticket:01` 必须恰好出现一次"],
    ["missing-ticket", "", "scope `ticket:01` 必须恰好出现一次"],
    ["missing-feature", "| ticket:01 | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |", "scope `feature` 必须恰好出现一次"],
    ["extra-ticket", "| ticket:01 | agent-config | root | `pnpm test:workflow` |\n| ticket:02 | agent-config | root | `pnpm test:workflow` |\n| feature | agent-config | root | `pnpm test:workflow` |", "Validation Plan 包含未发布 scope `ticket:02`"],
  ] as const;

  for (const [name, replacement, message] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
    const delivery = readFileSync(deliveryPath, "utf8").replace(
      "| ticket:01 | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |\n| feature | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |",
      replacement,
    );
    writeFileSync(deliveryPath, delivery, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain(message);
  }
});

test("quick Validation Plan 只接受唯一 feature scope", () => {
  const repository = createRepository();
  writeValidQuickFeature(repository);
  const deliveryPath = join(repository, ".scratch", "small-change", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace(
    "| feature | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |",
    "| ticket:01 | agent-config | root | `pnpm test:workflow` |\n| feature | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |",
  );
  writeFileSync(deliveryPath, delivery, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("quick Validation Plan 只允许 `feature` scope");
});

test("Validation Plan 校验 scope、枚举单元格和命令列表格式", () => {
  const cases = [
    ["scope", "other", "agent-config", "root", "`pnpm test:workflow`", "Scope 只接受 `ticket:NN` 或 `feature`"],
    ["change-type", "ticket:01", "code,unknown", "root", "`pnpm test:workflow`", "Change-Types 包含不支持的值"],
    ["change-order", "ticket:01", "code,agent-config", "root", "`pnpm test:workflow`", "Change-Types 必须按字母顺序且不得重复"],
    ["workspace", "ticket:01", "agent-config", "api", "`pnpm test:workflow`", "Affected-Workspaces 格式错误"],
    ["commands", "ticket:01", "agent-config", "root", "pnpm test:workflow<br>`git diff --check`", "Required-Commands 必须是 `<br>` 分隔的反引号命令列表"],
    ["empty-command", "ticket:01", "agent-config", "root", "`pnpm test:workflow`<br>", "Required-Commands 必须是 `<br>` 分隔的反引号命令列表"],
  ] as const;

  for (const [name, scope, types, workspaces, commands, message] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
    const delivery = readFileSync(deliveryPath, "utf8").replace(
      "| ticket:01 | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |",
      `| ${scope} | ${types} | ${workspaces} | ${commands} |`,
    );
    writeFileSync(deliveryPath, delivery, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain(message);
  }
});

test("ledger 记录章节只接受规范空状态或记录形状", () => {
  for (const heading of ["阶段证据", "验证记录", "评审记录", "授权记录", "Waivers", "重开与修复"] as const) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceDeliverySection(repository, heading, "- 待补充。");

    const result = runChecker(repository);

    expect(result.exitCode, heading).toBe(1);
    expect(result.stderr, heading).toContain(`章节 \`## ${heading}\` 的记录格式错误`);
  }
});

test("阶段证据使用 Gate ID，ticket gate 包含编号和必要 SHA", () => {
  const cases = [
    ["gate", "- `X1 Unknown` — 无效 gate。"],
    ["ticket", "- `T1 Ticket Claimed` — 已认领。"],
    ["sha", "- `T2 Candidate Validated` — ticket 01；候选已验证。"],
  ] as const;

  for (const [name, record] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceDeliverySection(repository, "阶段证据", record);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("章节 `## 阶段证据` 的记录格式错误");
  }

  const repository = createRepository();
  writeValidStandardFeature(repository);
  replaceDeliverySection(
    repository,
    "阶段证据",
    "- `T2 Candidate Validated` — ticket 01；Content-Head: `ffffffffffffffffffffffffffffffffffffffff`；验证通过。",
  );

  const result = runChecker(repository);

  expect(existsSync(join(repository, ".git"))).toBe(false);
  expect(result.exitCode).toBe(0);
});

test("验证记录包含命令、结果和完整 Content-Head 字面值", () => {
  const cases = [
    ["command", "- pnpm test — passed；Content-Head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`"],
    ["result", "- `pnpm test` — done；Content-Head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`"],
    ["sha", "- `pnpm test` — passed；Content-Head: `abc`"],
  ] as const;

  for (const [name, record] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceDeliverySection(repository, "验证记录", record);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("章节 `## 验证记录` 的记录格式错误");
  }

  const repository = createRepository();
  writeValidStandardFeature(repository);
  replaceDeliverySection(
    repository,
    "验证记录",
    "- `pnpm test` — passed；Content-Head: `ffffffffffffffffffffffffffffffffffffffff`；12 个测试。",
  );

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("评审记录包含 subject、fixed point、reviewed head 和两轴结果", () => {
  const cases = [
    ["subject", "- Ticket — fixed point: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`；reviewed head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`；Standards: passed；Spec: passed"],
    ["sha", "- Ticket 01 — fixed point: `abc`；reviewed head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`；Standards: passed；Spec: passed"],
    ["result", "- Ticket 01 — fixed point: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`；reviewed head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`；Standards: ok；Spec: passed"],
  ] as const;

  for (const [name, record] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceDeliverySection(repository, "评审记录", record);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("章节 `## 评审记录` 的记录格式错误");
  }

  const repository = createRepository();
  writeValidStandardFeature(repository);
  replaceDeliverySection(
    repository,
    "评审记录",
    "- Ticket 01 — fixed point: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`；reviewed head: `ffffffffffffffffffffffffffffffffffffffff`；Standards: passed；Spec: findings；存在待修复格式问题。",
  );

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("授权与重开修复记录使用有效 ISO 日期和非空说明", () => {
  for (const heading of ["授权记录", "重开与修复"] as const) {
    for (const record of ["- 2026-02-30 — 记录。", "- 2026-07-19 — "]) {
      const repository = createRepository();
      writeValidStandardFeature(repository);
      replaceDeliverySection(repository, heading, record);

      const result = runChecker(repository);

      expect(result.exitCode, `${heading}:${record}`).toBe(1);
      expect(result.stderr, `${heading}:${record}`).toContain(`章节 \`## ${heading}\` 的记录格式错误`);
    }
  }
});

test("Waiver 记录包含日期、命令、原因、范围、风险和批准者", () => {
  const valid = "- 2026-07-19 — Command: `pnpm test:postgres`；Reason: PostgreSQL 不可用；Scope: ticket 05；Risk: 数据库路径未验证；Approved by: maintainer";
  const cases = [
    ["date", valid.replace("2026-07-19", "2026-02-30")],
    ["command", valid.replace("Command: `pnpm test:postgres`；", "")],
    ["reason", valid.replace("Reason: PostgreSQL 不可用", "Reason:")],
    ["scope", valid.replace("Scope: ticket 05", "Scope:")],
    ["risk", valid.replace("Risk: 数据库路径未验证", "Risk:")],
    ["approver", valid.replace("Approved by: maintainer", "Approved by:")],
  ] as const;

  for (const [name, record] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceDeliverySection(repository, "Waivers", record);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("章节 `## Waivers` 的记录格式错误");
  }

  const repository = createRepository();
  writeValidStandardFeature(repository);
  replaceDeliverySection(repository, "Waivers", valid);

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("Merge brief 与 Delivery receipt 只接受统一空状态", () => {
  const cases = [
    ["Merge brief", "- 尚未进入 `G6 Merge Ready`。", "Merge brief 字段 `Feature branch` 必须恰好出现一次"],
    ["Delivery receipt", "- 尚未进入 `G7 Delivered`。", "Delivery receipt 只允许在 `delivered` 状态出现"],
  ] as const;

  for (const [heading, section, message] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceDeliverySection(repository, heading, section);

    const result = runChecker(repository);

    expect(result.exitCode, heading).toBe(1);
    expect(result.stderr, heading).toContain(message);
  }
});

test("merge-ready 状态必须包含完整 Merge brief 字段", () => {
  const fields = [
    "Feature branch",
    "Target branch",
    "Target base",
    "Target tip",
    "Content head",
    "Verified content head",
    "Reviewed content head",
    "Delivery summary",
    "Commit range",
    "Validation",
    "Review",
    "Waivers and risks",
    "Local transaction",
  ] as const;

  for (const field of fields) {
    const repository = createRepository();
    writeMergeReadyFeature(repository);
    const section = validMergeBrief().replace(new RegExp(`^- ${field}:.*\\n`, "m"), "");
    replaceDeliverySection(repository, "Merge brief", section);

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`Merge brief 字段 \`${field}\` 必须恰好出现一次`);
  }

  const repository = createRepository();
  writeMergeReadyFeature(repository);
  replaceDeliverySection(repository, "Merge brief", "- 无。");

  const empty = runChecker(repository);

  expect(empty.exitCode).toBe(1);
  expect(empty.stderr).toContain("`merge-ready` 状态必须包含完整 Merge brief");
});

test("Merge brief 校验 SHA 字面值、明确相等字段和本地事务列表", () => {
  const cases = [
    ["range", validMergeBrief().replace("`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`", "`abc...def`"), "Merge brief 的 `Commit range` 格式错误"],
    ["equality", validMergeBrief().replace("- Content head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`", "- Content head: `ffffffffffffffffffffffffffffffffffffffff`"), "Merge brief 的 `Content head` 必须与顶层字段字面相等"],
    ["validation", validMergeBrief().replace("- Validation: passed", "- Validation: done"), "Merge brief 的 `Validation` 只接受 `passed` 或 `passed-with-waivers`"],
    ["review", validMergeBrief().replace("- Review: passed", "- Review: done"), "Merge brief 的 `Review` 必须是 `passed`"],
    ["parent", validMergeBrief().replace("- Local transaction:", "- Local transaction: planned"), "Merge brief 的 `Local transaction` 父项必须为空值"],
    ["list", validMergeBrief().replace("  3. 创建 focused squash commit。\n", ""), "Merge brief 的 `Local transaction` 必须是从 1 到 5 的连续编号列表"],
  ] as const;

  for (const [name, section, message] of cases) {
    const repository = createRepository();
    writeMergeReadyFeature(repository);
    replaceDeliverySection(repository, "Merge brief", section);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain(message);
  }
});

test("Merge brief 在没有 Git 对象的文档树中按字面格式通过", () => {
  const repository = createRepository();
  writeMergeReadyFeature(repository);

  const result = runChecker(repository);

  expect(existsSync(join(repository, ".git"))).toBe(false);
  expect(result.exitCode).toBe(0);
});

test("delivered 状态必须包含完整 Delivery receipt 字段", () => {
  for (const field of ["Target branch", "Squash commit", "Tracker metadata", "Final checks", "Local feature branch"] as const) {
    const repository = createRepository();
    writeDeliveredFeature(repository);
    const receipt = `${validDeliveryReceipt()}\n`.replace(new RegExp(`^- ${field}:.*\\n`, "m"), "");
    replaceDeliverySection(repository, "Delivery receipt", receipt);

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`Delivery receipt 字段 \`${field}\` 必须恰好出现一次`);
  }

  const repository = createRepository();
  writeDeliveredFeature(repository);
  replaceDeliverySection(repository, "Delivery receipt", "- 无。");

  const empty = runChecker(repository);

  expect(empty.exitCode).toBe(1);
  expect(empty.stderr).toContain("`delivered` 状态必须包含完整 Delivery receipt");
});

test("Delivery receipt 校验 final checks、删除状态和明确相等字段", () => {
  const cases = [
    ["squash", validDeliveryReceipt().replace("- Squash commit: `ffffffffffffffffffffffffffffffffffffffff`", "- Squash commit: `abc`"), "Delivery receipt 的 `Squash commit` 必须与顶层字段字面相等"],
    ["checks", validDeliveryReceipt().replace("  - `pnpm check:workflow` — passed", "  - pnpm check:workflow — passed"), "Delivery receipt 的 `Final checks` 必须包含规范 passed 命令子列表"],
    ["branch", validDeliveryReceipt().replace("- Local feature branch: deleted", "- Local feature branch: retained"), "Delivery receipt 的 `Local feature branch` 必须是 `deleted`"],
  ] as const;

  for (const [name, receipt, message] of cases) {
    const repository = createRepository();
    writeDeliveredFeature(repository);
    replaceDeliverySection(repository, "Delivery receipt", receipt);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain(message);
  }
});

test("delivered 状态的 ledger、receipt 与 ticket final SHA 字面一致且不残留 pending", () => {
  const cases = [
    ["ledger-pending", (repository: string) => replaceLedgerField(repository, "Final-Squash-Commit", "pending")],
    ["ticket-pending", (repository: string) => {
      const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
      writeFileSync(ticketPath, readFileSync(ticketPath, "utf8").replace("`ffffffffffffffffffffffffffffffffffffffff`", "`pending`"), "utf8");
    }],
    ["ticket-mismatch", (repository: string) => {
      const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
      writeFileSync(ticketPath, readFileSync(ticketPath, "utf8").replace("`ffffffffffffffffffffffffffffffffffffffff`", "`eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`"), "utf8");
    }],
  ] as const;

  for (const [name, mutate] of cases) {
    const repository = createRepository();
    writeDeliveredFeature(repository);
    mutate(repository);

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("delivered 状态的 final SHA 必须完整且字面一致");
  }

  const repository = createRepository();
  writeValidStandardFeature(repository);
  replaceLedgerField(repository, "Final-Squash-Commit", "ffffffffffffffffffffffffffffffffffffffff");

  const premature = runChecker(repository);

  expect(premature.exitCode).toBe(1);
  expect(premature.stderr).toContain("非 delivered 状态的 `Final-Squash-Commit` 必须是 `pending`");
});

test("Delivery receipt 在没有 Git 对象和不可解析 SHA 的文档树中通过", () => {
  const repository = createRepository();
  writeDeliveredFeature(repository);

  const result = runChecker(repository);

  expect(existsSync(join(repository, ".git"))).toBe(false);
  expect(result.exitCode).toBe(0);
});

test("standard ticket 文件从 01 连续编号", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const issuesRoot = join(repository, ".scratch", "example-feature", "issues");
  renameSync(join(issuesRoot, "01-example.md"), join(issuesRoot, "02-example.md"));

  const numbering = runChecker(repository);

  expect(numbering.exitCode).toBe(1);
  expect(numbering.stderr).toContain("ticket 编号必须从 `01` 开始连续排列");
});

test("ticket 标题编号与文件一致且标题使用中文", () => {
  const cases = ["# 02 — 示例票据", "# 01 — Example ticket"] as const;

  for (const title of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = readFileSync(ticketPath, "utf8").replace("# 01 — 示例票据", title);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, title).toBe(1);
    expect(result.stderr, title).toContain("ticket 标题必须使用 `# 01 — <中文标题>` 格式");
  }
});

test("ticket 必需字段恰好出现一次", () => {
  const fields = ["What to build", "Blocked by", "Status"] as const;

  for (const field of fields) {
    for (const mode of ["missing", "duplicate"] as const) {
      const repository = createRepository();
      writeValidStandardFeature(repository);
      const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
      const fieldPattern = new RegExp(`^(\\*\\*${field}:\\*\\*.*)$`, "m");
      const ticket = readFileSync(ticketPath, "utf8").replace(fieldPattern, mode === "missing" ? "" : "$1\n$1");
      writeFileSync(ticketPath, ticket, "utf8");

      const result = runChecker(repository);

      expect(result.exitCode, `${field}:${mode}`).toBe(1);
      expect(result.stderr, `${field}:${mode}`).toContain(`ticket 字段 \`${field}\` 必须恰好出现一次`);
    }
  }
});

test("ticket 必需字段只从首个二级章节之前读取", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = `${readFileSync(ticketPath, "utf8").replace("**Status:** ready-for-agent\n", "")}
## Comments

**Status:** ready-for-agent
`;
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("ticket 字段 `Status` 必须恰好出现一次");
});

test("Comments 中类似 ticket 字段的文本不制造重复", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = `${readFileSync(ticketPath, "utf8")}
## Comments

**What to build:** 评论中的历史文本。
**Blocked by:** 99
**Status:** resolved
`;
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("ticket code fence 内的字段章节和 checkbox 示例不参与校验", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = `${readFileSync(ticketPath, "utf8")}
\`\`\`markdown
**What to build:** 围栏内示例。
**Blocked by:** 99
**Status:** resolved
- [x] 围栏内验收项。
## Resolution
- Ticket base: \`not-a-sha\`
\`\`\`
`;
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("ticket 只接受规范二级章节", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = `${readFileSync(ticketPath, "utf8")}\n## Implementation Notes\n\n- hidden state\n`;
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("ticket 二级章节只接受 `Resolution`、`Resolution YYYY-MM-DD`、`Reopen YYYY-MM-DD` 或 `Comments`");
});

test("ticket 同名二级章节不得重复", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = `${readFileSync(ticketPath, "utf8")}
## Comments

- 来源：评审 finding。

## Comments

- 来源：另一条 finding。
`;
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("ticket 二级章节 `## Comments` 不得重复");
});

test("ticket 必需字段按契约排序", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = readFileSync(ticketPath, "utf8").replace(
    "**What to build:** 交付一个可观察示例。\n\n**Blocked by:** None — can start immediately",
    "**Blocked by:** None — can start immediately\n\n**What to build:** 交付一个可观察示例。",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("ticket 字段顺序必须是 `What to build`、`Blocked by`、`Status`");
});

test("ticket 的 What to build 必须非空但不由 checker 判断语言", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const emptyTicket = readFileSync(ticketPath, "utf8").replace("**What to build:** 交付一个可观察示例。", "**What to build:**");
  writeFileSync(ticketPath, emptyTicket, "utf8");

  const empty = runChecker(repository);

  expect(empty.exitCode).toBe(1);
  expect(empty.stderr).toContain("`What to build` 不能为空");

  writeFileSync(ticketPath, emptyTicket.replace("**What to build:**", "**What to build:** Build a checker."), "utf8");

  const english = runChecker(repository);

  expect(english.exitCode).toBe(0);
});

test("ticket Status 只接受生命周期允许值", () => {
  for (const status of ["", "in-progress", "done"]) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = readFileSync(ticketPath, "utf8").replace("**Status:** ready-for-agent", `**Status:** ${status}`);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, status || "empty").toBe(1);
    expect(result.stderr, status || "empty").toContain("ticket `Status` 只接受 `ready-for-agent`、`claimed` 或 `resolved`");
  }
});

test("ticket Blocked by 只接受 None 或逗号分隔编号", () => {
  for (const blockedBy of ["", "01 and 02", "01 — 带说明的依赖", "01,02"]) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = readFileSync(ticketPath, "utf8").replace(
      "**Blocked by:** None — can start immediately",
      `**Blocked by:** ${blockedBy}`,
    );
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, blockedBy || "empty").toBe(1);
    expect(result.stderr, blockedBy || "empty").toContain("`Blocked by` 只接受 `None — can start immediately` 或 `NN, NN`");
  }
});

test("ticket 至少包含一个规范验收 checkbox", () => {
  for (const replacement of ["", "- [] 示例行为可观察。", "- [maybe] 示例行为可观察。", "- [ ] "]) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = readFileSync(ticketPath, "utf8").replace("- [ ] 示例行为可观察。", replacement);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, replacement || "missing").toBe(1);
    expect(result.stderr, replacement || "missing").toContain("ticket 至少包含一个 `- [ ] <验收项>` checkbox");
  }
});

test("ready-for-agent ticket 的验收项保持未勾选", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = readFileSync(ticketPath, "utf8").replace("- [ ] 示例行为可观察。", "- [x] 示例行为可观察。");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`ready-for-agent` ticket 的验收 checkbox 必须全部未勾选");
});

test("resolved ticket 必须包含 Resolution 章节", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = readFileSync(ticketPath, "utf8")
    .replace("**Status:** ready-for-agent", "**Status:** resolved")
    .replace("- [ ] 示例行为可观察。", "- [x] 示例行为可观察。");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`resolved` ticket 必须包含 Resolution 章节");
});

test("ready-for-agent ticket 不得包含 Resolution 或 Reopen", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8"))
    .replace("**Status:** resolved", "**Status:** ready-for-agent")
    .replace(/^- \[x\] /gm, "- [ ] ");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`ready-for-agent` ticket 不得包含 Resolution 或 Reopen");
});

test("resolved ticket 的验收 checkbox 必须全部勾选", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(
    "- [x] 示例行为可观察。",
    "- [ ] 示例行为可观察。",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`resolved` ticket 的验收 checkbox 必须全部勾选");
});

test("Resolution 的每个必需字段恰好出现一次", () => {
  const fields = ["Ticket base", "Reviewed content head", "Candidate commits", "Final squash commit", "Validation", "Review"] as const;

  for (const field of fields) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(new RegExp(`^- ${field}:.*\\n`, "m"), "");
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`Resolution 字段 \`${field}\` 必须恰好出现一次`);
  }
});

test("Resolution 必需字段按契约排序", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(
    "- Ticket base: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`\n- Reviewed content head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`",
    "- Reviewed content head: `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`\n- Ticket base: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Resolution 字段顺序错误");
});

test("Resolution 的 SHA 字段使用完整字面值", () => {
  const fields = ["Ticket base", "Reviewed content head", "Final squash commit"] as const;

  for (const field of fields) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(new RegExp(`^- ${field}:.*$`, "m"), `- ${field}: \`abc\``);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`Resolution 的 \`${field}\` 格式错误`);
  }
});

test("Resolution Candidate commits 使用非空 SHA 列表", () => {
  const values = [
    "",
    "`abc`",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`; `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`",
  ] as const;

  for (const value of values) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(/^- Candidate commits:.*$/m, `- Candidate commits: ${value}`);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, value || "empty").toBe(1);
    expect(result.stderr, value || "empty").toContain("`Candidate commits` 必须是逗号分隔的完整 SHA 列表");
  }
});

test("Resolution Candidate commits 不得重复", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(
    "`cccccccccccccccccccccccccccccccccccccccc`, `dddddddddddddddddddddddddddddddddddddddd`",
    "`cccccccccccccccccccccccccccccccccccccccc`, `cccccccccccccccccccccccccccccccccccccccc`",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("`Candidate commits` 不得包含重复 SHA");
});

test("Resolution Validation 包含规范 passed 命令子列表", () => {
  const cases = [
    ["missing", "- Validation:\n- Review:"],
    ["failed", "- Validation:\n  - `pnpm test:workflow` — failed\n- Review:"],
    ["unquoted", "- Validation:\n  - pnpm test:workflow — passed\n- Review:"],
    ["empty", "- Validation:\n  - `` — passed\n- Review:"],
  ] as const;

  for (const [name, replacement] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(
      /- Validation:\n(?: {2}- .*\n)+- Review:/,
      replacement,
    );
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain("Resolution 的 `Validation` 必须包含至少一条规范 passed 命令子项");
  }
});

test("Resolution Validation 父项不得携带行内值", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace("- Validation:", "- Validation: passed");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Resolution 的 `Validation` 父项必须为空值");
});

test("Resolution Validation 可在 passed 后记录验证说明", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(
    "  - `pnpm test:workflow` — passed",
    "  - `pnpm test:workflow` — passed，共 73 个测试",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("Resolution 使用固定 Review 结果行", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace(
    "- Review: Standards and Spec review passed with no unresolved findings.",
    "- Review: passed",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Resolution 的 `Review` 必须使用固定通过文本");
});

test("Reopen 标题使用有效 ISO 日期", () => {
  for (const heading of ["## Reopen 2026-7-19", "## Reopen 2026-02-30", "## Reopen tomorrow"]) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace("## Reopen 2026-07-19", heading);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, heading).toBe(1);
    expect(result.stderr, heading).toContain("Reopen 标题必须使用有效的 `## Reopen YYYY-MM-DD`");
  }
});

test("dated Resolution 标题使用有效 ISO 日期", () => {
  for (const heading of ["## Resolution 2026-7-19", "## Resolution 2026-02-30", "## Resolution tomorrow"]) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = `${toResolvedTicket(readFileSync(ticketPath, "utf8"))}\n${heading}\n`;
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, heading).toBe(1);
    expect(result.stderr, heading).toContain("dated Resolution 标题必须使用有效的 `## Resolution YYYY-MM-DD`");
  }
});

test("初次解决必须使用普通 Resolution 而非 dated Resolution", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace("## Resolution\n", "## Resolution 2026-07-19\n");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("ticket 生命周期必须从普通 `## Resolution` 开始");
});

test("Reopen 的每个必需字段恰好出现一次", () => {
  const fields = ["Reason", "Previous reviewed content head", "Remediation base", "Status transition"] as const;

  for (const field of fields) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace(new RegExp(`^- ${field}:.*\\n`, "m"), "");
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`Reopen 字段 \`${field}\` 必须恰好出现一次`);
  }
});

test("Reopen 必需字段按契约排序", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace(
    "- Reason: 发现记录格式问题。\n- Previous reviewed content head: `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`",
    "- Previous reviewed content head: `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`\n- Reason: 发现记录格式问题。",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Reopen 字段顺序错误");
});

test("Reopen 字段使用规范值", () => {
  const cases = [
    ["Reason", "", "`Reason` 不能为空"],
    ["Previous reviewed content head", "`abc`", "`Previous reviewed content head` 必须是完整 SHA"],
    ["Remediation base", "`pending`", "`Remediation base` 必须是 `claim-checkpoint` 或完整 SHA"],
    ["Status transition", "claimed -> resolved", "`Status transition` 必须是 `resolved -> claimed`"],
  ] as const;

  for (const [field, value, message] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
    const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace(new RegExp(`^- ${field}:.*$`, "m"), `- ${field}: ${value}`);
    writeFileSync(ticketPath, ticket, "utf8");

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(message);
  }
});

test("claimed ticket 保留旧 Resolution 时必须包含 Reopen", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toResolvedTicket(readFileSync(ticketPath, "utf8")).replace("**Status:** resolved", "**Status:** claimed");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("保留 Resolution 的 `claimed` ticket 必须包含 Reopen");
});

test("Reopen 必须位于既有 Resolution 之后", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace(/## Resolution\n[\s\S]*?(?=## Reopen)/, "");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Reopen 必须位于一个既有 Resolution 之后");
});

test("每轮 Reopen 之间必须有对应的 dated Resolution", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = `${toReopenedTicket(readFileSync(ticketPath, "utf8"))}
## Reopen 2026-07-20

- Reason: 又发现一条记录格式问题。
- Previous reviewed content head: \`ffffffffffffffffffffffffffffffffffffffff\`
- Remediation base: \`claim-checkpoint\`
- Status transition: resolved -> claimed
`;
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("每个 Reopen 后必须先追加 dated Resolution，才能再次 Reopen");
});

test("Reopen 与 dated Resolution 交替记录时生命周期格式通过", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const claimedTicket = toReopenedTicket(readFileSync(ticketPath, "utf8"));
  writeFileSync(ticketPath, claimedTicket, "utf8");

  const claimed = runChecker(repository);

  expect(claimed.exitCode).toBe(0);

  const datedResolution = toResolvedTicket("").replace("## Resolution", "## Resolution 2026-07-20");
  writeFileSync(ticketPath, `${claimedTicket.replace("**Status:** claimed", "**Status:** resolved")}\n${datedResolution}`, "utf8");

  const resolved = runChecker(repository);

  expect(resolved.exitCode).toBe(0);
});

test("Reopen 只允许出现在 claimed 或 resolved ticket", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace("**Status:** claimed", "**Status:** ready-for-agent");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("Reopen 只允许出现在 `claimed` 或 `resolved` ticket");
});

test("reopened ticket 再次 resolved 时追加 dated Resolution", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = toReopenedTicket(readFileSync(ticketPath, "utf8")).replace("**Status:** claimed", "**Status:** resolved");
  writeFileSync(ticketPath, ticket, "utf8");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("再次 `resolved` 时必须在最新 Reopen 后追加 dated Resolution");
});

test("standard ticket blocker 只引用更早票据", () => {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = readFileSync(ticketPath, "utf8").replace(
    "**Blocked by:** None — can start immediately",
    "**Blocked by:** 02 — 不存在的后续票据",
  );
  writeFileSync(ticketPath, ticket, "utf8");

  const blocker = runChecker(repository);

  expect(blocker.exitCode).toBe(1);
  expect(blocker.stderr).toContain("blocker `02` 必须引用同 feature 中已存在且编号更小的 ticket");
});

test("review-remediation ticket 使用显式类型和 finding source 记录", () => {
  const cases = [
    ["missing-source", "**Ticket kind:** review-remediation", "review-remediation ticket 必须在 `## Comments` 记录唯一非空 `Finding source`"],
    ["empty-source", "**Ticket kind:** review-remediation\n\n## Comments\n\n- Finding source:", "review-remediation ticket 必须在 `## Comments` 记录唯一非空 `Finding source`"],
    ["invalid-kind", "**Ticket kind:** remediation", "`Ticket kind` 只接受 `review-remediation`"],
  ] as const;

  for (const [name, remediationRecord, message] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    const issuesRoot = join(repository, ".scratch", "example-feature", "issues");
    writeFileSync(join(issuesRoot, "02-review-remediation-example.md"), `# 02 — 修复评审发现

**What to build:** 修复评审中发现的记录格式问题。

**Blocked by:** 01

**Status:** ready-for-agent

${remediationRecord}

- [ ] finding 对应的格式问题已修复。
`, "utf8");
    addValidationPlanTicketRow(repository, "02");

    const result = runChecker(repository);

    expect(result.exitCode, name).toBe(1);
    expect(result.stderr, name).toContain(message);
  }

  const repository = createRepository();
  writeValidStandardFeature(repository);
  const issuesRoot = join(repository, ".scratch", "example-feature", "issues");
  writeFileSync(join(issuesRoot, "02-review-remediation-example.md"), `# 02 — 修复评审发现

**What to build:** 修复评审中发现的记录格式问题。

**Blocked by:** 01

**Status:** ready-for-agent

**Ticket kind:** review-remediation

- [ ] finding 对应的格式问题已修复。

## Comments

- Finding source: Ticket 04 Spec review 的 Validation 格式 finding。
`, "utf8");
  addValidationPlanTicketRow(repository, "02");

  const result = runChecker(repository);

  expect(result.exitCode).toBe(0);
});

test("ledger 其余机器字段使用非空和规范列表格式", () => {
  const cases = [
    ["Target-Branch", "", "不能为空"],
    ["Authorized-Implementation-Scope", "", "不能为空"],
    ["Current-Ticket", "ticket 01", "必须是 `none` 或 `NN-kebab-case`"],
    ["Change-Types", "code,unknown", "包含不支持的 change type"],
    ["Affected-Workspaces", "api", "必须是 `none`、`root` 或 pnpm package name"],
  ] as const;

  for (const [field, value, message] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceLedgerField(repository, field, value);

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`字段 \`${field}\``);
    expect(result.stderr, field).toContain(message);
  }
});

test("ledger 必需机器字段的值不得省略", () => {
  const fields = ["Feature-Slug", "Current-Ticket", "Change-Types", "Affected-Workspaces"] as const;

  for (const field of fields) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceLedgerField(repository, field, "");

    const result = runChecker(repository);

    expect(result.exitCode, field).toBe(1);
    expect(result.stderr, field).toContain(`字段 \`${field}\` 不能为空`);
  }
});

test("ledger 逗号列表按字母顺序且不得重复", () => {
  const cases = [
    ["Change-Types", "code,agent-config"],
    ["Change-Types", "code,code"],
    ["Affected-Workspaces", "@iam/z,@iam/a"],
    ["Affected-Workspaces", "@iam/api,@iam/api"],
  ] as const;

  for (const [field, value] of cases) {
    const repository = createRepository();
    writeValidStandardFeature(repository);
    replaceLedgerField(repository, field, value);

    const result = runChecker(repository);

    expect(result.exitCode, `${field}: ${value}`).toBe(1);
    expect(result.stderr, `${field}: ${value}`).toContain(`字段 \`${field}\` 的逗号列表必须按字母顺序且不得重复`);
  }
});

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), "iam-workflow-check-"));
  temporaryRoots.push(repository);
  return repository;
}

function createHookRepository(): string {
  const repository = createRepository();
  writeValidStandardFeature(repository);
  mkdirSync(join(repository, "scripts"), { recursive: true });
  writeFileSync(join(repository, "scripts", "check-workflow.ts"), readFileSync(checkerPath, "utf8"), "utf8");
  runGit(repository, "init", "--quiet");
  runGit(repository, "add", ".");
  return repository;
}

function writeValidStandardFeature(repository: string): void {
  const featureRoot = join(repository, ".scratch", "example-feature");
  mkdirSync(join(featureRoot, "issues"), { recursive: true });

  writeFileSync(join(featureRoot, "delivery.md"), `# 示例功能交付记录

Workflow-Version: 2
Feature-Slug: example-feature
Workflow-Kind: standard
Stage: tickets-ready
Feature-Branch: codex/example-feature
Target-Branch: main
Target-Base: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Ticketing-Authorization: granted
Implementation-Authorization: pending
Authorized-Implementation-Scope: ticket 01
Current-Ticket: none
Current-Ticket-Base: none
Change-Types: agent-config
Affected-Workspaces: root
Validation-Plan: declared
Content-Head: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
Verified-Content-Head: pending
Reviewed-Content-Head: pending
Merge-Target-Tip: pending
Final-Squash-Commit: pending

## 范围与验收

- Approved spec：\`.scratch/example-feature/spec.md\`

## Validation Plan

| Scope | Change-Types | Affected-Workspaces | Required-Commands |
|---|---|---|---|
| ticket:01 | agent-config | root | \`pnpm test:workflow\`<br>\`git diff --check\` |
| feature | agent-config | root | \`pnpm test:workflow\`<br>\`git diff --check\` |

## 阶段证据

- \`G3 Tickets Ready\` — passed。

## 验证记录

- 无。

## 评审记录

- 无。

## 授权记录

- 无。

## Waivers

- 无。

## 重开与修复

- 无。

## Merge brief

- 无。

## Delivery receipt

- 无。
`, "utf8");

  writeFileSync(join(featureRoot, "spec.md"), `# 示例功能

**Status:** approved
`, "utf8");

  writeFileSync(join(featureRoot, "issues", "01-example.md"), `# 01 — 示例票据

**What to build:** 交付一个可观察示例。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 示例行为可观察。
`, "utf8");
}

function writeValidQuickFeature(repository: string): void {
  writeValidStandardFeature(repository);
  const standardRoot = join(repository, ".scratch", "example-feature");
  const quickRoot = join(repository, ".scratch", "small-change");
  mkdirSync(quickRoot, { recursive: true });
  const delivery = readFileSync(join(standardRoot, "delivery.md"), "utf8")
    .replace("Feature-Slug: example-feature", "Feature-Slug: small-change")
    .replace("Workflow-Kind: standard", "Workflow-Kind: quick")
    .replace("Feature-Branch: codex/example-feature", "Feature-Branch: codex/quick-small-change")
    .replace("Ticketing-Authorization: granted", "Ticketing-Authorization: not-applicable")
    .replace("Authorized-Implementation-Scope: ticket 01", "Authorized-Implementation-Scope: 校验一个快速改动")
    .replace("- Approved spec：`.scratch/example-feature/spec.md`", "- [ ] 快速改动记录格式完整。")
    .replace("| ticket:01 | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |\n", "");
  writeFileSync(join(quickRoot, "delivery.md"), delivery, "utf8");
  rmSync(standardRoot, { recursive: true });
}

function writeMergeReadyFeature(repository: string): void {
  writeValidStandardFeature(repository);
  replaceLedgerField(repository, "Stage", "merge-ready");
  replaceLedgerField(repository, "Implementation-Authorization", "granted");
  replaceLedgerField(repository, "Verified-Content-Head", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  replaceLedgerField(repository, "Reviewed-Content-Head", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  replaceLedgerField(repository, "Merge-Target-Tip", "cccccccccccccccccccccccccccccccccccccccc");
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  writeFileSync(ticketPath, toResolvedTicket(readFileSync(ticketPath, "utf8")), "utf8");
  replaceDeliverySection(repository, "Merge brief", validMergeBrief());
}

function validMergeBrief(): string {
  return `- Feature branch: \`codex/example-feature\`
- Target branch: \`main\`
- Target base: \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\`
- Target tip: \`cccccccccccccccccccccccccccccccccccccccc\`
- Content head: \`bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\`
- Verified content head: \`bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\`
- Reviewed content head: \`bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\`
- Delivery summary: 交付示例功能。
- Commit range: \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\`
- Validation: passed
- Review: passed
- Waivers and risks: none
- Local transaction:
  1. 再次检查 target tip。
  2. 切换目标分支并执行 squash merge。
  3. 创建 focused squash commit。
  4. 回填最终 SHA 并运行最终检查。
  5. 删除本地功能分支。`;
}

function writeDeliveredFeature(repository: string): void {
  writeMergeReadyFeature(repository);
  replaceLedgerField(repository, "Stage", "delivered");
  replaceLedgerField(repository, "Final-Squash-Commit", "ffffffffffffffffffffffffffffffffffffffff");
  const ticketPath = join(repository, ".scratch", "example-feature", "issues", "01-example.md");
  const ticket = readFileSync(ticketPath, "utf8").replace(
    "- Final squash commit: `pending`",
    "- Final squash commit: `ffffffffffffffffffffffffffffffffffffffff`",
  );
  writeFileSync(ticketPath, ticket, "utf8");
  replaceDeliverySection(repository, "Delivery receipt", validDeliveryReceipt());
}

function validDeliveryReceipt(): string {
  return `- Target branch: \`main\`
- Squash commit: \`ffffffffffffffffffffffffffffffffffffffff\`
- Tracker metadata: planned
- Final checks:
  - \`pnpm check:workflow\` — passed
  - \`pnpm check:docs\` — passed
- Local feature branch: deleted`;
}

function replaceDeliverySection(repository: string, heading: string, body: string, feature = "example-feature"): void {
  const deliveryPath = join(repository, ".scratch", feature, "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8");
  const headingMarker = `## ${heading}`;
  const headingStart = delivery.indexOf(headingMarker);
  if (headingStart < 0)
    throw new Error(`Missing delivery section: ${heading}`);
  const contentStart = headingStart + headingMarker.length;
  const nextHeading = delivery.indexOf("\n## ", contentStart);
  const contentEnd = nextHeading < 0 ? delivery.length : nextHeading;
  const updated = `${delivery.slice(0, contentStart)}\n\n${body}\n${delivery.slice(contentEnd).replace(/^\n+/, "\n")}`;
  writeFileSync(deliveryPath, updated, "utf8");
}

function addValidationPlanTicketRow(repository: string, ticketId: string): void {
  const deliveryPath = join(repository, ".scratch", "example-feature", "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace(
    "| feature | agent-config | root | `pnpm test:workflow`<br>`git diff --check` |",
    `| ticket:${ticketId} | agent-config | root | \`pnpm test:workflow\`<br>\`git diff --check\` |\n| feature | agent-config | root | \`pnpm test:workflow\`<br>\`git diff --check\` |`,
  );
  writeFileSync(deliveryPath, delivery, "utf8");
}

function replaceLedgerField(repository: string, field: string, value: string, feature = "example-feature"): void {
  const deliveryPath = join(repository, ".scratch", feature, "delivery.md");
  const delivery = readFileSync(deliveryPath, "utf8").replace(new RegExp(`^${field}:.*$`, "m"), `${field}: ${value}`);
  writeFileSync(deliveryPath, delivery, "utf8");
}

function toResolvedTicket(ticket: string): string {
  return `${ticket
    .replace("**Status:** ready-for-agent", "**Status:** resolved")
    .replace(/^- \[ \] /gm, "- [x] ")}
## Resolution

- Ticket base: \`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\`
- Reviewed content head: \`bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\`
- Candidate commits: \`cccccccccccccccccccccccccccccccccccccccc\`, \`dddddddddddddddddddddddddddddddddddddddd\`
- Final squash commit: \`pending\`
- Validation:
  - \`pnpm test:workflow\` — passed
  - \`git diff --check\` — passed
- Review: Standards and Spec review passed with no unresolved findings.
`;
}

function toReopenedTicket(ticket: string): string {
  return `${toResolvedTicket(ticket).replace("**Status:** resolved", "**Status:** claimed")}
## Reopen 2026-07-19

- Reason: 发现记录格式问题。
- Previous reviewed content head: \`eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\`
- Remediation base: \`claim-checkpoint\`
- Status transition: resolved -> claimed
`;
}

function snapshotTree(root: string): Array<{ content?: string; modifiedAt: number; path: string; type: "directory" | "file" }> {
  const snapshot: Array<{ content?: string; modifiedAt: number; path: string; type: "directory" | "file" }> = [];

  function visit(path: string): void {
    for (const entry of readdirSync(path).sort()) {
      const absolutePath = join(path, entry);
      const stats = statSync(absolutePath);
      const relativePath = relative(root, absolutePath);
      if (stats.isDirectory()) {
        snapshot.push({ modifiedAt: stats.mtimeMs, path: relativePath, type: "directory" });
        visit(absolutePath);
      }
      else {
        snapshot.push({ content: readFileSync(absolutePath, "utf8"), modifiedAt: stats.mtimeMs, path: relativePath, type: "file" });
      }
    }
  }

  visit(root);
  return snapshot;
}

function runChecker(repository: string, args: string[] = []): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([process.execPath, checkerPath, ...args], {
    cwd: repository,
    stderr: "pipe",
    stdout: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

function runGit(repository: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: repository,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
}

function runPreCommitHook(repository: string): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["sh", preCommitHookPath], {
    cwd: repository,
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}
