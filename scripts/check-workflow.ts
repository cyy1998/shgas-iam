import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const scratchRoot = join(repositoryRoot, ".scratch");
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
const ledgerEnumValues: Record<string, readonly string[]> = {
  "Workflow-Version": ["2"],
  "Workflow-Kind": ["standard", "quick"],
  "Stage": ["intake", "branch-ready", "spec-ready", "tickets-ready", "implementing", "feature-verified", "merge-ready", "delivered"],
  "Ticketing-Authorization": ["pending", "granted", "not-applicable"],
  "Implementation-Authorization": ["pending", "granted"],
  "Validation-Plan": ["pending", "declared"],
};
const shaPattern = /^[0-9a-f]{40}$/;
const shaFieldPlaceholders: Record<string, readonly string[]> = {
  "Target-Base": [],
  "Current-Ticket-Base": ["none", "claim-checkpoint"],
  "Content-Head": ["pending"],
  "Verified-Content-Head": ["pending"],
  "Reviewed-Content-Head": ["pending"],
  "Merge-Target-Tip": ["pending"],
  "Final-Squash-Commit": ["pending"],
};
const changeTypes = new Set(["code", "docs", "agent-config", "dependencies", "database", "frontend", "gateway"]);

let v2FeatureCount = 0;
let legacyFeatureCount = 0;
const findings: string[] = [];
const args = process.argv.slice(2);
let selectedFeature: string | undefined;

function readMarkdown(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}

if (args.length > 0) {
  if (args.length === 2 && args[0] === "--feature" && args[1]) {
    selectedFeature = args[1];
  }
  else {
    addFinding(
      "<命令行>",
      `命令参数格式错误，收到参数：${args.map(argument => `\`${argument}\``).join("、")}`,
      "无参数，或 `--feature <slug>`",
      "使用 `pnpm check:workflow` 或 `pnpm check:workflow -- --feature <slug>`",
    );
  }
}

if (existsSync(scratchRoot)) {
  const entries = readdirSync(scratchRoot);
  checkDuplicateV2Slugs(entries, selectedFeature);
  if (selectedFeature && !entries.includes(selectedFeature)) {
    addFinding(
      `.scratch/${selectedFeature}`,
      `未找到 feature \`${selectedFeature}\``,
      "存在同名 feature 目录",
      "检查 slug，或先创建/adopt 对应记录",
    );
  }

  for (const entry of entries) {
    if (selectedFeature && entry !== selectedFeature)
      continue;
    const featureRoot = join(scratchRoot, entry);
    if (!statSync(featureRoot).isDirectory()) {
      if (selectedFeature) {
        addFinding(
          `.scratch/${selectedFeature}`,
          `feature \`${selectedFeature}\` 无法解析：对应路径不是目录`,
          "同名路径是 feature 目录",
          "移走同名普通文件或改用正确 slug",
        );
      }
      continue;
    }

    const deliveryPath = join(featureRoot, "delivery.md");
    if (!existsSync(deliveryPath)) {
      legacyFeatureCount += 1;
      continue;
    }
    if (!statSync(deliveryPath).isFile()) {
      if (selectedFeature) {
        addFinding(
          `.scratch/${selectedFeature}/delivery.md`,
          `feature \`${selectedFeature}\` 无法解析：\`delivery.md\` 不是普通文件`,
          "`delivery.md` 是可读取的 Markdown 文件",
          "把该路径修复为文件后重试",
        );
      }
      else {
        legacyFeatureCount += 1;
      }
      continue;
    }

    const delivery = readMarkdown(deliveryPath);
    const structuralDelivery = stripCodeFences(delivery);
    const isV2Record = /^Workflow-Version: 2$/m.test(extractLedgerHeader(structuralDelivery));
    if (isV2Record) {
      v2FeatureCount += 1;
      checkLedgerFields(entry, structuralDelivery);
      checkWorkflowFiles(entry, featureRoot, structuralDelivery);
    }
    else {
      legacyFeatureCount += 1;
    }
  }
}
else if (selectedFeature) {
  addFinding(
    ".scratch",
    `未找到 feature \`${selectedFeature}\``,
    "仓库包含 `.scratch/<feature-slug>/`",
    "检查仓库根目录与 slug，或先创建/adopt 对应记录",
  );
}

if (selectedFeature && v2FeatureCount === 0 && legacyFeatureCount === 1) {
  addFinding(
    `.scratch/${selectedFeature}/delivery.md`,
    `feature \`${selectedFeature}\` 尚未 adoption 为 v2`,
    "显式 v2 adoption ledger 包含 `Workflow-Version: 2`",
    "继续按 legacy 处理，或先完成 adoption",
  );
}

if (findings.length > 0) {
  console.error("Workflow 记录格式检查失败：");
  for (const finding of findings)
    console.error(`- ${finding}`);
  process.exit(1);
}

if (selectedFeature)
  console.log(`Workflow 记录格式检查通过：feature \`${selectedFeature}\`。`);
else
  console.log(`Workflow 记录格式检查通过：${v2FeatureCount} 个 v2 feature，${legacyFeatureCount} 个 legacy feature。`);

function checkDuplicateV2Slugs(entries: string[], selectedFeature: string | undefined): void {
  const directoriesBySlug = new Map<string, string[]>();

  for (const entry of entries) {
    const featureRoot = join(scratchRoot, entry);
    if (!statSync(featureRoot).isDirectory())
      continue;
    const deliveryPath = join(featureRoot, "delivery.md");
    if (!existsSync(deliveryPath) || !statSync(deliveryPath).isFile())
      continue;
    const delivery = stripCodeFences(readMarkdown(deliveryPath));
    const header = extractLedgerHeader(delivery);
    if (!/^Workflow-Version: 2$/m.test(header))
      continue;
    const slug = readUniqueField(header, "Feature-Slug");
    if (!slug)
      continue;
    const directories = directoriesBySlug.get(slug) ?? [];
    directories.push(entry);
    directoriesBySlug.set(slug, directories);
  }

  for (const [slug, directories] of directoriesBySlug) {
    if (directories.length > 1 && (!selectedFeature || selectedFeature === slug)) {
      addFinding(
        ".scratch",
        `Feature-Slug \`${slug}\` 被 ${directories.length} 个 v2 feature 声明：${directories.join("、")}`,
        "每个 v2 Feature-Slug 只对应一个同名目录",
        "修正重复 ledger 的 Feature-Slug 或目录名",
      );
    }
  }
}

