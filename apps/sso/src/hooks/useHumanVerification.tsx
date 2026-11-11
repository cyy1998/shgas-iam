import ImageCaptchaField from "@sso/components/ImageCaptchaField";
import { HumanVerificationCancelled, withHumanVerification } from "@sso/lib/human-verification";
import type { HumanVerificationAction } from "@sso/types/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

function createLifetime() {
  const controller = typeof AbortController === "function" ? new AbortController() : undefined;
  let cancelled = false;
  return {
    signal: controller?.signal,
    isCancelled: () => cancelled,
    cancel() {
      cancelled = true;
      controller?.abort();
    },
  };
}

type Attempt = {
  routeKey: string;
  lifetime: ReturnType<typeof createLifetime>;
  resolveCaptcha?: (proof?: string) => void;
};

export function useHumanVerification() {
  const { key } = useLocation();
  const active = useRef<Attempt>(null);
  const [prompt, setPrompt] = useState<{ ticket: string; attempt: Attempt }>();

  const cancel = useCallback(() => {
    const attempt = active.current;
    if (!attempt) return;
    attempt.lifetime.cancel();
    attempt.resolveCaptcha?.();
    setPrompt(undefined);
  }, []);

  useEffect(
    () => () => {
      if (active.current?.routeKey === key) cancel();
    },
    [key, cancel],
  );

  async function verify<T>(
    action: HumanVerificationAction,
    operation: (capToken?: string, imageCaptchaProof?: string) => Promise<T>,
  ) {
    if (active.current) throw new HumanVerificationCancelled();
    const lifetime = createLifetime();
    const attempt: Attempt = { routeKey: key, lifetime };
    active.current = attempt;

    try {
      return await withHumanVerification(action, operation, {
        signal: lifetime.signal,
        isCancelled: lifetime.isCancelled,
        promptImageCaptcha(ticket) {
          if (lifetime.isCancelled()) return Promise.resolve(undefined);
          return new Promise<string | undefined>((resolve) => {
            attempt.resolveCaptcha = resolve;
            setPrompt({ ticket, attempt });
          });
        },
      });
    } finally {
      active.current = null;
      setPrompt(undefined);
    }
  }

  const captcha = prompt?.attempt.routeKey === key && (
    <ImageCaptchaField
      key={prompt.ticket}
      ticket={prompt.ticket}
      signal={prompt.attempt.lifetime.signal}
      isCancelled={prompt.attempt.lifetime.isCancelled}
      onCancel={cancel}
      onVerified={(proof) => {
        setPrompt(undefined);
        prompt.attempt.resolveCaptcha?.(proof);
      }}
    />
  );

  return { verify, captcha, cancel };
}
