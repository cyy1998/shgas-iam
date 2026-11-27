export function preparePostgresTemplate(options: {
  databaseUrl: string;
  root: string;
  logFile?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  templateName?: string;
}): Promise<string>;
