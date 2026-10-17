# Agent OS 中台

统一管理 Agent、提示词、Skill、MCP、知识库、凭证和运行记录的 Web 平台。后端是 Go BFF，前端使用 React / TypeScript；服务身份为 `control`，默认端口 **8090**。

2026-10-17 修复：原文交付的检查工具选项以绑定 MCP 的固定资源 ID 构造执行名，中文显示名继续作为标签。与 Runtime/Registry 保持一致，避免中文名称使选项消失或保存失败。4 项交付编辑定向测试及 TypeScript 检查通过；安装记录见集成仓。

## 职责与边界

- 提供资源目录、Agent 编辑、绑定、试运行与发布，以及资料上传、检索、采集和运行详情。
- 通过 HTTP 调用 Registry、ToolHub、Runtime、Knowledge、Storage、Sources；不直接访问数据库，也没有迁移程序。
- 服务端使用独立的 `SERVICE_TOKEN`，用户使用 `ADMIN_TOKEN`。有效用户令牌不可缺失、过短或与服务令牌复用。
- `DEV_LOCAL=1` 只适用于指定回环端口，仍检查 Origin、Host 和写请求标记。静态 GET/HEAD 公开，API、指标和就绪检查仍受保护；凭证不进入前端产物。

业务工作台的浏览器入口通过可选 `FUTURES_PUBLIC_URL` 配置，与 BFF 内部服务 `*_URL` 地址分开。填写用户浏览器能够访问的绝对 HTTP(S) URL，不带账号密码、查询参数或片段；例如当前 Mac 本地浏览器可设为 `http://127.0.0.1:18098`，远程浏览器应使用它实际可访问的域名。`localhost` 始终指浏览器所在电脑，不能从 Console 的监听地址推断业务端地址。

未配置时，桌面和移动导航显示“业务入口未配置”，不会猜测旧端口或生成跳转。已登录 Web 通过 `/api/ui-config` 获取这个白名单字段，读取失败时链接不可用；接口不依赖下游服务、不暴露服务地址或令牌，也不探测业务站点。更新配置后重启 Console 即可生效，不需重建 Web；业务端继续使用自己的登录方式，中台不附带管理令牌跳转。

## 资料采集与运行回溯

知识库详情支持“采集 → 留存正文预览 → 保存”。写入前检查 Sources `source-capture-v1` 与 Knowledge `source-capture-import-v1`。浏览器先保存采集 ID、精确 URL 和固定知识库版本，再发请求；丢失回复后可按相同 ID 恢复。关闭对话框不会取消服务端操作，重复保存使用相同采集和版本。浏览器只保存恢复指针，不保存正文或服务凭证。

预览每次读取 1,200 个 Unicode 字符，采集时间标明年份和北京时间，并与发布日期、统计期分开。保存包含完整正文及留存响应；外部索引需等 Knowledge 返回 `ready`。

运行详情区分原始任务、当前约束和 Agent 推导的工作状态，支持历史修订、过期约束提示、来源回执与管理恢复。回执以每页 25 条摘要和每段 8,192 字符读取；未决调用独立查询，关闭或切换阅读器后忽略迟到回复，不退回全量 `/calls`。

此版本要求 Runtime `call-receipts-v1`：**先升级 Runtime，再升级 Console；回滚顺序相反**。Windows 维护器检查实际能力与绑定地址，直接部署时也必须执行对应检查。

## 独立构建与部署

需要 Go 1.27.2、Node 24.19.0、pnpm 11.25.0。SDK rc.4 已固定并随 `vendor` 提交，不需要相邻源码或私有模块令牌。

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

2026-10-17 新增“模型与执行 → 交付方式”候选，可保存 `final_output` 固定策略：选择检查工具、原文输入字段及布尔就绪路径。MCP 候选来自 Agent 已绑定的精确资源版本；读取失败保留原配置，保存时仍由 Registry 权威校验。模型转换、其他字段编辑及版本回读不丢策略；不支持的协议不会被静默修正。结构就绪不代表来源或事实正确。

此候选要求 Registry 同时声明 `agent-model-native-v1` 和 `final_output: receipt-field-v1`。旧 Registry 不能再接收资源保存以免丢字段；部署声明新增 `requires_final_output`。必须先完成平台发布兼容门槛，再按 Registry/Runtime/Worker/Console 组合升级；候选尚未正式安装。

运行详情识别明确固定的 final-v5，用现有管理接续预览/回执入口，不显示绕过审计的旧 resume 按钮；v5 的 Owner 接续支持仍待安装前集成。页面不能授予服务端没有返回的恢复许可。源码工作状态和归档清单支持 v5，未知引擎仍拒绝。

本轮后端与 Web 测试、类型检查和独立构建记录于集成仓的 Windows 交付记录。`web/test/final-output-ui.html` 提供实际生产组件的无凭证模拟交互入口；本机临时验收服务启动被自动审批拦截，**浏览器点击、延迟回复及窄屏实测尚未完成**，不能用静态渲染测试代替。没有付费模型调用或 Actions。

`feat/model-native-limits` 候选为新建 Agent 默认启用供应商原生输入输出能力，
由 Registry 保存时重新读取并冻结；模型设置页提供只读预览、来源和观测时间。
历史版本保留原配置，用户可明确选择让下个版本采用原生能力。输入输出共享模型窗口，
尝试次数与重试保护独立保留。必须先安装支持能力发现的 Registry 及 native-v4 Runtime/Worker，
再安装此 Console；当前正式版本尚未切换。

