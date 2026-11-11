import { ReloadOutlined } from "@ant-design/icons";
import { ApiErrorCode, type ImageCaptchaChallenge } from "@iam/contracts";
import { fetchImageCaptcha, verifyImageCaptcha } from "@sso/services/image-captcha";
import { ServiceError } from "@sso/utils/request";
import { Button, Input, type InputRef, Space, Spin } from "antd";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import "./ImageCaptchaField.less";

type Props = {
  ticket: string;
  signal?: AbortSignal;
  isCancelled: () => boolean;
  onCancel: () => void;
  onVerified: (proof: string) => void;
};

function errorMessage(error: unknown) {
  if (error instanceof ServiceError) {
    if (error.retryAfterSeconds) return `请等待 ${error.retryAfterSeconds} 秒后重试`;
    return error.message;
  }
  return "暂时无法连接安全校验服务，请重试";
}

export default function ImageCaptchaField({ ticket, signal, isCancelled, onCancel, onVerified }: Props) {
  const answerId = useId();
  const statusId = `${answerId}-status`;
  const answerInput = useRef<InputRef>(null);
  const [challenge, setChallenge] = useState<ImageCaptchaChallenge>();
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(true);
  const [ticketExpired, setTicketExpired] = useState(false);

  const loadImage = useCallback(async () => {
    setBusy(true);
    setStatus("");
    try {
      const image = await fetchImageCaptcha(ticket, signal);
      if (isCancelled()) return;
      setChallenge(image);
      setAnswer("");
    } catch (error) {
      if (isCancelled()) return;
      if (error instanceof ServiceError && error.code === ApiErrorCode.ImageCaptchaTicketExpired) {
        setTicketExpired(true);
      }
      setStatus(errorMessage(error));
    } finally {
      if (!isCancelled()) setBusy(false);
    }
  }, [isCancelled, signal, ticket]);

  useEffect(() => {
    void loadImage();
  }, [loadImage]);

  useEffect(() => {
    if (challenge && !busy && !ticketExpired) answerInput.current?.focus();
  }, [busy, challenge, ticketExpired]);

  async function submit() {
    if (!challenge || !answer.trim() || busy || ticketExpired) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await verifyImageCaptcha(ticket, challenge.challengeId, answer, signal);
      if (isCancelled()) return;
      if (result.result === "verified") {
        onVerified(result.proof);
      } else {
        if (result.result === "expired") setChallenge(undefined);
        setStatus(result.result === "expired" ? "图片已失效，请换一张" : "验证码不正确，请重新输入");
        setAnswer("");
      }
    } catch (error) {
      if (isCancelled()) return;
      if (error instanceof ServiceError && error.code === ApiErrorCode.ImageCaptchaTicketExpired) {
        setTicketExpired(true);
      }
      setStatus(errorMessage(error));
    } finally {
      if (!isCancelled()) setBusy(false);
    }
  }

  return (
    <fieldset className="image-captcha" aria-label="图片验证码">
      <div className="image-captcha-heading">
        <label htmlFor={answerId}>图片验证码</label>
        <div className="image-captcha-actions">
          <Button
            size="small"
            htmlType="button"
            type="link"
            icon={<ReloadOutlined />}
            disabled={busy || ticketExpired}
            onClick={() => void loadImage()}
          >
            {challenge ? "换一张" : "获取图片"}
          </Button>
          <Button size="small" htmlType="button" type="text" aria-label="取消验证" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
      <div className="image-captcha-row">
        <div className="image-captcha-image">
          {challenge ? (
            <img
              src={`data:image/png;base64,${challenge.imageBase64}`}
              width={234}
              height={58}
              alt="图片验证码"
              onError={() => {
                setChallenge(undefined);
                setStatus("图片加载失败，请换一张");
              }}
            />
          ) : (
            busy && <Spin size="small" aria-label="正在加载图片" />
          )}
        </div>
        <Space.Compact className="image-captcha-answer">
          <Input
            ref={answerInput}
            id={answerId}
            size="large"
            autoComplete="off"
            placeholder="输入字符"
            maxLength={16}
            aria-describedby={status ? statusId : undefined}
            disabled={!challenge || busy || ticketExpired}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onPressEnter={(event) => {
              event.preventDefault();
              void submit();
            }}
          />
          <Button
            className="image-captcha-verify"
            size="large"
            type="primary"
            htmlType="button"
            disabled={!challenge || !answer.trim() || busy || ticketExpired}
            onClick={() => void submit()}
          >
            验证
          </Button>
        </Space.Compact>
      </div>
      {status && (
        <div className="image-captcha-status" id={statusId} role="status">
          {status}
        </div>
      )}
    </fieldset>
  );
}
