import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import {
  type ClientAdmissionDetail,
  type ClientAdmissionPolicy,
  type ClientAdmissionPreview,
  classifyAdmissionFailure,
  clientAdmissionService,
} from "@admin/services/client-admission";
import { searchUsers } from "@admin/services/user";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Alert, Button, Card, message, Select, Space, Typography } from "antd";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ClientAdmissionConditionEditor } from "./ClientAdmissionConditionEditor";
import styles from "./ClientAdmissionSettings.module.less";
import { type ConditionDraft, fieldDraft, readDraft, writeFilter } from "./client-admission-draft";
import { userScope } from "./client-admission-fields";
import { useClientSnapshotRepairNotice } from "./useClientSnapshotRepairNotice";

const previewPresentation = {
  match: { label: "匹配", icon: CheckCircleOutlined },
  "no-match": { label: "不匹配", icon: CloseCircleOutlined },
  unavailable: { label: "暂时无法判断", icon: InfoCircleOutlined },
} satisfies Record<ClientAdmissionPreview, { label: string; icon: typeof CheckCircleOutlined }>;

function PreviewResult({ result }: { result: ClientAdmissionPreview }) {
  const { label, icon: Icon } = previewPresentation[result];
  return (
    <div className={styles["preview-result"]} data-result={result}>
      <Icon aria-hidden="true" />
      {label}
    </div>
  );
}

type UserOption = { label: string; value: number };
const invalidConditionNotice = "条件无效。请检查值的类型、长度、数量及分组层数。";

