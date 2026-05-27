import {
  ArrowLeftOutlined,
  BankOutlined,
  IdcardOutlined,
  LockOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { withHumanVerification } from '@sso/lib/human-verification';
import { selfMobileSendMsg } from '@sso/services/open';
import { mobileSet, passwordChange } from '@sso/services/public';
import {
  confirmPasswordRule,
  passwordRule,
  phoneRule,
} from '@sso/utils/form-check';
import { ServiceError } from '@sso/utils/request';
import { decodeRedirect, getQuery } from '@sso/utils/url';
import { history, useModel } from '@umijs/max';
import { Button, Form, Input, Spin, Table, Tabs, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import TopBar from './_components/TopBar';
import './index.less';

type TabKey = 'password' | 'mobile';

export default function UserInfoPage() {
  const { userInfo, loadUserInfo } = useModel('sso');
  const [activeKey, setActiveKey] = useState<TabKey>('password');
  const [submitting, setSubmitting] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pwdForm] = Form.useForm();
  const [mobileForm] = Form.useForm();

  useEffect(() => {
    if (!userInfo) void loadUserInfo();
  }, [userInfo, loadUserInfo]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((v) => {
        if (v <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    const phoneNumber = mobileForm.getFieldValue('phoneNumber');
    if (!phoneNumber) {
      message.error('请填写手机号');
      return;
    }
    if (countdown > 0) return;
    try {
      setSmsSending(true);
      const body = { phoneNumber, usage: 'bindPhone' } as const;
      await withHumanVerification(
        'sendSmsCode',
        () => selfMobileSendMsg(body),
        (capToken) => selfMobileSendMsg({ ...body, capToken }),
      );
      startCountdown();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSmsSending(false);
    }
  };

  const submitPassword = async () => {
    const v = await pwdForm.validateFields();
    setSubmitting(true);
    try {
      await passwordChange({
        oldPassword: v.oldPassword,
        newPassword: v.newPassword,
      });
      message.success('更换成功！');
      pwdForm.resetFields();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const submitMobile = async () => {
    const v = await mobileForm.validateFields();
    setSubmitting(true);
    try {
      await mobileSet({ phoneNumber: v.phoneNumber, code: v.code });
      message.success('更换成功！');
      mobileForm.resetFields();
      void loadUserInfo();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (activeKey === 'password') return submitPassword();
    return submitMobile();
  };

  const back = () => {
    const redirectUrl = decodeRedirect(getQuery('redirectUrl'));
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      history.back();
    }
  };

  return (
    <div className="user-info-page">
      <TopBar />
      <main className="user-info-body">
        <section className="profile-hero">
          <Button
            type="text"
            className="back-btn"
            icon={<ArrowLeftOutlined />}
            onClick={back}
          >
            返回
          </Button>
          <div className="hero-content">
            <div>
              <div className="hero-kicker">Account Center</div>
              <h1>个人信息与账户安全</h1>
              <p>查看组织岗位信息，维护登录密码与绑定手机号。</p>
            </div>
            <div className="hero-badge">
              <SafetyCertificateOutlined />
              <span>受保护的组织账号</span>
            </div>
          </div>
        </section>

        <Spin spinning={!userInfo}>
          <div className="info-grid">
            <aside className="profile-panel">
              <div className="avatar-ring">
                {userInfo?.name?.[0] ?? <UserOutlined />}
              </div>
              <div className="profile-name">{userInfo?.name ?? '-'}</div>
              <div className="profile-username">
                {userInfo?.username ?? '-'}
              </div>

              <div className="profile-meta">
                <div className="meta-item">
                  <MobileOutlined />
                  <div>
                    <span>绑定手机号</span>
                    <strong>{userInfo?.mobile || '未绑定'}</strong>
                  </div>
                </div>
                <div className="meta-item">
                  <IdcardOutlined />
                  <div>
                    <span>岗位数量</span>
                    <strong>{userInfo?.employments?.length ?? 0}</strong>
                  </div>
                </div>
              </div>
            </aside>

            <section className="workspace-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">
                    <BankOutlined />
                    岗位信息
                  </div>
                  <h2>组织任职</h2>
                </div>
              </div>

              <Table
                rowKey="id"
                size="middle"
                pagination={false}
                dataSource={userInfo?.employments ?? []}
                columns={[
                  {
                    title: '公司',
                    dataIndex: 'compName',
                    render: (value: string | null) => value ?? '—',
                  },
                  {
                    title: '组织',
                    dataIndex: 'orgName',
                    render: (_value, row) =>
                      row.organization?.fullOrgPath
                        ?.map(node => node.orgName)
                        .join(' / ') || row.orgName,
                  },
                  { title: '岗位', dataIndex: 'posName' },
                ]}
              />

              <div className="security-panel">
                <div className="panel-heading">
                  <div>
                    <div className="section-kicker">
                      <LockOutlined />
                      账户安全
                    </div>
                    <h2>安全设置</h2>
                  </div>
                </div>

                <Tabs
                  activeKey={activeKey}
                  onChange={(k) => setActiveKey(k as TabKey)}
                  items={[
                    {
                      key: 'password',
                      label: (
                        <span className="tab-label">
                          <LockOutlined />
                          更改密码
                        </span>
                      ),
                    },
                    {
                      key: 'mobile',
                      label: (
                        <span className="tab-label">
                          <MobileOutlined />
                          绑定手机号
                        </span>
                      ),
                    },
                  ]}
                />

                {activeKey === 'password' && (
                  <Form form={pwdForm} layout="vertical" requiredMark={false}>
                    <Form.Item
                      label="当前密码"
                      name="oldPassword"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password
                        size="large"
                        placeholder="请输入当前密码"
                        prefix={<LockOutlined />}
                      />
                    </Form.Item>
                    <Form.Item
                      label="新密码"
                      name="newPassword"
                      rules={[passwordRule]}
                    >
                      <Input.Password
                        size="large"
                        placeholder="请输入新密码"
                        prefix={<LockOutlined />}
                      />
                    </Form.Item>
                    <Form.Item
                      label="确认密码"
                      name="newCopyPassword"
                      dependencies={['newPassword']}
                      rules={[
                        confirmPasswordRule(() =>
                          pwdForm.getFieldValue('newPassword'),
                        ),
                      ]}
                    >
                      <Input.Password
                        size="large"
                        placeholder="请再次输入新密码"
                        prefix={<LockOutlined />}
                      />
                    </Form.Item>
                  </Form>
                )}

                {activeKey === 'mobile' && (
                  <Form
                    form={mobileForm}
                    layout="vertical"
                    requiredMark={false}
                  >
                    <div className="current-mobile">
                      <span>当前手机号</span>
                      <strong>{userInfo?.mobile || '-'}</strong>
                    </div>
                    <Form.Item
                      label="新手机号"
                      name="phoneNumber"
                      rules={[phoneRule]}
                    >
                      <Input
                        size="large"
                        placeholder="请输入手机号"
                        prefix={<MobileOutlined />}
                      />
                    </Form.Item>
                    <Form.Item
                      label="验证码"
                      name="code"
                      rules={[{ required: true, message: '请输入验证码' }]}
                    >
                      <Input
                        size="large"
                        placeholder="请输入验证码"
                        prefix={<LockOutlined />}
                        addonAfter={
                          <button
                            className="profile-code-btn"
                            type="button"
                            disabled={countdown > 0 || smsSending}
                            onClick={sendCode}
                          >
                            {smsSending
                              ? '校验中'
                              : countdown <= 0
                                ? '获取验证码'
                                : `${countdown} s`}
                          </button>
                        }
                      />
                    </Form.Item>
                  </Form>
                )}

                <div className="submit-row">
                  <Button
                    type="primary"
                    size="large"
                    loading={submitting}
                    onClick={handleSubmit}
                  >
                    保存设置
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </Spin>
      </main>
    </div>
  );
}
