export interface AuthenticationLoginRestrictionStatus {
  triggerMethod: "mobile" | "password" | "unknown";
  remainingSeconds: number;
}

export interface AuthenticationLoginFailureStatus {
  failureCount: number;
  remainingAttempts: number;
  restriction: AuthenticationLoginRestrictionStatus | null;
}