function checkWorkflowFiles(featureDirectory: string, featureRoot: string, delivery: string): void {
  const header = extractLedgerHeader(delivery);
  const workflowKind = readUniqueField(header, "Workflow-Kind");
  const featureSlug = readUniqueField(header, "Feature-Slug");
  const featureBranch = readUniqueField(header, "Feature-Branch");
  const ticketingAuthorization = readUniqueField(header, "Ticketing-Authorization");
  if (workflowKind && featureSlug && featureBranch) {
    const expectedBranch = workflowKind === "quick" ? `codex/quick-${featureSlug}` : `codex/${featureSlug}`;
    if (featureBranch !== expectedBranch) {
      addFinding(
        `.scratch/${featureDirectory}/delivery.md`,
        `${workflowKind} feature 的 \`Feature-Branch\` 为 \`${featureBranch}\``,
        `${workflowKind} feature 的 \`Feature-Branch\` 必须是 \`${expectedBranch}\``,
        "修正该字段后重试",
      );
    }
  }

  if (workflowKind === "quick" && ticketingAuthorization !== "not-applicable") {
    addFinding(
      `.scratch/${featureDirectory}/delivery.md`,
      `quick feature 的 \`Ticketing-Authorization\` 为 \`${ticketingAuthorization}\``,
      "quick feature 的 `Ticketing-Authorization` 必须是 `not-applicable`",
      "修正该字段后重试",
    );
  }
  if (workflowKind === "quick") {
    const scopeAndAcceptance = extractSection(delivery, "范围与验收");
    if (!scopeAndAcceptance || !/^- \[[ x]\] .+$/im.test(scopeAndAcceptance)) {
      addFinding(
        `.scratch/${featureDirectory}/delivery.md`,
        "quick feature 的 `范围与验收` 未包含 checkbox",
        "quick feature 的 `范围与验收` 必须包含至少一个 checkbox",
        "添加 `- [ ] <验收项>` 后重试",
      );
    }
    checkValidationPlanScopes(`.scratch/${featureDirectory}/delivery.md`, delivery, "quick", []);
  }

  if (workflowKind !== "standard")
    return;

  const path = `.scratch/${featureDirectory}`;
  const specPath = join(featureRoot, "spec.md");
  if (!existsSync(specPath)) {
    addFinding(
      path,
      "standard feature 缺少 `spec.md`",
      "standard feature 包含唯一 `spec.md`",
      "补充 spec 文件后重试",
    );
  }
  else if (!statSync(specPath).isFile()) {
    addFinding(
      `${path}/spec.md`,
      "standard feature 的 `spec.md` 不是普通文件",
      "`spec.md` 是可读取的 Markdown 文件",
      "把该路径修复为文件后重试",
    );
  }
  else {
    checkSpec(`${path}/spec.md`, readMarkdown(specPath));
  }

  const issuesRoot = join(featureRoot, "issues");
  const ticketEntries = existsSync(issuesRoot) && statSync(issuesRoot).isDirectory()
    ? readdirSync(issuesRoot).filter(file => file.endsWith(".md")).sort()
    : [];
  const ticketFiles = ticketEntries.filter(file => statSync(join(issuesRoot, file)).isFile());
  for (const entry of ticketEntries) {
    if (!ticketFiles.includes(entry)) {
      addFinding(
        `${path}/issues/${entry}`,
        `ticket 路径 \`${entry}\` 不是普通文件`,
        "每个 `*.md` ticket 路径都是可读取的 Markdown 文件",
        "把该路径修复为文件后重试",
      );
    }
  }
  const tickets = ticketFiles.filter(file => /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file));
  if (ticketFiles.length === 0) {
    addFinding(
      path,
      "standard feature 的 `issues/` 没有 Markdown ticket",
      "standard feature 必须在 `issues/` 中包含至少一张 ticket",
      "补充首张规范 ticket 后重试",
    );
    return;
  }
  for (const file of ticketFiles) {
    if (!tickets.includes(file)) {
      addFinding(
        `${path}/issues/${file}`,
        `ticket 文件名为 \`${file}\``,
        "ticket 文件名必须使用 `NN-kebab-case.md` 格式",
        "重命名该文件后重试",
      );
    }
  }

  const ticketIds = tickets.map(file => file.slice(0, 2));
  checkValidationPlanScopes(`${path}/delivery.md`, delivery, "standard", ticketIds);
  const expectedIds = tickets.map((_, index) => String(index + 1).padStart(2, "0"));
  if (ticketIds.some((id, index) => id !== expectedIds[index])) {
    addFinding(
      `${path}/issues`,
      `ticket 编号为 \`${ticketIds.join(",")}\``,
      "ticket 编号必须从 `01` 开始连续排列",
      "按连续编号重命名 ticket 后重试",
    );
  }

  for (const file of tickets) {
    const ticketId = file.slice(0, 2);
    const ticketPath = join(issuesRoot, file);
    const ticket = readMarkdown(ticketPath);
    const structuralTicket = stripCodeFences(ticket);
    checkTicket(`${path}/issues/${file}`, structuralTicket, ticketId);
    checkTicketFinalSquash(`${path}/issues/${file}`, structuralTicket, header);
    const blockedBy = /^\*\*Blocked by:\*\*(.*)$/m.exec(extractTicketHeader(structuralTicket))?.[1].trim();
    if (!blockedBy || blockedBy === "None — can start immediately")
      continue;
    const blockerIds = blockedBy.match(/\b\d{2}\b/g) ?? [];
    for (const blockerId of blockerIds) {
      if (!ticketIds.includes(blockerId) || blockerId >= ticketId) {
        addFinding(
          `${path}/issues/${file}`,
          `blocker \`${blockerId}\` 不指向更早的现有 ticket`,
          `blocker \`${blockerId}\` 必须引用同 feature 中已存在且编号更小的 ticket`,
          "修正 `Blocked by` 引用后重试",
        );
      }
    }
  }
}

function extractTicketHeader(ticket: string): string {
  const firstSection = /^## /m.exec(ticket);
  return firstSection ? ticket.slice(0, firstSection.index) : ticket;
}

