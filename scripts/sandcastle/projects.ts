import { command } from "./commands.ts";
import { githubRepo } from "./github.ts";

const fieldName = "Status";
const stages = ["Implementing", "Integrated", "Reviewing", "PR Open", "Needs Attention", "Done"] as const;
type Stage = (typeof stages)[number];
export type ReportProjectStage = (issue: number, stage: Stage) => Promise<void>;

type Project = {
  id: string;
  closed: boolean;
  viewerCanUpdate: boolean;
  field: { id?: string; options?: { id: string; name: string }[] } | null;
};

export async function connectGitHubProject(
  config: { url: string; token?: string; cwd: string },
  runGh = (args: string[]) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1" };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    if (config.token) env.GH_TOKEN = config.token;
    return command("gh", args, config.cwd, 10_000, env);
  },
): Promise<ReportProjectStage> {
  const url = URL.parse(config.url);
  const match = url?.pathname.match(/^\/(users|orgs)\/([\w-]+)\/projects\/([1-9]\d*)(?:\/views\/\d+)?\/?$/);
  if (url?.origin !== "https://github.com" || url.username || url.password || !match) {
    throw new Error("SANDCASTLE_PROJECT_URL 必须是 GitHub 个人或组织 Projects 看板链接。");
  }
  const [, ownerType, owner, number] = match;
  const ownerField = ownerType === "users" ? "user" : "organization";

  async function graphql<T>(query: string, variables: string[]): Promise<T> {
    const result = JSON.parse(
      await runGh(["api", "graphql", "--hostname", "github.com", "-f", `query=${query}`, ...variables]),
    ) as {
      data?: T;
      errors?: unknown[];
    };
    if (!result?.data || result.errors?.length) throw new Error("GitHub Projects API 未返回有效数据。");
    return result.data;
  }

  const { owner: projectOwner } = await graphql<{ owner: { projectV2: Project | null } | null }>(
    `query($owner: String!, $number: Int!) {
      owner: ${ownerField}(login: $owner) {
        projectV2(number: $number) {
          id
          closed
          viewerCanUpdate
          field(name: "${fieldName}") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`,
    ["-f", `owner=${owner}`, "-F", `number=${number}`],
  );
  const project = projectOwner?.projectV2;
  if (!project?.id || project.closed || !project.viewerCanUpdate) {
    throw new Error("GitHub Project 不可写，请核对看板是否开放及令牌权限。");
  }
  const projectId = project.id;
  const field = project.field;
  if (!field?.id || !Array.isArray(field.options)) {
    throw new Error(`请在 GitHub Project 创建单选字段 ${fieldName}。`);
  }
  const fieldId = field.id;
  const optionIds = new Map(field.options.map(({ name, id }) => [name, id]));
  const missing = stages.filter((stage) => !optionIds.get(stage));
  if (missing.length) throw new Error(`${fieldName} 缺少选项 ${missing.join("、")}。`);

  const items = new Map<number, string>();
  const reported = new Map<number, Stage>();
  const [repoOwner, repoName] = githubRepo.split("/");

  async function projectItem(issue: number): Promise<string> {
    const existing = items.get(issue);
    if (existing) return existing;
    const { repository } = await graphql<{ repository: { issue: { id: string } | null } | null }>(
      `query($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) { issue(number: $number) { id } }
      }`,
      ["-f", `owner=${repoOwner}`, "-f", `name=${repoName}`, "-F", `number=${issue}`],
    );
    const contentId = repository?.issue?.id;
    if (!contentId) throw new Error(`无法读取 ${githubRepo} 的 issue #${issue}。`);
    const { addProjectV2ItemById } = await graphql<{
      addProjectV2ItemById: { item: { id: string; isArchived: boolean } | null } | null;
    }>(
      `mutation($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id isArchived } }
      }`,
      ["-f", `project=${projectId}`, "-f", `content=${contentId}`],
    );
    const item = addProjectV2ItemById?.item;
    if (!item?.id) throw new Error(`看板未返回 issue #${issue} 的条目。`);
    if (item.isArchived) throw new Error(`issue #${issue} 的看板条目已归档，需要在看板恢复。`);
    items.set(issue, item.id);
    return item.id;
  }

  return async (issue, stage) => {
    if (reported.get(issue) === stage) return;
    try {
      const item = await projectItem(issue);
      const { updateProjectV2ItemFieldValue } = await graphql<{
        updateProjectV2ItemFieldValue: { projectV2Item: { id: string } | null } | null;
      }>(
        `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $option}
          }) { projectV2Item { id } }
        }`,
        [
          "-f",
          `project=${projectId}`,
          "-f",
          `item=${item}`,
          "-f",
          `field=${fieldId}`,
          "-f",
          `option=${optionIds.get(stage)}`,
        ],
      );
      if (updateProjectV2ItemFieldValue?.projectV2Item?.id !== item) throw new Error("看板未确认阶段更新。");
      reported.set(issue, stage);
    } catch (error) {
      items.delete(issue);
      reported.delete(issue);
      console.warn(
        `Sandcastle 看板同步失败，#${issue} → ${stage}。${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
