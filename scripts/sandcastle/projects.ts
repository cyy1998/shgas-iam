import { connectGitHubProject as connect } from "./core/projects.ts";
import { githubRepo } from "./github.ts";

export type { ReportProjectStage } from "./core/projects.ts";

export function connectGitHubProject(
  config: { url: string; token?: string; cwd: string },
  runGh?: (args: string[]) => Promise<string>,
) {
  return connect({ ...config, repo: githubRepo }, runGh);
}