function checkTicket(path: string, ticket: string, ticketId: string): void {
  const ticketHeader = extractTicketHeader(ticket);
  const ticketSections = extractLevelTwoSections(ticket);
  const firstLine = ticketHeader.split("\n", 1)[0].trimEnd();
  const titleMatch = new RegExp(`^# ${ticketId} — (.+)$`).exec(firstLine);
  if (!titleMatch || !/\p{Script=Han}/u.test(titleMatch[1])) {
    addFinding(
      path,
      `ticket 标题为 \`${firstLine}\``,
      `ticket 标题必须使用 \`# ${ticketId} — <中文标题>\` 格式`,
      "修正标题编号或中文标题后重试",
    );
  }

  let previousFieldIndex = -1;
  for (const field of ["What to build", "Blocked by", "Status"]) {
    const matches = [...ticketHeader.matchAll(new RegExp(`^\\*\\*${escapeRegExp(field)}:\\*\\*(.*)$`, "gm"))];
    if (matches.length !== 1) {
      addFinding(
        path,
        `ticket 字段 \`${field}\` 实际出现 ${matches.length} 次`,
        `ticket 字段 \`${field}\` 必须恰好出现一次`,
        "补充或去重该字段后重试",
      );
    }
    else {
      const fieldIndex = matches[0].index;
      if (fieldIndex < previousFieldIndex) {
        addFinding(
          path,
          `ticket 字段 \`${field}\` 位于错误位置`,
          "ticket 字段顺序必须是 `What to build`、`Blocked by`、`Status`",
          "移动字段到固定顺序后重试",
        );
      }
      previousFieldIndex = fieldIndex;
    }
  }

  const whatToBuild = readUniqueTicketField(ticketHeader, "What to build");
  if (whatToBuild === "") {
    addFinding(
      path,
      "ticket 的 `What to build` 为空",
      "`What to build` 不能为空",
      "补充交付行为后重试",
    );
  }

  const status = readUniqueTicketField(ticketHeader, "Status");
  if (status !== undefined && !["ready-for-agent", "claimed", "resolved"].includes(status)) {
    addFinding(
      path,
      `ticket \`Status\` 为 \`${status}\``,
      "ticket `Status` 只接受 `ready-for-agent`、`claimed` 或 `resolved`",
      "修正状态值后重试",
    );
  }

  const blockedBy = readUniqueTicketField(ticketHeader, "Blocked by");
  if (blockedBy !== undefined && blockedBy !== "None — can start immediately" && !/^\d{2}(?:, \d{2})*$/.test(blockedBy)) {
    addFinding(
      path,
      `ticket 的 \`Blocked by\` 为 \`${blockedBy}\``,
      "`Blocked by` 只接受 `None — can start immediately` 或 `NN, NN`",
      "改用固定依赖语法后重试",
    );
  }
  const ticketKindMatches = [...ticketHeader.matchAll(/^\*\*Ticket kind:\*\*(.*)$/gm)];
  if (ticketKindMatches.length > 1) {
    addFinding(
      path,
      `ticket 字段 \`Ticket kind\` 实际出现 ${ticketKindMatches.length} 次`,
      "可选的 `Ticket kind` 字段最多出现一次",
      "删除重复 `Ticket kind` 后重试",
    );
  }
  const ticketKind = ticketKindMatches.length === 1 ? ticketKindMatches[0][1].trim() : undefined;
  if (ticketKind !== undefined && ticketKind !== "review-remediation") {
    addFinding(
      path,
      `ticket 的 \`Ticket kind\` 为 \`${ticketKind}\``,
      "`Ticket kind` 只接受 `review-remediation`",
      "修正类型标记，或对普通 ticket 移除该字段后重试",
    );
  }

  const acceptanceLines = ticketHeader.split("\n").filter(line => line.startsWith("- ["));
  const canonicalCheckbox = /^- \[[ x]\] \S.*$/i;
  if (!acceptanceLines.some(line => canonicalCheckbox.test(line))) {
    addFinding(
      path,
      "ticket 未包含规范验收 checkbox",
      "ticket 至少包含一个 `- [ ] <验收项>` checkbox",
      "补充规范验收项后重试",
    );
  }
  for (const line of acceptanceLines) {
    if (!canonicalCheckbox.test(line)) {
      addFinding(
        path,
        `验收 checkbox 为 \`${line}\``,
        "checkbox 使用 `- [ ] <验收项>` 或 `- [x] <验收项>`",
        "修正该 checkbox 后重试",
      );
    }
  }
  if (status === "ready-for-agent" && acceptanceLines.some(line => /^- \[x\]/i.test(line))) {
    addFinding(
      path,
      "`ready-for-agent` ticket 存在已勾选验收项",
      "`ready-for-agent` ticket 的验收 checkbox 必须全部未勾选",
      "取消勾选或修正 ticket 状态后重试",
    );
  }
  if (status === "resolved" && acceptanceLines.some(line => /^- \[ \]/.test(line))) {
    addFinding(
      path,
      "`resolved` ticket 存在未勾选验收项",
      "`resolved` ticket 的验收 checkbox 必须全部勾选",
      "完成验收并勾选，或修正 ticket 状态后重试",
    );
  }
  const resolutionSections = ticketSections.filter(section => section.heading.startsWith("Resolution"));
  const reopenSections = ticketSections.filter(section => section.heading.startsWith("Reopen"));
  const lifecycleSections = ticketSections.filter(
    section => section.heading.startsWith("Resolution") || section.heading.startsWith("Reopen"),
  );
  if (status === "resolved" && resolutionSections.length === 0) {
    addFinding(
      path,
      "`resolved` ticket 未包含 Resolution",
      "`resolved` ticket 必须包含 Resolution 章节",
      "补充完整 Resolution 后重试",
    );
  }
  if (status === "ready-for-agent" && lifecycleSections.length > 0) {
    addFinding(
      path,
      "`ready-for-agent` ticket 包含 Resolution 或 Reopen",
      "`ready-for-agent` ticket 不得包含 Resolution 或 Reopen",
      "移除生命周期记录或修正 ticket 状态后重试",
    );
  }
  if (status === "claimed" && resolutionSections.length > 0 && reopenSections.length === 0) {
    addFinding(
      path,
      "`claimed` ticket 保留了旧 Resolution，但没有 Reopen",
      "保留 Resolution 的 `claimed` ticket 必须包含 Reopen",
      "补充 Reopen 记录或移除错误 Resolution 后重试",
    );
  }
  if (lifecycleSections.length > 0 && lifecycleSections[0].heading !== "Resolution") {
    addFinding(
      path,
      `ticket 首个生命周期章节为 \`## ${lifecycleSections[0].heading}\``,
      "ticket 生命周期必须从普通 `## Resolution` 开始",
      "保留初次普通 Resolution，并只在 Reopen 后使用 dated Resolution",
    );
  }
  for (const [index, section] of lifecycleSections.entries()) {
    if (section.heading.startsWith("Reopen") && !lifecycleSections.slice(0, index).some(item => item.heading === "Resolution")) {
      addFinding(
        path,
        `\`## ${section.heading}\` 此前没有普通 Resolution`,
        "Reopen 必须位于一个既有 Resolution 之后",
        "补充旧 Resolution 或移除错误 Reopen 后重试",
      );
    }
  }
  if (reopenSections.length > 0 && status !== "claimed" && status !== "resolved") {
    addFinding(
      path,
      `Reopen 出现在 \`${status}\` ticket`,
      "Reopen 只允许出现在 `claimed` 或 `resolved` ticket",
      "修正 ticket 状态或移除错误 Reopen 后重试",
    );
  }
  let waitingForDatedResolution = false;
  for (const section of lifecycleSections.slice(1)) {
    if (section.heading.startsWith("Reopen")) {
      if (waitingForDatedResolution) {
        addFinding(
          path,
          `\`## ${section.heading}\` 紧跟在尚未解决的 Reopen 之后`,
          "每个 Reopen 后必须先追加 dated Resolution，才能再次 Reopen",
          "在两次 Reopen 之间补充完整 dated Resolution 后重试",
        );
      }
      waitingForDatedResolution = true;
      continue;
    }
    if (section.heading.startsWith("Resolution")) {
      if (!waitingForDatedResolution || section.heading === "Resolution") {
        addFinding(
          path,
          `生命周期中的 \`## ${section.heading}\` 没有对应 Reopen`,
          "初次解决使用普通 Resolution；后续每个 Reopen 对应一个 dated Resolution",
          "修正 Resolution 与 Reopen 的交替顺序后重试",
        );
      }
      else {
        waitingForDatedResolution = false;
      }
    }
  }
  if (status === "resolved" && reopenSections.length > 0 && waitingForDatedResolution) {
    addFinding(
      path,
      "最新 Reopen 后没有有效的 dated Resolution",
      "reopened ticket 再次 `resolved` 时必须在最新 Reopen 后追加 dated Resolution",
      "追加完整的 `## Resolution YYYY-MM-DD` 后重试",
    );
  }
  if (status === "claimed" && resolutionSections.length > 0 && !waitingForDatedResolution) {
    if (reopenSections.length > 0) {
      addFinding(
        path,
        "`claimed` ticket 的最新生命周期章节不是 Reopen",
        "保留 Resolution 的 `claimed` ticket 必须以尚未解决的 Reopen 结束",
        "补充 Reopen 记录或修正 ticket 状态后重试",
      );
    }
  }
  const sectionCounts = new Map<string, number>();
  for (const section of ticketSections) {
    sectionCounts.set(section.heading, (sectionCounts.get(section.heading) ?? 0) + 1);
  }
  for (const [heading, count] of sectionCounts) {
    if (count > 1) {
      addFinding(
        path,
        `ticket 二级章节 \`## ${heading}\` 实际出现 ${count} 次`,
        `ticket 二级章节 \`## ${heading}\` 不得重复`,
        "删除重复章节后重试",
      );
    }
  }
  if (ticketKind === "review-remediation") {
    const comments = ticketSections.filter(section => section.heading === "Comments");
    const findingSources = comments.flatMap(section => [...section.body.matchAll(/^- Finding source:(.*)$/gm)]);
    if (comments.length !== 1 || findingSources.length !== 1 || findingSources[0][1].trim() === "") {
      addFinding(
        path,
        `review-remediation ticket 包含 ${comments.length} 个 Comments 和 ${findingSources.length} 个 Finding source`,
        "review-remediation ticket 必须在 `## Comments` 记录唯一非空 `Finding source`",
        "补充 `- Finding source: <finding 来源>` 后重试",
      );
    }
  }
  for (const section of ticketSections) {
    if (section.heading !== "Comments" && !section.heading.startsWith("Resolution") && !section.heading.startsWith("Reopen")) {
      addFinding(
        path,
        `ticket 二级章节为 \`## ${section.heading}\``,
        "ticket 二级章节只接受 `Resolution`、`Resolution YYYY-MM-DD`、`Reopen YYYY-MM-DD` 或 `Comments`",
        "移除或重命名该章节后重试",
      );
    }
    if (section.heading.startsWith("Resolution")) {
      if (section.heading === "Resolution") {
        checkResolution(path, section.body);
      }
      else {
        const date = /^Resolution (\d{4}-\d{2}-\d{2})$/.exec(section.heading)?.[1];
        if (!date || !isValidIsoDate(date)) {
          addFinding(
            path,
            `dated Resolution 标题为 \`## ${section.heading}\``,
            "dated Resolution 标题必须使用有效的 `## Resolution YYYY-MM-DD`",
            "修正标题日期后重试",
          );
        }
        else {
          checkResolution(path, section.body);
        }
      }
    }
    if (section.heading.startsWith("Reopen")) {
      const date = /^Reopen (\d{4}-\d{2}-\d{2})$/.exec(section.heading)?.[1];
      if (!date || !isValidIsoDate(date)) {
        addFinding(
          path,
          `Reopen 标题为 \`## ${section.heading}\``,
          "Reopen 标题必须使用有效的 `## Reopen YYYY-MM-DD`",
          "修正标题日期后重试",
        );
      }
      checkReopen(path, section.body);
    }
  }
}

