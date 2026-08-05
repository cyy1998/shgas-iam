import SystemMaintenancePage from '@sso/pages/system-maintenance';
import { expect, it } from 'vitest';
import { render, screen } from '~sso/test/render';

it('shows concise business system maintenance copy', () => {
  render(<SystemMaintenancePage />);

  expect(
    screen.getByRole('heading', { name: '业务系统维护中' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      '统一身份认证服务正在进行维护，完成后将恢复业务系统访问。',
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/统一身份认证服务运行正常/),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /刷新重试/ })).toBeInTheDocument();
});
