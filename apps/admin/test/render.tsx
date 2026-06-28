import {
  render as testingLibraryRender,
  type RenderOptions,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactElement, ReactNode } from 'react';

function Providers({ children }: { children: ReactNode }) {
  return <ConfigProvider locale={zhCN}>{children}</ConfigProvider>;
}

export function render(ui: ReactElement, options?: RenderOptions) {
  return {
    user: userEvent.setup(),
    ...testingLibraryRender(ui, {
      wrapper: Providers,
      ...options,
    }),
  };
}

export * from '@testing-library/react';
export { userEvent };