保存资源前，中台通过已绑定 Registry 的鉴权能力端点核对 `agent-model-native-v1` 和 `receipt-field-v1`；旧版本、异常响应或连接失败返回明确错误，不转发保存，避免旧 Registry 静默丢弃模型字段。`--model-management-profile` 提供无需配置的发布器声明。请求前探测不能替代升级/回退兼容检查，部署时仍须保持声明与实际绑定服务一致。

单项任务提交通道接受 32 MiB HTTP 请求，任务详情回复容纳 64 MiB；其他接口保持原容量。
这些是传输保护，Runtime 仍负责按引擎验证任务。超量或断开的上游回复返回明确错误，
不再截断后报告成功。BFF 不解析供应商密钥，浏览器只提交凭证名称。

本地 Web、Go、浏览器和发布包检查覆盖丢回复、关闭重开、Unicode 分页、版本冲突和窄屏。`web/test/capture-ui.html` 是无凭证的模拟交互入口，不属于生产构建。真实采集、模型试运行和安装记录见 [平台验收文档](https://github.com/euler-gaozl/agent-os/blob/main/docs/windows-single-machine-plan.md)。完整页面验收仍在进行；模拟 HTTP 通过不代表真实模型、数据库恢复或研究质量通过。

Actions 日常保持关闭，最终统一 CI 尚待平台验收阶段执行。[历史实现与验收细节](docs/history/service-notes-20261014.en.md) 保留原始英文记录。

2026-10-15 Mac 源码增量：运行详情明确识别固定 state-v1、resident-v2、budget-v3 和 native-v4，引导到已有工作状态及历史修订面板，并将这些引擎的归档下载标为执行记录清单。evidence-v1 仅提供清单，历史与未知引擎不开放源码状态面板。此修复不改变失败任务继续、人工核对、任务快照、预算或 DSH 协议，也不表示失败任务自动接续已实现。

本增量有 7 项定向 Web 检查通过（新增 5 项，零跳过）；应用到实际源码后，完整 Web 测试 27 项通过、零跳过，TypeScript 检查通过，覆盖实际组件的静态渲染、固定引擎/历史边界和归档下载回调；TypeScript 与 Vite 构建通过。waiting_unknown 的新增断言仅核对初始未取得恢复许可时没有执行按钮，未模拟服务返回允许/拒绝后的交互，不替代真实浏览器或 native-v4 管理恢复联合验收。

## 原生失败任务的显式继续

2026-10-15 Mac 源码加入 native-v4 运行详情的“按原快照继续”。先读取 Runtime 当前失败版本；浏览器在 POST 前保存任务、请求 ID 与原失败版本，每个请求独立持久化。回复丢失、401、404、冲突或不可核验回执时保留原指针，只允许核对或明确重发同一请求。查询回执不触发执行；有效已提交回执才清理对应指针，显示的是历史排队/拒绝结果，当前任务状态仍以详情为准。切换任务、迟到回包和父页面刷新均按选择版本隔离。

仅 native-v4 改用新动作，历史引擎继续使用原检查点接口；不改变任务快照、预算、DSH 循环，也不自动继续任务。界面提示继续可能产生用量；本地保存的只有恢复指针，服务身份仍由 BFF 持有。BFF 保留转义任务 ID，拒绝查询参数（含空问号），限制请求 1 KiB、回复 16 KiB，并禁止缓存。上游错误不会转换成已提交回执。

此功能要求 Runtime 的 `failed-run-continuation-action-context-v1` 与 `failed-run-continuation-receipt-v1`，以及已升级规则守卫的全部领取 Worker。顺序为 Worker 守卫 → Runtime Owner 迁移和 Runtime HTTP → 匹配的 Console BFF/Web；回滚 Console 后再回滚 Runtime，保留新增的历史回执表。旧 Runtime 的 404 会明确显示不可用，不会自动回退旧 `/resume`。本次仅完成源码与构建，尚未安装新 Runtime/Console。

本轮实际检查：Go `-race ./...`、vet、独立 Go 构建、36 项 Web 测试（新增 9 项，零跳过）、TypeScript 与 Vite 构建通过。新增检查覆盖实际客户端写入前置、丢回复重试、回执绑定、传输异常、独立恢复键、父选择版本回调及初始 SSR；并验证 BFF 请求容量、上游响应容量/不可用、转义路径与查询参数边界。静态独审已修正空查询串保真及父选择竞态。MemoryStorage 与 SSR 不代表已运行真实 hook 点击/卸载、跨标签页或浏览器验收；这些联合交互、真实供应商及业务验收仍待完成。
## Windows 接续发布兼容（2026-10-17）

发布契约要求 Runtime 提供 `failed-run-continuation-v1`，Windows 发布器会验证绑定的 Runtime 和 Worker 组合。顺序为全部 Worker 守卫 → Owner 迁移 → Runtime → 匹配 Console BFF/Web。回滚 Console 不会删除接续请求或回执；已有回执时仍必须保留能够查询历史决定的 Runtime。此元数据增量不替代实际 Windows 安装与浏览器验收。

2026-10-17 guarded-v6：运行详情显式支持新引擎的接续、工作状态和归档入口；发布能力声明 guarded_transport=guarded-v6，部署器用它阻止不兼容 Console 回滚。14 项定向 Web 测试、TypeScript 检查及 Console/启动 Go 测试通过。
