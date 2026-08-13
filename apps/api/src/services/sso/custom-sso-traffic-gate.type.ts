export interface CustomSsoTrafficGate {
  assertIssuanceAllowed: (clientCode: string) => Promise<void>;
  assertSessionUseAllowed: (clientCode: string) => Promise<void>;
}
