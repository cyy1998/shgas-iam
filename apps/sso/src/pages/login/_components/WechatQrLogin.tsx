import type { WechatQrRequest, WechatQrStatus } from "@iam/contracts";
import { useHumanVerification } from "@sso/hooks/useHumanVerification";
import { useSmsCodeCountdown } from "@sso/hooks/useSmsCodeCountdown";
import { HumanVerificationCancelled } from "@sso/lib/human-verification";
import {
  bindWechatQrPassword,
  bindWechatQrSms,
  completeWechatQr,
  sendWechatQrSms,
  startWechatQr,
  subscribeWechatQr,
  type WechatQrContinuation,
} from "@sso/services/wechat-qr";
import { ServiceError } from "@sso/utils/request";
import { Button, QRCode, Space } from "antd";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { PasswordLoginValues } from "./PasswordLoginForm";
import type { SmsLoginValues } from "./SmsLoginForm";
import { WechatBindingPasswordForm } from "./WechatBindingPasswordForm";
import { WechatBindingSmsForm } from "./WechatBindingSmsForm";

const statusText: Record<WechatQrStatus, string> = {
  waiting: "等待手机确认",
  confirmed: "手机已确认",
  binding_required: "请验证并绑定企业微信",
  consumed: "正在检查登录状态",
  restart: "请重新扫码",
};

