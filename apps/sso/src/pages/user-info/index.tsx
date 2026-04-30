import { selfMobileSendMsg } from '@/services/open';
import { mobileSet, passwordChange } from '@/services/public';
import {
  confirmPasswordRule,
  passwordRule,
  phoneRule,
} from '@/utils/form-check';
import { ServiceError } from '@/utils/request';
import { decodeRedirect, getQuery } from '@/utils/url';
import { history, useModel } from '@umijs/max';
import {
  Button,
  Card,
  Form,
  Input,
  Spin,
  Table,
  Tabs,
  message,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import TopBar from './_components/TopBar';
import './index.less';

type TabKey = 'password' | 'mobile';

export default function UserInfoPage() {
  const { userInfo, loadUserInfo } = useModel('sso');
  const [activeKey, setActiveKey] = useState<TabKey>('password');
  const [submitting, setSubmitting] = useState(false);
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
      await selfMobileSendMsg({ phoneNumber, usage: 'bindPhone' });
      startCountdown();
    } catch (e) {
      if (!(e instanceof ServiceError)) throw e;
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
      <div className="user-info-body">
        <Button type="link" className="back-btn" onClick={back}>
          返回
        </Button>
        <Card title="个人信息">
          <Spin spinning={!userInfo}>
            <div className="section-title">岗位信息</div>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={userInfo?.employments ?? []}
              columns={[
                { title: '公司', dataIndex: 'compName' },
                { title: '部门', dataIndex: 'orgName' },
                { title: '岗位', dataIndex: 'posName' },
              ]}
            />

            <Tabs
              type="card"
              style={{ marginTop: 24 }}
              activeKey={activeKey}
              onChange={(k) => setActiveKey(k as TabKey)}
              items={[
                { key: 'password', label: '更改密码' },
                { key: 'mobile', label: '绑定手机号' },
              ]}
            />

            {activeKey === 'password' && (
              <Form form={pwdForm} layout="vertical" requiredMark={false}>
                <Form.Item
                  label="密码"
                  name="oldPassword"
                  rules={[{ required: true, message: '请输入密码' }]}
                >
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  label="新密码"
                  name="newPassword"
                  rules={[passwordRule]}
                >
                  <Input.Password />
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
                  <Input.Password />
                </Form.Item>
              </Form>
            )}

            {activeKey === 'mobile' && (
              <Form form={mobileForm} layout="vertical" requiredMark={false}>
                <Form.Item label="当前手机号">
                  {userInfo?.mobile || '-'}
                </Form.Item>
                <Form.Item
                  label="手机号"
                  name="phoneNumber"
                  rules={[phoneRule]}
                >
                  <Input />
                </Form.Item>
                <Form.Item
                  label="验证码"
                  name="code"
                  rules={[{ required: true, message: '请输入验证码' }]}
                >
                  <Input
                    placeholder="请输入验证码"
                    addonAfter={
                      <Button
                        type="link"
                        disabled={countdown > 0}
                        onClick={sendCode}
                      >
                        {countdown <= 0 ? '获取验证码' : `${countdown} s`}
                      </Button>
                    }
                  />
                </Form.Item>
              </Form>
            )}

            <div className="submit-row">
              <Button
                type="primary"
                loading={submitting}
                onClick={handleSubmit}
              >
                提交
              </Button>
            </div>
          </Spin>
        </Card>
      </div>
    </div>
  );
}