function checkReopen(path: string, reopen: string): void {
  let previousField: string | undefined;
  let previousIndex = -1;
  for (const field of ["Reason", "Previous reviewed content head", "Remediation base", "Status transition"]) {
    const matches = [...reopen.matchAll(new RegExp(`^- ${escapeRegExp(field)}:.*$`, "gm"))];
    if (matches.length !== 1) {
      addFinding(
        path,
        `Reopen 字段 \`${field}\` 实际出现 ${matches.length} 次`,
        `Reopen 字段 \`${field}\` 必须恰好出现一次`,
        "补充或去重该字段后重试",
      );
    }
    else {
      const fieldIndex = matches[0].index;
      if (previousField && fieldIndex < previousIndex) {
        addFinding(
          path,
          `Reopen 字段顺序错误：\`${field}\` 位于 \`${previousField}\` 之前`,
          `\`${field}\` 位于 \`${previousField}\` 之后`,
          "移动字段到固定顺序后重试",
        );
      }
      previousField = field;
      previousIndex = fieldIndex;
    }
  }

  const reason = readUniqueReopenField(reopen, "Reason");
  if (reason === "") {
    addFinding(path, "Reopen 的 `Reason` 为空", "`Reason` 不能为空", "补充 finding 原因后重试");
  }
  const previousHead = readUniqueReopenField(reopen, "Previous reviewed content head");
  if (previousHead !== undefined && !/^`[0-9a-f]{40}`$/.test(previousHead)) {
    addFinding(
      path,
      `Reopen 的 \`Previous reviewed content head\` 为 \`${previousHead}\``,
      "`Previous reviewed content head` 必须是完整 SHA",
      "修正 SHA 字面值后重试",
    );
  }
  const remediationBase = readUniqueReopenField(reopen, "Remediation base");
  if (remediationBase !== undefined && remediationBase !== "`claim-checkpoint`" && !/^`[0-9a-f]{40}`$/.test(remediationBase)) {
    addFinding(
      path,
      `Reopen 的 \`Remediation base\` 为 \`${remediationBase}\``,
      "`Remediation base` 必须是 `claim-checkpoint` 或完整 SHA",
      "修正 remediation base 后重试",
    );
  }
  const transition = readUniqueReopenField(reopen, "Status transition");
  if (transition !== undefined && transition !== "resolved -> claimed") {
    addFinding(
      path,
      `Reopen 的 \`Status transition\` 为 \`${transition}\``,
      "`Status transition` 必须是 `resolved -> claimed`",
      "修正固定状态转换后重试",
    );
  }
}

function readUniqueReopenField(reopen: string, field: string): string | undefined {
  const matches = [...reopen.matchAll(new RegExp(`^- ${escapeRegExp(field)}:(.*)$`, "gm"))];
  return matches.length === 1 ? matches[0][1].trim() : undefined;
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function checkResolution(path: string, resolution: string): void {
  let previousField: string | undefined;
  let previousIndex = -1;
  for (const field of ["Ticket base", "Reviewed content head", "Candidate commits", "Final squash commit", "Validation", "Review"]) {
    const matches = [...resolution.matchAll(new RegExp(`^- ${escapeRegExp(field)}:.*$`, "gm"))];
    if (matches.length !== 1) {
      addFinding(
        path,
        `Resolution 字段 \`${field}\` 实际出现 ${matches.length} 次`,
        `Resolution 字段 \`${field}\` 必须恰好出现一次`,
        "补充或去重该字段后重试",
      );
    }
    else {
      const fieldIndex = matches[0].index;
      if (previousField && fieldIndex < previousIndex) {
        addFinding(
          path,
          `Resolution 字段顺序错误：\`${field}\` 位于 \`${previousField}\` 之前`,
          `\`${field}\` 位于 \`${previousField}\` 之后`,
          "移动字段到固定顺序后重试",
        );
      }
      previousField = field;
      previousIndex = fieldIndex;
    }
  }

  for (const field of ["Ticket base", "Reviewed content head", "Final squash commit"]) {
    const value = readUniqueResolutionField(resolution, field);
    const allowsPending = field === "Final squash commit";
    if (value !== undefined && !(allowsPending && value === "`pending`") && !/^`[0-9a-f]{40}`$/.test(value)) {
      addFinding(
        path,
        `Resolution 的 \`${field}\` 为 \`${value}\``,
        `Resolution 的 \`${field}\` 格式错误；应为反引号包裹的 40 位小写 SHA${allowsPending ? " 或 `pending`" : ""}`,
        "修正字面值后重试",
      );
    }
  }
  const candidateCommits = readUniqueResolutionField(resolution, "Candidate commits");
  if (candidateCommits !== undefined && !/^`[0-9a-f]{40}`(?:, `[0-9a-f]{40}`)*$/.test(candidateCommits)) {
    addFinding(
      path,
      `Resolution 的 \`Candidate commits\` 为 \`${candidateCommits}\``,
      "`Candidate commits` 必须是逗号分隔的完整 SHA 列表",
      "修正 candidate 列表后重试",
    );
  }
  else if (candidateCommits !== undefined) {
    const candidates = [...candidateCommits.matchAll(/`([0-9a-f]{40})`/g)].map(match => match[1]);
    if (new Set(candidates).size !== candidates.length) {
      addFinding(
        path,
        "Resolution 的 `Candidate commits` 包含重复 SHA",
        "`Candidate commits` 不得包含重复 SHA",
        "删除重复 candidate 后重试",
      );
    }
  }
  const review = readUniqueResolutionField(resolution, "Review");
  const expectedReview = "Standards and Spec review passed with no unresolved findings.";
  if (review !== undefined && review !== expectedReview) {
    addFinding(
      path,
      `Resolution 的 \`Review\` 为 \`${review}\``,
      "Resolution 的 `Review` 必须使用固定通过文本",
      `改为 \`${expectedReview}\` 后重试`,
    );
  }
  const validation = readUniqueResolutionField(resolution, "Validation");
  if (validation !== undefined && validation !== "") {
    addFinding(
      path,
      `Resolution 的 \`Validation\` 父项为 \`${validation}\``,
      "Resolution 的 `Validation` 父项必须为空值",
      "把结果写入缩进的命令子项，并清空父项行内值后重试",
    );
  }
  const validationMatch = /^- Validation:.*$/m.exec(resolution);
  const reviewMatch = /^- Review:.*$/m.exec(resolution);
  if (validationMatch?.index !== undefined && reviewMatch?.index !== undefined) {
    const validationStart = validationMatch.index + validationMatch[0].length;
    const validationLines = resolution
      .slice(validationStart, reviewMatch.index)
      .split("\n")
      .filter(line => line.trim().length > 0);
    if (
      validationLines.length === 0
      || validationLines.some(line => !/^ {2}- `[^`]+` — passed(?:[，。；;,.：:\s].*)?$/.test(line))
    ) {
      addFinding(
        path,
        `Resolution 的 \`Validation\` 子项为 ${validationLines.length} 条`,
        "Resolution 的 `Validation` 必须包含至少一条规范 passed 命令子项",
        "使用 `  - `<command>` — passed` 形状修正子列表后重试",
      );
    }
  }
}

function readUniqueResolutionField(resolution: string, field: string): string | undefined {
  const matches = [...resolution.matchAll(new RegExp(`^- ${escapeRegExp(field)}:(.*)$`, "gm"))];
  return matches.length === 1 ? matches[0][1].trim() : undefined;
}

