export declare const TEST_POSTGRES_URL_ENV: "IAM_TEST_POSTGRES_URL";

export declare function requireDedicatedPostgresTestUrl(input: {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly forbidden?: ReadonlyArray<{
    readonly name: string;
    readonly value: string | undefined;
  }>;
  readonly name?: string;
  readonly value: string;
}): string;
