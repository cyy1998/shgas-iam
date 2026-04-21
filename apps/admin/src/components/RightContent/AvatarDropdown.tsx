import { LogoutOutlined } from '@ant-design/icons';
import { Dropdown } from 'antd';
import type { ReactElement } from 'react';
import { logout } from '@/utils/auth';

export default function AvatarDropdown({ children }: { children: ReactElement }) {
  return (
    <Dropdown
      menu={{
        items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }],
        onClick: ({ key }) => {
          if (key === 'logout') logout();
        },
      }}
    >
      {children}
    </Dropdown>
  );
}