function extractLevelTwoSections(markdown: string): Array<{ body: string; heading: string }> {
  const matches = [...markdown.matchAll(/^## (.+)$/gm)];
  return matches.map((match, index) => {
    const contentStart = match.index + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? markdown.length;
    return { body: markdown.slice(contentStart, contentEnd), heading: match[1].trim() };
  });
}

function readUniqueTicketField(ticket: string, field: string): string | undefined {
  const matches = [...ticket.matchAll(new RegExp(`^\\*\\*${escapeRegExp(field)}:\\*\\*(.*)$`, "gm"))];
  return matches.length === 1 ? matches[0][1].trim() : undefined;
}

function checkSpec(path: string, spec: string): void {
  const structuralSpec = stripCodeFences(spec);
  const firstLine = structuralSpec.split("\n", 1)[0].trimEnd();
  const titleMatch = /^# (.+)$/.exec(firstLine);
  if (!titleMatch || !/\p{Script=Han}/u.test(titleMatch[1])) {
    addFinding(
      path,
      `spec 标题为 \`${firstLine}\``,
      "spec 标题必须使用 `# <中文标题>` 格式",
      "修正首行标题后重试",
    );
  }

  const statusMatches = [...structuralSpec.matchAll(/^\*\*Status:\*\*(.*)$/gm)];
  if (statusMatches.length !== 1) {
    addFinding(
      path,
      `spec 的 \`Status\` 实际出现 ${statusMatches.length} 次`,
      "spec 的 `Status` 必须恰好出现一次",
      "补充或去重 `**Status:** <value>` 后重试",
    );
    return;
  }
  const status = statusMatches[0][1].trim();
  if (status !== "draft" && status !== "approved") {
    addFinding(
      path,
      `spec 的 \`Status\` 为 \`${status}\``,
      "spec 的 `Status` 只接受 `draft` 或 `approved`",
      "修正状态值后重试",
    );
  }
}

function stripCodeFences(markdown: string): string {
  let fenceCharacter: "`" | "~" | undefined;
  let fenceLength = 0;

  return markdown.split("\n").map((line) => {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (!fenceCharacter) {
      if (!fence)
        return line;
      fenceCharacter = fence[0] as "`" | "~";
      fenceLength = fence.length;
      return "";
    }

    const trimmed = line.trim();
    if (trimmed.length >= fenceLength && [...trimmed].every(character => character === fenceCharacter)) {
      fenceCharacter = undefined;
      fenceLength = 0;
    }
    return "";
  }).join("\n");
}

function checkLedgerFields(featureDirectory: string, delivery: string): void {
  const path = `.scratch/${featureDirectory}/delivery.md`;
  const header = extractLedgerHeader(delivery);
  const firstLine = delivery.split("\n", 1)[0].trimEnd();
  const titleMatch = /^# (.+)交付记录$/.exec(firstLine);
  if (!titleMatch || !/\p{Script=Han}/u.test(titleMatch[1])) {
    addFinding(
      path,
      `delivery 标题为 \`${firstLine}\``,
      "delivery 标题必须使用 `# <中文功能名>交付记录` 格式",
      "修正首行标题后重试",
    );
  }
  checkLedgerHeadings(path, delivery);
  checkValidationPlan(path, delivery);
  checkLedgerRecordSections(path, delivery);
  let previousField: string | undefined;
  let previousIndex = -1;

  for (const field of ledgerFields) {
    const pattern = new RegExp(`^${field}:.*$`, "gm");
    const matches = [...header.matchAll(pattern)];
    if (matches.length === 0) {
      addFinding(
        path,
        `缺少必需字段 \`${field}\``,
        `顶层 header 恰好包含一个 \`${field}: <value>\``,
        `补充且只保留一个 \`${field}: <value>\``,
      );
      continue;
    }
    if (matches.length !== 1) {
      addFinding(
        path,
        `字段 \`${field}\` 必须恰好出现一次，实际出现 ${matches.length} 次`,
        `顶层 header 只有一个 \`${field}: <value>\``,
        "删除重复字段后重试",
      );
      continue;
    }

    const value = matches[0][0].slice(field.length + 1).trim();
    const allowedValues = ledgerEnumValues[field];
    if (allowedValues && !allowedValues.includes(value)) {
      addFinding(
        path,
        `字段 \`${field}\` 的值 \`${value}\` 不在允许范围内`,
        allowedValues.map(allowed => `\`${allowed}\``).join("、"),
        "改用允许的枚举值后重试",
      );
    }
    const placeholders = shaFieldPlaceholders[field];
    if (placeholders && !shaPattern.test(value) && !placeholders.includes(value)) {
      const placeholderText = placeholders.length > 0 ? ` 或 ${placeholders.map(item => `\`${item}\``).join("、")}` : "";
      addFinding(
        path,
        `字段 \`${field}\` 的 SHA 格式错误：\`${value}\``,
        `40 位小写十六进制值${placeholderText}`,
        "修正字面值后重试",
      );
    }

    const index = matches[0].index;
    if (previousField && index < previousIndex) {
      addFinding(
        path,
        `顶层字段顺序错误；\`${field}\` 必须位于 \`${previousField}\` 之后`,
        "顶层字段遵循 tracker 契约固定顺序",
        "移动字段到正确位置后重试",
      );
    }
    previousField = field;
    previousIndex = index;
  }

  const featureSlug = readUniqueField(header, "Feature-Slug");
  if (featureSlug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(featureSlug)) {
      addFinding(
        path,
        `字段 \`Feature-Slug\` 实际为 \`${featureSlug}\``,
        "字段 `Feature-Slug` 必须是小写 kebab-case",
        "修正 slug 后重试",
      );
    }
    if (featureSlug !== featureDirectory) {
      addFinding(
        path,
        `字段 \`Feature-Slug\` 实际为 \`${featureSlug}\``,
        `字段 \`Feature-Slug\` 必须与目录名 \`${featureDirectory}\` 一致`,
        "统一目录名与字段值后重试",
      );
    }
  }
  checkLedgerValueFormats(path, header);
  checkMergeBrief(path, delivery, header);
  checkDeliveryReceipt(path, delivery, header);
}

function checkLedgerValueFormats(path: string, header: string): void {
  for (const field of [
    "Feature-Slug",
    "Feature-Branch",
    "Target-Branch",
    "Authorized-Implementation-Scope",
    "Current-Ticket",
    "Change-Types",
    "Affected-Workspaces",
  ]) {
    if (readUniqueField(header, field) === "") {
      addFinding(
        path,
        `字段 \`${field}\` 为空`,
        `字段 \`${field}\` 不能为空`,
        "补充字段值后重试",
      );
    }
  }

  const currentTicket = readUniqueField(header, "Current-Ticket");
  if (currentTicket && currentTicket !== "none" && !/^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(currentTicket)) {
    addFinding(
      path,
      `字段 \`Current-Ticket\` 为 \`${currentTicket}\``,
      "字段 `Current-Ticket` 必须是 `none` 或 `NN-kebab-case`",
      "修正字段值后重试",
    );
  }

  const declaredChangeTypes = readUniqueField(header, "Change-Types");
  if (declaredChangeTypes && declaredChangeTypes !== "none") {
    const values = declaredChangeTypes.split(",");
    checkSortedUniqueList(path, "Change-Types", values);
    const unsupported = values.find(value => !changeTypes.has(value));
    if (unsupported) {
      addFinding(
        path,
        `字段 \`Change-Types\` 包含不支持的 change type \`${unsupported}\``,
        "只使用 tracker 契约支持的 change type",
        "删除或修正不支持的值后重试",
      );
    }
  }

  const affectedWorkspaces = readUniqueField(header, "Affected-Workspaces");
  if (affectedWorkspaces && affectedWorkspaces !== "none" && affectedWorkspaces !== "root") {
    const values = affectedWorkspaces.split(",");
    checkSortedUniqueList(path, "Affected-Workspaces", values);
    const valid = values.every(value => /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(value));
    if (!valid) {
      addFinding(
        path,
        `字段 \`Affected-Workspaces\` 为 \`${affectedWorkspaces}\``,
        "字段 `Affected-Workspaces` 必须是 `none`、`root` 或 pnpm package name 的逗号列表",
        "修正 workspace 列表后重试",
      );
    }
  }
}

function checkSortedUniqueList(path: string, field: string, values: string[]): void {
  const canonicalValues = [...new Set(values)].sort();
  if (values.length !== canonicalValues.length || values.some((value, index) => value !== canonicalValues[index])) {
    addFinding(
      path,
      `字段 \`${field}\` 的逗号列表为 \`${values.join(",")}\``,
      `字段 \`${field}\` 的逗号列表必须按字母顺序且不得重复`,
      `改为 \`${canonicalValues.join(",")}\` 后重试`,
    );
  }
}

