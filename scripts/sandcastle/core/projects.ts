import { command } from "./command.ts";
import { type ProjectConfig, type ProjectStage, projectStages, validateRepository } from "./config.ts";
import type { RunGh } from "./github.ts";

export type ReportProjectStage = (issue: number, stage: ProjectStage, strict?: boolean) => Promise<void>;

type Project = {
  id: string;
  closed: boolean;
  viewerCanUpdate: boolean;
  field: { id?: string; options?: { id: string; name: string }[] } | null;
};

export async function connectGitHubProject(
  config: ProjectConfig & { cwd: string; repo: string },
  runGh: RunGh = (args: string[]) => {
    const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: "1" };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    if (config.token) env.GH_TOKEN = config.token;
    return command("gh", args, config.cwd, env, 10_000);
  },
): Promise<ReportProjectStage> {
  const fieldName = config.fieldName ?? "Status";
  const stageMap = config.stageMap ?? Object.fromEntries(projectStages.map((stage) => [stage, stage]));
  const mappings = projectStages.flatMap((stage) => {
    const column = stageMap[stage];
    return column ? [{ stage, column }] : [];
  });
  if (!mappings.length) return async () => {};
  const githubRepo = validateRepository(config.repo);
  const url = URL.parse(config.url);
  const match = url?.pathname.match(/^\/(users|orgs)\/([\w-]+)\/projects\/([1-9]\d*)(?:\/views\/\d+)?\/?$/);
  if (url?.origin !== "https://github.com" || url.username || url.password || !match) {
    throw new Error("Expected a GitHub user or organization Projects URL.");
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
    if (!result?.data || result.errors?.length) throw new Error("GitHub Projects returned invalid data.");
    return result.data;
  }

  const { owner: projectOwner } = await graphql<{ owner: { projectV2: Project | null } | null }>(
    `query($owner: String!, $number: Int!, $fieldName: String!) {
      owner: ${ownerField}(login: $owner) {
        projectV2(number: $number) {
          id
          closed
          viewerCanUpdate
          field(name: $fieldName) {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`,
    ["-f", `owner=${owner}`, "-F", `number=${number}`, "-f", `fieldName=${fieldName}`],
  );
  const project = projectOwner?.projectV2;
  if (!project?.id || project.closed || !project.viewerCanUpdate) {
    throw new Error("The GitHub Project is closed or cannot be updated with the configured credentials.");
  }
  const projectId = project.id;
  const field = project.field;
  if (!field?.id || !Array.isArray(field.options)) {
    throw new Error(`The GitHub Project needs a single-select field named ${fieldName}.`);
  }
  const fieldId = field.id;
  const optionIds = new Map(field.options.map(({ name, id }) => [name, id]));
  const stageOptions = new Map<ProjectStage, string>();
  for (const { stage, column } of mappings) {
    const option = optionIds.get(column);
    if (!option) throw new Error(`${fieldName} has no project option "${column}".`);
    stageOptions.set(stage, option);
  }

  const items = new Map<number, string>();
  const reported = new Map<number, ProjectStage>();
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
    if (!contentId) throw new Error(`Could not read ${githubRepo} issue #${issue}.`);
    const { addProjectV2ItemById } = await graphql<{
      addProjectV2ItemById: { item: { id: string; isArchived: boolean } | null } | null;
    }>(
      `mutation($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id isArchived } }
      }`,
      ["-f", `project=${projectId}`, "-f", `content=${contentId}`],
    );
    const item = addProjectV2ItemById?.item;
    if (!item?.id) throw new Error(`The project did not return an item for issue #${issue}.`);
    if (item.isArchived) throw new Error(`The project item for issue #${issue} is archived.`);
    items.set(issue, item.id);
    return item.id;
  }

  return async (issue, stage, strict) => {
    const option = stageOptions.get(stage);
    if (!option || reported.get(issue) === stage) return;
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
        ["-f", `project=${projectId}`, "-f", `item=${item}`, "-f", `field=${fieldId}`, "-f", `option=${option}`],
      );
      if (updateProjectV2ItemFieldValue?.projectV2Item?.id !== item)
        throw new Error("The project did not confirm the field update.");
      reported.set(issue, stage);
    } catch (error) {
      items.delete(issue);
      reported.delete(issue);
      if (strict) throw error;
      console.warn(
        `Could not update GitHub Projects for #${issue} to ${stage}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