export function WechatQrLogin({
  active,
  continuation,
  onContinue,
  submitting,
  beginSubmission,
  endSubmission,
}: {
  active: boolean;
  continuation: WechatQrContinuation;
  onContinue: () => void;
  submitting: boolean;
  beginSubmission: () => boolean;
  endSubmission: () => void;
}) {
  const [request, setRequest] = useState<WechatQrRequest>();
  const [status, setStatus] = useState<WechatQrStatus>();
  const [loading, setLoading] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [completionError, setCompletionError] = useState<string>();
  const [needsNewQr, setNeedsNewQr] = useState(false);
  const [bindingError, setBindingError] = useState<string>();
  const [bindingMethod, setBindingMethod] = useState<"password" | "sms">("password");
  const [sendingSms, setSendingSms] = useState(false);
  const { countdown, isCounting, startCountdown, restoreCountdown } = useSmsCodeCountdown();
  const { verify, captcha, cancel } = useHumanVerification();
  const pending = useRef<AbortController | null>(null);
  const completing = useRef(false);
  const attempted = useRef(false);
  const attemptedCompletion = useRef<string | null>(null);
  const displayed = useRef(false);
  const sending = useRef(false);

  useLayoutEffect(() => {
    displayed.current = active;
    return () => {
      displayed.current = false;
    };
  }, [active]);

  const start = useCallback(async () => {
    if (!displayed.current || pending.current || completing.current || sending.current || !beginSubmission()) return;
    attempted.current = true;
    setLoading(true);
    setStartFailed(false);
    setNeedsNewQr(false);
    setCompletionError(undefined);
    setBindingError(undefined);
    setBindingMethod("password");
    setRequest(undefined);
    setStatus(undefined);
    const abort = new AbortController();
    pending.current = abort;
    try {
      const result = await startWechatQr(continuation, abort.signal);
      if (abort.signal.aborted) return;
      if (result.decision === "continue") {
        onContinue();
        return;
      }
      setRequest(result);
      setStatus("waiting");
    } catch {
      if (!abort.signal.aborted) setStartFailed(true);
    } finally {
      if (pending.current === abort) pending.current = null;
      if (!abort.signal.aborted) setLoading(false);
      endSubmission();
    }
  }, [beginSubmission, continuation, endSubmission, onContinue]);

  const complete = useCallback(async () => {
    if (!displayed.current || pending.current || !request || !beginSubmission()) return;
    completing.current = true;
    attemptedCompletion.current = request.requestId;
    setCompletionError(undefined);
    try {
      let result: Awaited<ReturnType<typeof completeWechatQr>>;
      try {
        result = await completeWechatQr(continuation, request.requestId);
      } catch (error) {
        if (error instanceof ServiceError || !displayed.current) throw error;
        // The request may have taken effect before the connection failed. Retry against current cookies and state.
        result = await completeWechatQr(continuation, request.requestId);
      }
      if (!displayed.current) return;
      if (result.decision === "continue") onContinue();
      if (result.decision === "restart") setNeedsNewQr(true);
    } catch (error) {
      if (displayed.current) {
        setCompletionError(error instanceof ServiceError ? error.message : "暂时无法完成扫码登录，请重试");
      }
    } finally {
      completing.current = false;
      endSubmission();
    }
  }, [beginSubmission, continuation, endSubmission, onContinue, request]);

  async function submitBinding(
    operation: (requestId: string) => Promise<Awaited<ReturnType<typeof bindWechatQrPassword>>>,
  ) {
    if (!displayed.current || !request || sending.current || !beginSubmission()) return;
    setBindingError(undefined);
    try {
      let result: Awaited<ReturnType<typeof bindWechatQrPassword>>;
      try {
        result = await operation(request.requestId);
      } catch (error) {
        if (error instanceof ServiceError || error instanceof HumanVerificationCancelled || !displayed.current)
          throw error;
        // Recover the session with the browser's current cookie and QR state.
        result = await completeWechatQr(continuation, request.requestId);
        if (result.decision === "pending") {
          setBindingError("暂时无法确认绑定结果，请重试");
        }
      }
      if (!displayed.current) return;
      if (result.decision === "continue") {
        attemptedCompletion.current = request.requestId;
        onContinue();
      }
      if (result.decision === "restart") setNeedsNewQr(true);
    } catch (error) {
      if (displayed.current && !(error instanceof HumanVerificationCancelled)) {
        setBindingError(error instanceof ServiceError ? error.message : "暂时无法验证并绑定企业微信，请重试");
      }
    } finally {
      endSubmission();
    }
  }

  function bindPassword(values: PasswordLoginValues) {
    return submitBinding((requestId) =>
      verify("wechatBindingPassword", (capToken, imageCaptchaProof) =>
        bindWechatQrPassword(continuation, requestId, {
          username: values.username.trim(),
          password: values.password,
          capToken,
          imageCaptchaProof,
        }),
      ),
    );
  }

  function bindSms(values: SmsLoginValues) {
    return submitBinding((requestId) =>
      verify("wechatBindingSmsVerify", (capToken, imageCaptchaProof) =>
        bindWechatQrSms(continuation, requestId, {
          phoneNumber: values.phoneNumber,
          code: values.code,
          capToken,
          imageCaptchaProof,
        }),
      ),
    );
  }

  async function sendSms(phoneNumber: string) {
    if (!displayed.current || !request || sending.current || submitting || isCounting) return;
    sending.current = true;
    setSendingSms(true);
    setBindingError(undefined);
    try {
      const result = await verify("wechatBindingSmsSend", (capToken, imageCaptchaProof) =>
        sendWechatQrSms(continuation, request.requestId, { phoneNumber, capToken, imageCaptchaProof }),
      );
      if (result.decision === "sent") startCountdown();
      if (!displayed.current) return;
      if (result.decision === "restart") setNeedsNewQr(true);
    } catch (error) {
      restoreCountdown(error);
      if (displayed.current && !(error instanceof HumanVerificationCancelled)) {
        setBindingError(error instanceof ServiceError ? error.message : "暂时无法确认短信是否已发送，请检查短信");
      }
    } finally {
      sending.current = false;
      setSendingSms(false);
    }
  }

  function clearBindingFeedback() {
    cancel();
    setBindingError(undefined);
  }

  useEffect(() => {
    if (!active || status !== "binding_required") cancel();
  }, [active, cancel, status]);

  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
      attempted.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!active || submitting || attempted.current) return;
    void start();
  }, [active, start, submitting]);
  useEffect(() => {
    if (!request) return;
    let current = true;
    const stop = subscribeWechatQr(continuation, request.requestId, (next) => {
      if (current) setStatus(next);
    });
    return () => {
      current = false;
      stop();
    };
  }, [continuation, request]);
  useEffect(() => {
    if (
      active &&
      request &&
      !submitting &&
      !loading &&
      attemptedCompletion.current !== request.requestId &&
      (status === "confirmed" || status === "consumed")
    ) {
      void complete();
    }
  }, [active, complete, loading, request, status, submitting]);

  if (!active) return null;

  return (
    <Space
      direction="vertical"
      align={status === "binding_required" && !needsNewQr ? undefined : "center"}
      className="wechat-qr-login"
    >
      {request && status === "waiting" && !needsNewQr && (
        <a href={request.mobileUrl} aria-label="企业微信扫码链接" onClick={(event) => event.preventDefault()}>
          <QRCode value={request.mobileUrl} type="svg" />
        </a>
      )}
      <p role="status">
        {loading
          ? "正在生成二维码"
          : submitting
            ? "正在完成扫码登录"
            : startFailed
              ? "无法生成二维码，请重试"
              : needsNewQr
                ? statusText.restart
                : completionError || (status && statusText[status])}
      </p>
      {request && status === "binding_required" && !needsNewQr && (
        <div key={request.requestId}>
          <p>验证您的 IAM 账号后，将绑定企业微信并继续登录。</p>
          <Button
            type="link"
            disabled={submitting || sendingSms}
            onClick={() => {
              clearBindingFeedback();
              setBindingMethod(bindingMethod === "password" ? "sms" : "password");
            }}
          >
            {bindingMethod === "password" ? "使用短信验证" : "使用密码验证"}
          </Button>
          {bindingMethod === "password" ? (
            <WechatBindingPasswordForm
              submitting={submitting}
              captcha={captcha}
              error={bindingError}
              onChange={clearBindingFeedback}
              onSubmit={bindPassword}
            />
          ) : (
            <WechatBindingSmsForm
              countdown={countdown}
              sending={sendingSms}
              submitting={submitting}
              captcha={captcha}
              error={bindingError}
              onChange={clearBindingFeedback}
              onSend={sendSms}
              onSubmit={bindSms}
            />
          )}
        </div>
      )}
      {completionError && (
        <Button disabled={loading || submitting} onClick={() => void complete()}>
          重试登录
        </Button>
      )}
      <Button disabled={loading || submitting || sendingSms} onClick={() => void start()}>
        重新生成二维码
      </Button>
    </Space>
  );
}