function checkValidationPlan(path: string, delivery: string): void {
  const section = extractSection(delivery, "Validation Plan");
  if (!section)
    return;

  const expectedHeader = "| Scope | Change-Types | Affected-Workspaces | Required-Commands |";
  const expectedSeparator = "|---|---|---|---|";
  const sectionLines = section.split("\n").map(line => line.trim());
  const headerIndices = sectionLines.flatMap((line, index) => line === expectedHeader ? [index] : []);
  const separatorIndices = sectionLines.flatMap((line, index) => line === expectedSeparator ? [index] : []);
  if (headerIndices.length === 0) {
    addFinding(
      path,
      "`Validation Plan` 缺少固定四列表头",
      `表头为 \`${expectedHeader}\``,
      "补充或修正表头后重试",
    );
  }
  if (separatorIndices.length !== 1) {
    addFinding(
      path,
      `\`Validation Plan\` 固定四列分隔行实际出现 ${separatorIndices.length} 次`,
      `\`Validation Plan\` 必须包含唯一的固定四列分隔行 \`${expectedSeparator}\``,
      "补充或去重分隔行后重试",
    );
  }
  if (headerIndices.length !== 1 || separatorIndices.length !== 1 || separatorIndices[0] !== headerIndices[0] + 1) {
    addFinding(
      path,
      `\`Validation Plan\` 表头出现 ${headerIndices.length} 次，分隔行出现 ${separatorIndices.length} 次`,
      "`Validation Plan` 的唯一表头必须紧邻唯一固定分隔行",
      "去重并相邻放置表头与分隔行后重试",
    );
  }

  const tableLines = sectionLines
    .filter(line => line.startsWith("|") && line.endsWith("|"));
  for (const line of tableLines) {
    if (line === expectedHeader || line === expectedSeparator)
      continue;
    const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
    if (cells.length !== 4 || cells.some(cell => cell.length === 0)) {
      addFinding(
        path,
        `\`Validation Plan\` 数据行为 \`${line}\``,
        "`Validation Plan` 数据行必须包含 4 个非空单元格",
        "补齐该行后重试",
      );
      continue;
    }
    const [scope, declaredTypes, affectedWorkspaces, commands] = cells;
    if (scope !== "feature" && !/^ticket:\d{2}$/.test(scope)) {
      addFinding(
        path,
        `Validation Plan Scope 为 \`${scope}\``,
        "Validation Plan Scope 只接受 `ticket:NN` 或 `feature`",
        "修正 scope 后重试",
      );
    }
    if (declaredTypes !== "none") {
      const values = declaredTypes.split(",");
      const canonicalValues = [...new Set(values)].sort();
      if (values.length !== canonicalValues.length || values.some((value, index) => value !== canonicalValues[index])) {
        addFinding(
          path,
          `Validation Plan Change-Types 为 \`${declaredTypes}\``,
          "Validation Plan Change-Types 必须按字母顺序且不得重复",
          `改为 \`${canonicalValues.join(",")}\` 后重试`,
        );
      }
      const unsupported = values.find(value => !changeTypes.has(value));
      if (unsupported) {
        addFinding(
          path,
          `Validation Plan Change-Types 包含 \`${unsupported}\``,
          "Validation Plan Change-Types 包含不支持的值",
          "删除或修正不支持的 change type 后重试",
        );
      }
    }
    if (affectedWorkspaces !== "none" && affectedWorkspaces !== "root") {
      const values = affectedWorkspaces.split(",");
      const canonicalValues = [...new Set(values)].sort();
      const valid = values.every(value => /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(value));
      if (!valid) {
        addFinding(
          path,
          `Validation Plan Affected-Workspaces 为 \`${affectedWorkspaces}\``,
          "Validation Plan Affected-Workspaces 格式错误",
          "改用 `none`、`root` 或 pnpm package name 列表后重试",
        );
      }
      if (values.length !== canonicalValues.length || values.some((value, index) => value !== canonicalValues[index])) {
        addFinding(
          path,
          `Validation Plan Affected-Workspaces 为 \`${affectedWorkspaces}\``,
          "Validation Plan Affected-Workspaces 必须按字母顺序且不得重复",
          `改为 \`${canonicalValues.join(",")}\` 后重试`,
        );
      }
    }
    if (!/^`[^`]+`(?:<br>`[^`]+`)*$/.test(commands)) {
      addFinding(
        path,
        `Validation Plan Required-Commands 为 \`${commands}\``,
        "Validation Plan Required-Commands 必须是 `<br>` 分隔的反引号命令列表",
        "修正命令列表后重试",
      );
    }
  }
}

function checkValidationPlanScopes(
  path: string,
  delivery: string,
  workflowKind: "quick" | "standard",
  ticketIds: string[],
): void {
  const rows = readValidationPlanRows(delivery);
  if (workflowKind === "quick" && rows.some(row => row.scope !== "feature")) {
    addFinding(
      path,
      `quick Validation Plan 包含 scope：${rows.map(row => `\`${row.scope}\``).join("、")}`,
      "quick Validation Plan 只允许 `feature` scope",
      "删除 ticket scope 后重试",
    );
  }
  const expectedScopes = workflowKind === "quick" ? ["feature"] : [...ticketIds.map(id => `ticket:${id}`), "feature"];
  const unexpectedScope = rows.find(row => !expectedScopes.includes(row.scope));
  if (workflowKind === "standard" && unexpectedScope) {
    addFinding(
      path,
      `Validation Plan 包含未发布 scope \`${unexpectedScope.scope}\``,
      "standard Validation Plan 只包含当前 ticket scopes 与唯一 `feature` scope",
      "删除未发布 scope 行后重试",
    );
  }
  for (const scope of expectedScopes) {
    const count = rows.filter(row => row.scope === scope).length;
    if (count !== 1) {
      addFinding(
        path,
        `Validation Plan scope \`${scope}\` 实际出现 ${count} 次`,
        `Validation Plan scope \`${scope}\` 必须恰好出现一次`,
        "补充或去重该 scope 行后重试",
      );
    }
  }
}

function readValidationPlanRows(delivery: string): Array<{ scope: string }> {
  const section = extractSection(delivery, "Validation Plan");
  if (!section)
    return [];
  return section
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("|") && line.endsWith("|"))
    .filter(line => line !== "| Scope | Change-Types | Affected-Workspaces | Required-Commands |" && line !== "|---|---|---|---|")
    .flatMap((line) => {
      const cells = line.slice(1, -1).split("|").map(cell => cell.trim());
      return cells.length === 4 ? [{ scope: cells[0] }] : [];
    });
}

function checkLedgerHeadings(path: string, delivery: string): void {
  let previousHeading: string | undefined;
  let previousIndex = -1;

  for (const heading of ledgerHeadings) {
    const matches = [...delivery.matchAll(new RegExp(`^## ${escapeRegExp(heading)}$`, "gm"))];
    if (matches.length === 0) {
      addFinding(
        path,
        `缺少必需章节 \`## ${heading}\``,
        `恰好一个 \`## ${heading}\` 章节`,
        "补充该章节后重试",
      );
      continue;
    }
    if (matches.length !== 1) {
      addFinding(
        path,
        `章节 \`## ${heading}\` 必须恰好出现一次，实际出现 ${matches.length} 次`,
        `恰好一个 \`## ${heading}\` 章节`,
        "删除重复章节后重试",
      );
      continue;
    }

    const index = matches[0].index;
    if (previousHeading && index < previousIndex) {
      addFinding(
        path,
        `章节顺序错误；\`## ${heading}\` 必须位于 \`## ${previousHeading}\` 之后`,
        "章节遵循 tracker 契约固定顺序",
        "移动章节到正确位置后重试",
      );
    }
    previousHeading = heading;
    previousIndex = index;
  }
}

function checkLedgerRecordSections(path: string, delivery: string): void {
  checkRecordSection(path, delivery, "阶段证据", (line) => {
    const match = /^- `([GT]\d) [^`]+` — \S.*$/.exec(line);
    if (!match || !/^(?:G[0-7]|T[1-4])$/.test(match[1]))
      return false;
    if (match[1].startsWith("T") && !/ticket \d{2}/.test(line))
      return false;
    const hasFullShaLiteral = [...line.matchAll(/`([^`]*)`/g)]
      .some(codeSpan => /\b[0-9a-f]{40}\b/.test(codeSpan[1]));
    return !["T2", "T3"].includes(match[1]) || hasFullShaLiteral;
  });
  checkRecordSection(
    path,
    delivery,
    "验证记录",
    line => /^- `[^`]+` — (?:passed|failed|waived)；Content-Head: `[0-9a-f]{40}`(?:；\S.*)?$/.test(line),
  );
  checkRecordSection(
    path,
    delivery,
    "评审记录",
    line => /^- (?:Ticket \d{2}|Feature) — fixed point: `[0-9a-f]{40}`；reviewed head: `[0-9a-f]{40}`；Standards: (?:passed|findings)；Spec: (?:passed|findings)(?:；\S.*)?$/.test(line),
  );
  for (const heading of ["授权记录", "重开与修复"] as const) {
    checkRecordSection(path, delivery, heading, (line) => {
      const match = /^- (\d{4}-\d{2}-\d{2}) — \S.*$/.exec(line);
      return !!match && isValidIsoDate(match[1]);
    });
  }
  checkRecordSection(
    path,
    delivery,
    "Waivers",
    (line) => {
      const match = /^- (\d{4}-\d{2}-\d{2}) — Command: `[^`]+`；Reason: \S.*；Scope: \S.*；Risk: \S.*；Approved by: \S.*$/.exec(line);
      return !!match && isValidIsoDate(match[1]);
    },
  );
}

