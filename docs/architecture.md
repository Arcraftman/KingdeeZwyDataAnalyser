# 架构与目录职责

## 数据流

Electron renderer 只能通过 preload 的固定 IPC 调用访问主进程。主进程启动 Python 本机服务；Python 完成账套会话交换、身份核验和只读财务接口读取，再返回 JSON 快照。

## 目录职责

| 目录 | 职责 | 提交 Git |
| --- | --- | --- |
| `KingdeeZwyDataAnalyser/` | Python 业务包与包内 `conf/` | 是 |
| `electron/main/` | 窗口、服务进程、IPC | 是 |
| `electron/preload/` | 最小化 renderer API 桥 | 是 |
| `electron/renderer/` | 页面、组件、状态和样式 | 是 |
| `scripts/bootstrap/` | 创建本地开发环境 | 是 |
| `scripts/run/` | 启动服务和桌面客户端 | 是 |
| `runtime/auth/` | 密钥与授权会话 | 否 |
| `runtime/registry/` | 本地账套注册表 | 否 |
| `runtime/service/` | 服务令牌、PID、导出和缓存 | 否 |
| `tests/unit/` | 不访问网络和真实会话的逻辑测试 | 是 |
| `tests/integration/` | 跨模块与本机服务契约测试 | 是 |

## 依赖规则

1. renderer 不读取文件、Cookie、令牌或注册表。
2. Python 财务读取只经过只读白名单。
3. `runtime/` 不得作为代码导入或提交 Git。
4. 业务配置位于包内 `conf/`，通过 `importlib.resources` 读取。
