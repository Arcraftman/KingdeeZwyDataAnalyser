# DataAnalyser

<<<<<<< HEAD
账无忧 Electron 财务数据分析客户端。Electron 负责桌面界面和用户操作的登录窗口；Python 本机服务负责账套会话、只读数据读取、核验和 JSON 快照生成。

## Electron 桌面客户端
=======
账无忧财务数据分析项目。仓库根目录包含 Electron 桌面客户端、Python 只读服务、独立的 C++ 迁移模块和旧 Excel 客户端。各部分职责见 [项目边界](docs/ARCHITECTURE.md)。

## Electron 桌面客户端

在 Windows 上安装 Node.js 22.12+（包含 npm）和 Python 3.10+，然后在本项目根目录运行：

```powershell
.\scripts\setup-local.ps1
npm install
npm run desktop
```

打开客户端后，点击“登录账无忧”，在弹出的登录窗口完成验证；返回客户端选择账套和月份，点击“刷新数据”。如果已有有效会话而本地服务未运行，点击“启动本地服务”。

当前桌面版显示财务总览、月度趋势及 11 张受管原始数据表。它通过本机 JSON 接口读取现有只读服务，不运行 VBA。预算和账龄人工录入、六张图表的 DeepSeek 解读、年度及研发专用报表尚未迁入桌面界面；这些功能仍在现有 Excel 客户端中。C++ 核心位于 `cpp/`，目前未接入桌面版。

会话和本地访问令牌仅保存在 `http_sessions/`、`runtime/`。Electron 渲染进程只接收已筛选的账套列表和报表数据；主进程只读取调用本地服务所需的访问令牌。

## Excel 客户端
### Windows 安装
>>>>>>> a6a901b16b65a84b641ecd7a55dd6be06740c1e8

桌面客户端位于 `electron/`，通过本机只读服务获取账套和财务快照；界面不直接读取账无忧会话、访问令牌或本地注册表。

先安装 Node.js 22.12+，并完成 Python 环境：

```powershell
.\scripts\bootstrap\setup-local.ps1
npm install
npm run desktop
```

打开客户端后，点击“登录账无忧”，在授权窗口中自行完成登录和验证，再回到客户端点击“完成授权”。随后选择账套和月份并刷新数据。客户端提供经营统计、月度分析图和原始报表数据表。

Electron 不使用 Playwright 或脚本填写账号密码。授权完成后，Python 使用纯 HTTP 的账套发现、会话交换和已授权会话复用逻辑；财务数据仍由 Python 服务执行账套身份验证、只读请求和核对后返回。

## 命令

```powershell
.\.kdzda\Scripts\python.exe .\scripts\run\launch.py serve
.\scripts\configure\deepseek.ps1
```

本机只读服务监听 `127.0.0.1:18768`。`KingdeeZwyDataAnalyser/conf/finance_read_sources.json` 定义允许的财务读取接口，并随 Python 包发布。会话、访问令牌和密钥均在 `runtime/`，不进入 Git。

项目根目录的 `electron/` 分为 `main/`、`preload/`、`renderer/`；`scripts/` 分为 `bootstrap/`、`run/`、`configure/`、`legacy/`；`runtime/` 分为 `auth/`、`registry/`、`service/`。