function checkRecordSection(
  path: string,
  delivery: string,
  heading: string,
  isValidRecord: (line: string) => boolean,
): void {
  const section = extractSection(delivery, heading);
  if (section === undefined)
    return;
  const lines = section.split("\n").map(line => line.trim()).filter(Boolean);
  if (lines.length === 1 && lines[0] === "- 无。")
    return;
  const invalidLine = lines.find(line => !isValidRecord(line));
  if (lines.length === 0 || invalidLine) {
    addFinding(
      path,
      `章节 \`## ${heading}\` 包含无效记录 \`${invalidLine ?? "<empty>"}\``,
      `章节 \`## ${heading}\` 的记录格式错误；应使用规范记录或唯一空状态 \`- 无。\``,
      "修正该章节记录后重试",
    );
  }
}

function checkMergeBrief(path: string, delivery: string, header: string): void {
  const section = extractSection(delivery, "Merge brief");
  if (section === undefined)
    return;
  const stage = readUniqueField(header, "Stage");
  const trimmed = section.trim();
  const isEmpty = trimmed === "- 无。";
  if ((stage === "merge-ready" || stage === "delivered") && isEmpty) {
    addFinding(
      path,
      `\`${stage}\` 状态的 Merge brief 为空`,
      `\`${stage}\` 状态必须包含完整 Merge brief`,
      "补充 Merge brief 后重试",
    );
  }
  if (isEmpty)
    return;

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
  let previousIndex = -1;
  for (const field of fields) {
    const matches = [...section.matchAll(new RegExp(`^- ${escapeRegExp(field)}:(.*)$`, "gm"))];
    if (matches.length !== 1) {
      addFinding(
        path,
        `Merge brief 字段 \`${field}\` 实际出现 ${matches.length} 次`,
        `Merge brief 字段 \`${field}\` 必须恰好出现一次`,
        "补充或去重该字段后重试",
      );
      continue;
    }
    if (matches[0].index < previousIndex) {
      addFinding(
        path,
        `Merge brief 字段 \`${field}\` 位于错误位置`,
        "Merge brief 字段必须按 tracker 契约排序",
        "移动字段到固定顺序后重试",
      );
    }
    previousIndex = matches[0].index;
  }

  const equalityFields: Record<string, string> = {
    "Feature branch": "Feature-Branch",
    "Target branch": "Target-Branch",
    "Target base": "Target-Base",
    "Target tip": "Merge-Target-Tip",
    "Content head": "Content-Head",
    "Verified content head": "Verified-Content-Head",
    "Reviewed content head": "Reviewed-Content-Head",
  };
  for (const [briefField, ledgerField] of Object.entries(equalityFields)) {
    const value = readUniqueBulletField(section, briefField);
    const ledgerValue = readUniqueField(header, ledgerField);
    if (value !== undefined && ledgerValue !== undefined && value !== `\`${ledgerValue}\``) {
      addFinding(
        path,
        `Merge brief 的 \`${briefField}\` 为 \`${value}\`，顶层 \`${ledgerField}\` 为 \`${ledgerValue}\``,
        `Merge brief 的 \`${briefField}\` 必须与顶层字段字面相等`,
        "统一两个文档字面值后重试",
      );
    }
  }
  for (const field of ["Target base", "Target tip", "Content head", "Verified content head", "Reviewed content head"]) {
    const value = readUniqueBulletField(section, field);
    if (value !== undefined && !/^`[0-9a-f]{40}`$/.test(value)) {
      addFinding(
        path,
        `Merge brief 的 \`${field}\` 为 \`${value}\``,
        `Merge brief 的 \`${field}\` 必须是完整 SHA 字面值`,
        "修正 SHA 格式后重试",
      );
    }
  }
  const commitRange = readUniqueBulletField(section, "Commit range");
  if (commitRange !== undefined && !/^`[0-9a-f]{40}\.\.\.[0-9a-f]{40}`$/.test(commitRange)) {
    addFinding(
      path,
      `Merge brief 的 \`Commit range\` 为 \`${commitRange}\``,
      "Merge brief 的 `Commit range` 格式错误；应为两个完整 SHA 的字面范围",
      "修正 range 字面值后重试",
    );
  }
  for (const field of ["Delivery summary", "Validation", "Review", "Waivers and risks"]) {
    if (readUniqueBulletField(section, field) === "") {
      addFinding(
        path,
        `Merge brief 的 \`${field}\` 为空`,
        `Merge brief 的 \`${field}\` 不能为空`,
        "补充字段值后重试",
      );
    }
  }
  const validation = readUniqueBulletField(section, "Validation");
  if (validation !== undefined && !["passed", "passed-with-waivers"].includes(validation)) {
    addFinding(
      path,
      `Merge brief 的 \`Validation\` 为 \`${validation}\``,
      "Merge brief 的 `Validation` 只接受 `passed` 或 `passed-with-waivers`",
      "修正结果枚举后重试",
    );
  }
  const review = readUniqueBulletField(section, "Review");
  if (review !== undefined && review !== "passed") {
    addFinding(
      path,
      `Merge brief 的 \`Review\` 为 \`${review}\``,
      "Merge brief 的 `Review` 必须是 `passed`",
      "修正评审结果后重试",
    );
  }
  const localTransactionValue = readUniqueBulletField(section, "Local transaction");
  if (localTransactionValue !== undefined && localTransactionValue !== "") {
    addFinding(
      path,
      `Merge brief 的 \`Local transaction\` 父项为 \`${localTransactionValue}\``,
      "Merge brief 的 `Local transaction` 父项必须为空值",
      "把事务写入缩进编号列表后重试",
    );
  }
  if (localTransactionValue !== undefined) {
    const localTransaction = /^- Local transaction:.*$/m.exec(section);
    const transactionLines = localTransaction
      ? section.slice(localTransaction.index + localTransaction[0].length).split("\n").filter(line => line.trim().length > 0)
      : [];
    const validList = transactionLines.length === 5
      && transactionLines.every((line, index) => new RegExp(`^ {2}${index + 1}\\. \\S.*$`).test(line));
    if (!validList) {
      addFinding(
        path,
        `Merge brief 的本地事务包含 ${transactionLines.length} 个编号项`,
        "Merge brief 的 `Local transaction` 必须是从 1 到 5 的连续编号列表",
        "补齐并连续编号本地事务后重试",
      );
    }
  }
  if (stage === "merge-ready" || stage === "delivered") {
    const contentHead = readUniqueField(header, "Content-Head");
    const verifiedHead = readUniqueField(header, "Verified-Content-Head");
    const reviewedHead = readUniqueField(header, "Reviewed-Content-Head");
    if (!contentHead || contentHead !== verifiedHead || contentHead !== reviewedHead || !shaPattern.test(contentHead)) {
      addFinding(
        path,
        `顶层 content/verified/reviewed heads 为 \`${contentHead}\`、\`${verifiedHead}\`、\`${reviewedHead}\``,
        `\`${stage}\` 状态要求三个 head 字面值相等且为完整 SHA`,
        "同步明确相等的 head 字段后重试",
      );
    }
    const mergeTargetTip = readUniqueField(header, "Merge-Target-Tip");
    if (!mergeTargetTip || !shaPattern.test(mergeTargetTip)) {
      addFinding(
        path,
        `顶层 \`Merge-Target-Tip\` 为 \`${mergeTargetTip}\``,
        `\`${stage}\` 状态要求完整 Merge-Target-Tip SHA`,
        "补充目标 tip 字面值后重试",
      );
    }
  }
}

function readUniqueBulletField(section: string, field: string): string | undefined {
  const matches = [...section.matchAll(new RegExp(`^- ${escapeRegExp(field)}:(.*)$`, "gm"))];
  return matches.length === 1 ? matches[0][1].trim() : undefined;
}

