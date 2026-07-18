import { Button, Input, Space } from 'antd';
import type { InputProps } from 'antd';
import type { ReactNode } from 'react';
import './VerificationCodeInput.less';

type VerificationCodeInputProps = Pick<
  InputProps,
  | 'autoComplete'
  | 'disabled'
  | 'id'
  | 'name'
  | 'onBlur'
  | 'onChange'
  | 'placeholder'
  | 'prefix'
  | 'status'
  | 'value'
> & {
  buttonDisabled?: boolean;
  buttonText: ReactNode;
  onSendCode: () => void;
};

export function VerificationCodeInput({
  buttonDisabled = false,
  buttonText,
  onSendCode,
  ...inputProps
}: VerificationCodeInputProps) {
  return (
    <Space.Compact block className="verification-code-input">
      <Input {...inputProps} size="large" />
      <Button
        className="verification-code-button"
        size="large"
        htmlType="button"
        disabled={buttonDisabled}
        onClick={onSendCode}
      >
        {buttonText}
      </Button>
    </Space.Compact>
  );
}
