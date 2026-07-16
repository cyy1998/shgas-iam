# 项目级 Serena MCP 启动指南

本仓库通过 `http://127.0.0.1:9121/mcp` 连接固定项目的 Serena backend。Backend 由
`serena-mcp-shgas-iam-proxy.socket` 按需激活；每次任务开始时只需确认或恢复该 user socket，不得另行启动第二个
Serena 进程。

## Linux / bash

运行：

```bash
systemctl --user is-active --quiet serena-mcp-shgas-iam-proxy.socket \
  || systemctl --user start serena-mcp-shgas-iam-proxy.socket
```

## Windows / PowerShell

Windows 环境通过默认 WSL 发行版运行同一个 Serena backend。开始前需满足：

- 已安装 WSL2；
- WSL 发行版已启用 systemd；
- 默认 WSL 用户已安装 `serena-mcp-shgas-iam-proxy.socket` user unit。

在 PowerShell 中运行：

```powershell
$ensureSerena = @'
for _ in 1 2 3 4 5; do
  [ -S "${XDG_RUNTIME_DIR%/}/bus" ] && break
  sleep 1
done

systemctl --user is-active --quiet serena-mcp-shgas-iam-proxy.socket \
  || systemctl --user start serena-mcp-shgas-iam-proxy.socket
'@

wsl.exe -- bash -lc $ensureSerena
if ($LASTEXITCODE -ne 0) {
  throw "项目级 Serena MCP socket 启动失败；请检查 WSL、systemd 和 user unit。"
}
```

等待 user D-Bus 的循环用于兼容 WSL 冷启动。不要直接在 PowerShell 中运行 `systemctl`；它属于 WSL 内的 Linux
环境。

## 失败处理

- `wsl.exe` 不存在：报告 WSL2 未安装或不可用。
- `Failed to connect to bus`：报告 WSL systemd 或 user manager 未就绪。
- `Unit serena-mcp-shgas-iam-proxy.socket could not be found`：报告 user socket unit 未安装。
- Socket 已恢复但当前任务仍没有 Serena 工具：告知用户需要重启或恢复任务，以重新初始化 MCP。

遇到上述错误时不得绕过 socket activation 手动启动另一个 Serena backend。