function checkDeliveryReceipt(path: string, delivery: string, header: string): void {
  const section = extractSection(delivery, "Delivery receipt");
  if (section === undefined)
    return;
  const stage = readUniqueField(header, "Stage");
  const finalSquashCommit = readUniqueField(header, "Final-Squash-Commit");
  const trimmed = section.trim();
  const isEmpty = trimmed === "- 无。";
  if (stage === "delivered" && isEmpty) {
    addFinding(
      path,
      "`delivered` 状态的 Delivery receipt 为空",
      "`delivered` 状态必须包含完整 Delivery receipt",
      "补充 Delivery receipt 后重试",
    );
  }
  if (stage !== "delivered" && !isEmpty) {
    addFinding(
      path,
      `\`${stage}\` 状态包含 Delivery receipt`,
      "Delivery receipt 只允许在 `delivered` 状态出现",
      "移除过早记录，或修正 Stage 后重试",
    );
  }
  if (stage === "delivered") {
    if (!finalSquashCommit || !shaPattern.test(finalSquashCommit)) {
      addFinding(
        path,
        `delivered ledger 的 Final-Squash-Commit 为 \`${finalSquashCommit}\``,
        "delivered 状态的 final SHA 必须完整且字面一致",
        "回填完整最终 SHA 后重试",
      );
    }
  }
  else if (finalSquashCommit !== undefined && finalSquashCommit !== "pending") {
    addFinding(
      path,
      `\`${stage}\` 状态的 Final-Squash-Commit 为 \`${finalSquashCommit}\``,
      "非 delivered 状态的 `Final-Squash-Commit` 必须是 `pending`",
      "恢复 `pending`，或在交付完成后修正 Stage 后重试",
    );
  }
  if (isEmpty)
    return;

  const fields = ["Target branch", "Squash commit", "Tracker metadata", "Final checks", "Local feature branch"] as const;
  let previousIndex = -1;
  for (const field of fields) {
    const matches = [...section.matchAll(new RegExp(`^- ${escapeRegExp(field)}:(.*)$`, "gm"))];
    if (matches.length !== 1) {
      addFinding(
        path,
        `Delivery receipt 字段 \`${field}\` 实际出现 ${matches.length} 次`,
        `Delivery receipt 字段 \`${field}\` 必须恰好出现一次`,
        "补充或去重该字段后重试",
      );
      continue;
    }
    if (matches[0].index < previousIndex) {
      addFinding(
        path,
        `Delivery receipt 字段 \`${field}\` 位于错误位置`,
        "Delivery receipt 字段必须按 tracker 契约排序",
        "移动字段到固定顺序后重试",
      );
    }
    previousIndex = matches[0].index;
  }

  const targetBranch = readUniqueBulletField(section, "Target branch");
  const ledgerTargetBranch = readUniqueField(header, "Target-Branch");
  if (targetBranch !== undefined && ledgerTargetBranch !== undefined && targetBranch !== `\`${ledgerTargetBranch}\``) {
    addFinding(
      path,
      `Delivery receipt 的 \`Target branch\` 为 \`${targetBranch}\``,
      "Delivery receipt 的 `Target branch` 必须与顶层字段字面相等",
      "统一两个字面值后重试",
    );
  }
  const squashCommit = readUniqueBulletField(section, "Squash commit");
  if (squashCommit !== undefined && squashCommit !== `\`${finalSquashCommit}\``) {
    addFinding(
      path,
      `Delivery receipt 的 \`Squash commit\` 为 \`${squashCommit}\``,
      "Delivery receipt 的 `Squash commit` 必须与顶层字段字面相等",
      "统一最终 SHA 字面值后重试",
    );
  }
  if (squashCommit !== undefined && !/^`[0-9a-f]{40}`$/.test(squashCommit)) {
    addFinding(
      path,
      `Delivery receipt 的 \`Squash commit\` 为 \`${squashCommit}\``,
      "Delivery receipt 的 `Squash commit` 必须是完整 SHA",
      "修正 SHA 字面值后重试",
    );
  }
  const trackerMetadata = readUniqueBulletField(section, "Tracker metadata");
  if (trackerMetadata !== undefined && trackerMetadata !== "planned" && !/^`[0-9a-f]{40}`$/.test(trackerMetadata)) {
    addFinding(
      path,
      `Delivery receipt 的 \`Tracker metadata\` 为 \`${trackerMetadata}\``,
      "Delivery receipt 的 `Tracker metadata` 必须是 `planned` 或完整 SHA",
      "修正 tracker metadata 计划后重试",
    );
  }
  const finalChecks = readUniqueBulletField(section, "Final checks");
  if (finalChecks !== undefined) {
    const finalChecksMatch = /^- Final checks:.*$/m.exec(section);
    const localBranchMatch = /^- Local feature branch:.*$/m.exec(section);
    const checkLines = finalChecksMatch && localBranchMatch
      ? section
          .slice(finalChecksMatch.index + finalChecksMatch[0].length, localBranchMatch.index)
          .split("\n")
          .filter(line => line.trim().length > 0)
      : [];
    if (finalChecks !== "" || checkLines.length === 0 || checkLines.some(line => !/^ {2}- `[^`]+` — passed(?:[，。；;,.：:\s].*)?$/.test(line))) {
      addFinding(
        path,
        `Delivery receipt 的 Final checks 包含 ${checkLines.length} 个命令子项`,
        "Delivery receipt 的 `Final checks` 必须包含规范 passed 命令子列表",
        "清空父项值并修正命令子列表后重试",
      );
    }
  }
  const localFeatureBranch = readUniqueBulletField(section, "Local feature branch");
  if (localFeatureBranch !== undefined && localFeatureBranch !== "deleted") {
    addFinding(
      path,
      `Delivery receipt 的 \`Local feature branch\` 为 \`${localFeatureBranch}\``,
      "Delivery receipt 的 `Local feature branch` 必须是 `deleted`",
      "修正当前文档状态后重试",
    );
  }
}

function checkTicketFinalSquash(path: string, ticket: string, ledgerHeader: string): void {
  const stage = readUniqueField(ledgerHeader, "Stage");
  const finalSquashCommit = readUniqueField(ledgerHeader, "Final-Squash-Commit");
  const status = readUniqueTicketField(extractTicketHeader(ticket), "Status");
  const latestResolution = extractLevelTwoSections(ticket)
    .filter(section => section.heading.startsWith("Resolution"))
    .at(-1);
  const ticketFinal = latestResolution ? readUniqueResolutionField(latestResolution.body, "Final squash commit") : undefined;
  if (stage === "delivered") {
    if (status !== "resolved" || !finalSquashCommit || !shaPattern.test(finalSquashCommit) || ticketFinal !== `\`${finalSquashCommit}\``) {
      addFinding(
        path,
        `delivered ticket 的状态为 \`${status}\`，final SHA 为 \`${ticketFinal}\``,
        "delivered 状态的 final SHA 必须完整且字面一致",
        "解决 ticket 并把最新 Resolution 回填为 ledger 最终 SHA 后重试",
      );
    }
  }
  else if (ticketFinal !== undefined && ticketFinal !== "`pending`") {
    addFinding(
      path,
      `非 delivered ticket 的 Final squash commit 为 \`${ticketFinal}\``,
      "非 delivered 状态的 ticket `Final squash commit` 必须是 `pending`",
      "恢复 `pending` 后重试",
    );
  }
}

function readUniqueField(text: string, field: string): string | undefined {
  const matches = [...text.matchAll(new RegExp(`^${field}:(.*)$`, "gm"))];
  if (matches.length !== 1)
    return undefined;
  return matches[0][1].trim();
}

function extractLedgerHeader(text: string): string {
  const firstHeading = /^## /m.exec(text);
  return firstHeading ? text.slice(0, firstHeading.index) : text;
}

function extractSection(text: string, heading: string): string | undefined {
  const startMatch = new RegExp(`^## ${escapeRegExp(heading)}$`, "m").exec(text);
  if (!startMatch?.index)
    return undefined;
  const contentStart = startMatch.index + startMatch[0].length;
  const remaining = text.slice(contentStart);
  const nextHeading = /^## /m.exec(remaining);
  return nextHeading?.index === undefined ? remaining : remaining.slice(0, nextHeading.index);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addFinding(location: string, observed: string, expected: string, nextAction: string): void {
  findings.push(`${location}：观测值：${observed}；预期：${expected}；下一步：${nextAction}。`);
}