export function ClientAdmissionSettings({
  clientCode,
  onDirtyChange,
}: {
  clientCode: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const userInputId = useId();
  const [policy, setPolicy] = useState<ClientAdmissionPolicy>();
  const [allowedActions, setAllowedActions] = useState<ClientAdmissionDetail["allowedActions"]>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<ConditionDraft>(() => fieldDraft(userScope));
  const [savedDraft, setSavedDraft] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption>();
  const [options, setOptions] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<ClientAdmissionPreview>();
  const [operationNotice, setOperationNotice] = useState<string>();
  const [invalidCondition, setInvalidCondition] = useState(false);
  const [repairNotice, setRepairNotice] = useClientSnapshotRepairNotice(clientCode);
  const searchRequest = useRef(0);

  const receivePolicy = useCallback((value: ClientAdmissionPolicy, preserveDraft: boolean) => {
    setPolicy(value);
    const received = value.filter === null ? fieldDraft(userScope) : readDraft(value.filter);
    setSavedDraft(received);
    if (!preserveDraft) {
      setDraft(received);
      setInvalidCondition(false);
    }
  }, []);
  const load = useCallback(
    async (preserveDraft = false) => {
      setAllowedActions(undefined);
      try {
        const detail = await clientAdmissionService.detail(clientCode);
        receivePolicy(detail, preserveDraft);
        setAllowedActions(detail.allowedActions);
        setLoadFailed(false);
      } catch {
        setLoadFailed(true);
      }
    },
    [clientCode, receivePolicy],
  );
  useEffect(() => {
    void load();
    return () => {
      searchRequest.current++;
    };
  }, [load]);

  const filter = writeFilter(draft, userScope);
  const dirty = filter === undefined ? draft !== savedDraft : JSON.stringify(filter) !== JSON.stringify(policy?.filter);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  async function findUsers(text: string) {
    const request = ++searchRequest.current;
    const keyword = text.trim();
    setOptions([]);
    setSearching(keyword !== "");
    if (!keyword) return;
    try {
      const response = await searchUsers({
        pageNum: 1,
        pageSize: 20,
        conditions: { fuzzyConditions: { text: keyword }, exactConditions: {} },
      });
      if (request !== searchRequest.current) return;
      setOptions(response.result.map(({ id, username, name }) => ({ value: id, label: `${name} (${username})` })));
    } catch {
      if (request === searchRequest.current) message.error("用户搜索失败，请重试。");
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }

  async function mutate(kind: "save" | "setEnabled", action: () => Promise<void>) {
    setBusy(true);
    setOperationNotice(undefined);
    let preserveDraft = false;
    try {
      await action();
    } catch (error) {
      if (error instanceof AdminMutationCommittedError) {
        setRepairNotice("操作已提交，但缓存同步失败或未确认。旧配置可能仍生效，请联系管理员修复传播。");
        setResult(undefined);
      } else {
        preserveDraft = dirty;
        const failure = classifyAdmissionFailure(error);
        if (failure === "invalid-input" && kind === "save") setInvalidCondition(true);
        else if (failure === "invalid-input") setOperationNotice("开启准入策略前须保存有效条件。");
        else if (failure === "rejected") setOperationNotice("准入策略操作已被拒绝，请检查权限与应用状态。");
        else if (failure === "unavailable") setOperationNotice("准入策略服务暂时不可用，请稍后重试。");
        else setOperationNotice("操作结果未确认，请核对已保存的条件和状态后再操作。");
      }
    } finally {
      await load(preserveDraft);
      setBusy(false);
    }
  }

  function save() {
    if (!allowedActions?.save || filter === undefined) return;
    return mutate("save", async () => {
      const saved = await clientAdmissionService.save(clientCode, filter);
      receivePolicy(saved.result, false);
      setResult(undefined);
      message.success(saved.changed ? "准入条件已保存" : "准入条件无需修改");
    });
  }

  function setEnabled(enabled: boolean) {
    if (!allowedActions?.setEnabled) return;
    return mutate("setEnabled", async () => {
      const updated = await clientAdmissionService.setEnabled(clientCode, enabled);
      setResult(undefined);
      const status = updated.result.enabled ? "已开启" : "已关闭";
      message.success(updated.changed ? `准入策略${status}` : `准入策略当前${status}`);
    });
  }

  async function preview() {
    if (!allowedActions?.preview || filter === undefined || !selectedUser) return;
    setBusy(true);
    setResult(undefined);
    setOperationNotice(undefined);
    try {
      const tested = await clientAdmissionService.preview(clientCode, {
        userId: selectedUser.value,
        filter,
      });
      setResult(tested.status);
    } catch (error) {
      const failure = classifyAdmissionFailure(error);
      await load(dirty);
      if (failure === "invalid-input") setInvalidCondition(true);
      else if (failure === "rejected") setOperationNotice("试算请求已被拒绝，请检查权限与应用状态。");
      else if (failure === "unavailable") setOperationNotice("试算服务暂时不可用，请稍后重试。");
      else setOperationNotice("未收到试算结果，请稍后重新试算。");
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setBusy(true);
    setOperationNotice(undefined);
    setResult(undefined);
    try {
      await load(dirty);
    } finally {
      setBusy(false);
    }
  }

  const conditionStatus = dirty ? "有未保存的更改" : policy?.filter ? "条件已保存" : "尚未保存条件";
  const enableHint = dirty ? "保存条件后可更改策略状态。" : "先保存有效条件，再开启策略。";

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      {repairNotice && <Alert type="warning" showIcon title={repairNotice} />}
      {operationNotice && (
        <Alert
          type="error"
          showIcon
          title={operationNotice}
          action={
            loadFailed ? undefined : (
              <Button disabled={busy} onClick={() => void reload()}>
                重新加载
              </Button>
            )
          }
        />
      )}
      {loadFailed ? (
        <Alert
          type="error"
          showIcon
          title="无法加载应用准入策略"
          action={
            <Button disabled={busy} onClick={() => void reload()}>
              重新加载
            </Button>
          }
        />
      ) : (
        <Card loading={!policy} className={styles.workspace}>
          {policy && (
            <>
              <header className={styles["policy-header"]} data-enabled={policy.enabled}>
                <div className={styles["policy-title"]}>
                  <span className={styles["policy-icon"]} aria-hidden="true">
                    <SafetyCertificateOutlined />
                  </span>
                  <div>
                    <div className={styles["policy-heading"]}>
                      <h2>应用准入策略</h2>
                      <span className={styles["policy-state"]}>状态：{policy.enabled ? "已开启" : "已关闭"}</span>
                    </div>
                    <p className={styles.description}>
                      {policy.enabled ? "满足条件的用户才可获得新的应用登录授权。" : "应用登录按原流程处理。"}
                    </p>
                  </div>
                </div>
                <div className={styles["policy-action"]}>
                  <Button
                    disabled={
                      busy || !allowedActions?.setEnabled || dirty || (!policy.enabled && policy.filter === null)
                    }
                    onClick={() => void setEnabled(!policy.enabled)}
                  >
                    {policy.enabled ? "关闭准入策略" : "开启准入策略"}
                  </Button>
                  {allowedActions?.setEnabled && (dirty || (!policy.enabled && policy.filter === null)) && (
                    <Typography.Text type="secondary">{enableHint}</Typography.Text>
                  )}
                </div>
              </header>
              <div className={styles.columns}>
                <section className={styles["editor-panel"]}>
                  <h3>准入条件</h3>
                  <ClientAdmissionConditionEditor
                    clientCode={clientCode}
                    scope={userScope}
                    draft={draft}
                    disabled={busy || (!allowedActions?.save && !allowedActions?.preview)}
                    onChange={(updated) => {
                      setDraft(updated);
                      setResult(undefined);
                      setInvalidCondition(false);
                    }}
                  />
                  {invalidCondition && <Alert type="error" showIcon title={invalidConditionNotice} />}
                  <div className={styles["editor-actions"]}>
                    <span className={styles["editor-status"]} data-dirty={dirty} aria-live="polite">
                      {conditionStatus}
                    </span>
                    <Button
                      type="primary"
                      icon={<SaveOutlined aria-hidden="true" />}
                      disabled={busy || !allowedActions?.save || !dirty || filter === undefined || invalidCondition}
                      onClick={() => void save()}
                    >
                      保存条件
                    </Button>
                  </div>
                </section>
                <section className={styles["preview-panel"]}>
                  <div className={styles["preview-heading"]}>
                    <ExperimentOutlined aria-hidden="true" />
                    <h3>策略试算</h3>
                  </div>
                  <p className={styles.description}>使用当前编辑的条件检查一名用户是否匹配。</p>
                  <div className={styles["preview-form"]}>
                    <div className={styles.field}>
                      <label htmlFor={userInputId}>试算用户</label>
                      <Select<UserOption, UserOption>
                        id={userInputId}
                        aria-label="试算用户"
                        labelInValue
                        showSearch={{ filterOption: false, onSearch: (text) => void findUsers(text) }}
                        placeholder="按账号或姓名搜索"
                        loading={searching}
                        options={options}
                        value={selectedUser}
                        disabled={busy || !allowedActions?.preview}
                        onChange={(value) => {
                          setSelectedUser(value);
                          setResult(undefined);
                        }}
                      />
                    </div>
                    <Button
                      aria-label="试算"
                      icon={<SearchOutlined aria-hidden="true" />}
                      disabled={
                        busy || !allowedActions?.preview || !selectedUser || filter === undefined || invalidCondition
                      }
                      onClick={() => void preview()}
                    >
                      试算
                    </Button>
                  </div>
                  <div role="status">{result && <PreviewResult result={result} />}</div>
                </section>
              </div>
            </>
          )}
        </Card>
      )}
    </Space>
  );
}
