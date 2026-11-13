# 本地开发、测试与贡献指南

欢迎参与 `antigravity-pele` 的开发与改进！本文档说明如何搭建开发环境、运行全套自动化测试与验证门禁，以及如何扩展新功能。

---

## 1. 开发环境准备

- **Node.js**：`>= 20.0.0`（开发与打包需完整 `npm`；推荐 Node 20 或 22 LTS）。
- **包管理器**：`npm`。
- **可选验证工具**：`agy`（Google Antigravity CLI，用于执行 `agy plugin validate --strict` 插件规范检查）。

初始化本地开发依赖：

```bash
git clone https://github.com/springtian1982/antigravity-pele.git
cd antigravity-pele
npm install
```

---

## 2. 常用研发命令

| 命令 | 说明 |
| :--- | :--- |
| `npm run build` | 通过 `scripts/build.mjs` 编译全部 CLI / MCP / Card / Sidecar 产物到 `dist/` 与 `sidecars/pele_studio/dist/` |
| `npm run typecheck` | 执行 `tsc --noEmit` 进行全量 TypeScript 严格类型检查 |
| `npm test` | 先构建正式产物，再通过 `scripts/build-tests.mjs` 编译测试到 `.test-dist/` 并执行 `node --test` |
| `npm run install:global` | 等同于 `node scripts/install.mjs`，将当前代码库同步安装到本地全局插件与 CLI 目录 |

---

## 3. 测试体系概览

测试套件位于 `tests/` 目录，使用 Node.js 内置 `node:test` 运行时执行，共 3 个测试文件、10 个核心端到端与合规用例：

- **`tests/core.test.ts`**：
  - 验证标准 Mermaid 12.1 与 Pele 专属扩展图表渲染及 Flexoki 主题变量注入。
  - 验证 `CRLF` / `LF` Markdown 围栏块提取、精确行号追踪以及 `HashConflictError` 并发保护回写。
  - 验证 Windows 与 POSIX 路径向 RFC-8089 `file:///` URI 的转换。
  - 验证卡片 HTML 生成（`auto` / `compact` / `fixed` 三种高度模式、无 `100vh`、无小字号可读性回归）。
  - 验证所有预构建 `dist/` 单文件产物头部包含 SPDX MIT 与上游组件版权声明及 `cli.cjs` shebang 完整保留。
- **`tests/cli.test.ts`**：
  - 真实子进程运行 `dist/cli.cjs`，覆盖 `render`（stdin 管道到 SVG/HTML）、`check`（语法错误精确行号与 `--strict-mermaid` 退出码）以及 `extract`（生成编号 SVG 与 `manifest.json`）。
- **`tests/mcp-sidecar.test.ts`**：
  - 启动 `dist/mcp.cjs` 子进程验证 JSON-RPC `initialize`、`tools/list` 及全部 4 个工具的真实调用与 `_meta` 会话路由。
  - 启动 `startStandalonePreviewServer` 验证一次性 Token 鉴权、目录遏制（`403`）、与 SHA-256 哈希冲突拒绝（`409`）。

---

## 4. 常见扩展方式

### 新增或修改 MCP 工具参数

1. 编辑 `src/mcp/index.ts` 中的 `TOOLS` schema 与 `handleToolCall()` 分支。
2. 如涉及到规则指引或技能文档，同步更新 `rules/AGENTS.md` 与 `skills/pele-mermaid/SKILL.md`。
3. 在 `tests/mcp-sidecar.test.ts` 中补充对新工具/参数的自动化断言。

### 扩展主题色板

1. 在 `src/core/palette.ts` 中新增预设常量及 `normalizeThemeMode()` 归一化逻辑。
2. 确认变量名严格封装在容器选择器内（不要写入 `:root`）。
3. 同步暴露到 `src/cli/index.ts` 与 `src/mcp/index.ts` 的参数说明与文档中。

### 新增或调整 CLI 子命令/参数

1. 在 `src/cli/index.ts` 中实现并更新 `printHelp()`。
2. 在 `tests/cli.test.ts` 增加端到端 CLI 子进程测试用例，并更新 [命令行完全手册](../user-guide/cli-reference.md)。

---

## 5. 提交 PR 前的强制门禁

由于仓库同时分发开箱即用的预构建产物（`dist/` 与 `sidecars/pele_studio/dist/`），提交代码前请务必确认以下检查全部通过：

```bash
# 1. 类型检查
npm run typecheck

# 2. 完整重建并运行测试（需 10/10 全部通过）
npm test

# 3. 检查工作区所有 Markdown/Mermaid 文档（必须 0 error, 0 warning）
node dist/cli.cjs check . --strict-mermaid

# 4. Antigravity 插件结构严格校验（若本地已安装 agy CLI）
agy plugin validate . --strict --json
```

> **重要提醒**：
> - 修改 `src/` 后请务必重新执行 `npm run build`（或 `npm test`），确保提交的 `dist/` 产物与源码一致。
> - 在仓库 `.md` 文件的 ```` ```mermaid ```` 代码块中请**仅使用标准 Mermaid 12.1 语法**；若需展示 10 种 Pele 专属扩展类型源码，请使用 ```` ```mmd ```` 围栏，以免破坏 GitHub 渲染及 `--strict-mermaid` 校验。

---

## 6. 开源协议

向本项目提交贡献即表示你同意你的贡献将在项目的 **[MIT License](../../LICENSE)** 下发布，并保留原作者版权声明（`Copyright (c) 2026 springtian <springtian@gmail.com>`）。
