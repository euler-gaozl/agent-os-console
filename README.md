# Agent OS 中台

统一管理 Agent、提示词、Skill、MCP、知识库、凭证和运行记录的 Web 平台。后端是 Go BFF，前端使用 React / TypeScript；服务身份为 `control`，默认端口 **8090**。

## 职责与边界

- 提供资源目录、Agent 编辑、绑定、试运行与发布，以及资料上传、检索、采集和运行详情。
- 通过 HTTP 调用 Registry、ToolHub、Runtime、Knowledge、Storage、Sources；不直接访问数据库，也没有迁移程序。
- 服务端使用独立的 `SERVICE_TOKEN`，用户使用 `ADMIN_TOKEN`。有效用户令牌不可缺失、过短或与服务令牌复用。
- `DEV_LOCAL=1` 只适用于指定回环端口，仍检查 Origin、Host 和写请求标记。静态 GET/HEAD 公开，API、指标和就绪检查仍受保护；凭证不进入前端产物。

## 资料采集与运行回溯

知识库详情支持“采集 → 留存正文预览 → 保存”。写入前检查 Sources `source-capture-v1` 与 Knowledge `source-capture-import-v1`。浏览器先保存采集 ID、精确 URL 和固定知识库版本，再发请求；丢失回复后可按相同 ID 恢复。关闭对话框不会取消服务端操作，重复保存使用相同采集和版本。浏览器只保存恢复指针，不保存正文或服务凭证。

预览每次读取 1,200 个 Unicode 字符，采集时间标明年份和北京时间，并与发布日期、统计期分开。保存包含完整正文及留存响应；外部索引需等 Knowledge 返回 `ready`。

运行详情区分原始任务、当前约束和 Agent 推导的工作状态，支持历史修订、过期约束提示、来源回执与管理恢复。回执以每页 25 条摘要和每段 8,192 字符读取；未决调用独立查询，关闭或切换阅读器后忽略迟到回复，不退回全量 `/calls`。

此版本要求 Runtime `call-receipts-v1`：**先升级 Runtime，再升级 Console；回滚顺序相反**。Windows 维护器检查实际能力与绑定地址，直接部署时也必须执行对应检查。

## 独立构建与部署

需要 Go 1.27.2、Node 24.19.0、pnpm 11.25.0。SDK rc.3 已固定并随 `vendor` 提交，不需要相邻源码或私有模块令牌。

```powershell
$env:GOWORK='off'; $env:GOPROXY='off'
./scripts/Build.ps1
pnpm --dir web install --frozen-lockfile --ignore-scripts
pnpm --dir web test
pnpm --dir web run build
./scripts/Package-Web.ps1 -Destination <新的绝对路径>
./scripts/Test-RelocatedPackage.ps1 -Package <发布包路径>
```

按 [配置示例](deploy/service.example.json) 创建仓库外的受保护配置，以 `--config` 启动 BFF。源码构建的 `WEB_DIR` 指向 `web/dist`，发布包中指向包内 `web`。健康检查通过 `AGENTOS_CONFIG` 读取配置。Docker 独立构建本服务和前端，运行镜像不含 Node 编译器或数据库。

升级/回滚需把匹配的 BFF 与 Web 作为完整包替换，并保持 HTTP 契约兼容；本服务没有数据库回滚。就绪检查只证明本进程可用，下游状态由页面另行展示。

## 验证与当前状态

`feat/model-native-limits` 候选为新建 Agent 默认启用供应商原生输入输出能力，
由 Registry 保存时重新读取并冻结；模型设置页提供只读预览、来源和观测时间。
历史版本保留原配置，用户可明确选择让下个版本采用原生能力。输入输出共享模型窗口，
尝试次数与重试保护独立保留。必须先安装支持能力发现的 Registry 及 native-v4 Runtime/Worker，
再安装此 Console；当前正式版本尚未切换。

单项任务提交通道接受 32 MiB HTTP 请求，任务详情回复容纳 64 MiB；其他接口保持原容量。
这些是传输保护，Runtime 仍负责按引擎验证任务。超量或断开的上游回复返回明确错误，
不再截断后报告成功。BFF 不解析供应商密钥，浏览器只提交凭证名称。

本地 Web、Go、浏览器和发布包检查覆盖丢回复、关闭重开、Unicode 分页、版本冲突和窄屏。`web/test/capture-ui.html` 是无凭证的模拟交互入口，不属于生产构建。真实采集、模型试运行和安装记录见 [平台验收文档](https://github.com/euler-gaozl/agent-os/blob/main/docs/windows-single-machine-plan.md)。完整页面验收仍在进行；模拟 HTTP 通过不代表真实模型、数据库恢复或研究质量通过。

Actions 日常保持关闭，最终统一 CI 尚待平台验收阶段执行。[历史实现与验收细节](docs/history/service-notes-20261014.en.md) 保留原始英文记录。
