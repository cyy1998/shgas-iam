// Docker discovers CLI plugins and the caller-provided daemon through these settings.
// Application, proxy, and Compose interpolation variables remain outside the child environment.
export function dockerCliEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { COMPOSE_DISABLE_ENV_FILE: "1" };
  for (const key of [
    "HOME",
    "USERPROFILE",
    "ProgramFiles",
    "ProgramData",
    "DOCKER_CONFIG",
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ]) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}
