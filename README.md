# DataAnalyser

账无忧 Electron 财务数据分析客户端。Electron 负责桌面界面和用户操作的登录窗口；Python 本机服务负责账套会话、只读数据读取、核验和 JSON 快照生成。

## Electron 桌面客户端

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

运行项目静态检查：

```powershell
npm run check
```

检查流程会扫描 Git 合并标记，使用 Ruff 检查 Python，再执行 Python 字节码编译和 Electron JavaScript 语法检查。首次使用或更新开发依赖后，重新运行 `scripts\bootstrap\setup-local.ps1`。

本机只读服务监听 `127.0.0.1:18768`。`KingdeeZwyDataAnalyser/conf/finance_read_sources.json` 定义允许的财务读取接口，并随 Python 包发布。会话、访问令牌和密钥均在 `runtime/`，不进入 Git。

项目根目录的 `electron/` 分为 `main/`、`preload/`、`renderer/`；`scripts/` 分为 `bootstrap/`、`run/`、`configure/`、`legacy/`；`runtime/` 分为 `auth/`、`registry/`、`service/`。
