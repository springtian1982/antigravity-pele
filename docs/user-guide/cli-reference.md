# `agy-pele` 命令行完全手册

`agy-pele` 是随 `antigravity-pele` 附带的跨平台（Windows / Linux）独立命令行工具，无需打开桌面 IDE 即可完成图表渲染、批量提取、语法严格校验与本地热更新预览。

---

## 全局选项

```bash
agy-pele --help       # 查看命令帮助
agy-pele --version    # 查看当前版本（例：agy-pele 0.1.0）
```

---

## 子命令一览

| 子命令 | 用途 | 常用场景 |
| :--- | :--- | :--- |
| `render` | 将单个 `.mmd` 文件或标准输入渲染为 `.svg` 或 `.html` 卡片 | 快捷出图、脚本管道生成图表 |
| `check` | 扫描文件或目录中的 `.md` / `.mmd`，校验语法与 GitHub 兼容性 | 本地检查、Git Pre-commit、CI 流水线 |
| `extract` | 从 Markdown 文档中批量提取全部 Mermaid 代码块并生成 `manifest.json` | 静态站点构建、论文/报告配图导出 |
| `preview` | 启动本地 HTTP 服务并在默认浏览器打开 Pele Studio | 脱离 IDE 单独调试整库图表 |

---

## 1. `agy-pele render`

将单个图源码文件或标准输入（`-`）编译为独立 SVG 或交互式 HTML 工作卡。

### 语法

```bash
agy-pele render [input.mmd | -] [-o <out.svg|out.html>] [-f svg|html] [--theme <mode>] [--title <str>] [--height auto|compact|<px>] [--max-height <px>]
```

### 参数说明

| 参数 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `[input.mmd \| -]` | 输入文件路径，或使用 `-` / 管道从 `stdin` 读取 | （若 stdin 非 TTY 则自动读取 stdin） |
| `-o, --output <path>` | 输出文件路径；未指定时直接打印到 `stdout` | 打印到标准输出 |
| `-f, --format <svg\|html>` | 显式指定输出格式；未指定时根据 `-o` 扩展名判断 | `svg` |
| `--theme <mode>` | `flexoki`（亮暗自适应）、`flexoki-light`、`flexoki-dark`、`host` | `flexoki` |
| `--title <str>` | HTML 卡片顶栏标题（仅 `-f html` 有效） | 输入文件名或 `Mermaid Diagram` |
| `--height <mode>` | HTML 卡片工作区高度：`auto`、`compact`（`<= 416px`）或数字像素如 `680` | `auto` |
| `--max-height <px>` | `auto` 模式下的最大高度上限（范围 `200–4000`） | HTML 独立页默认 `2400` |

### 使用示例

```bash
# Linux: 从文件生成亮暗自适应 SVG
agy-pele render arch.mmd -o arch.svg

# Linux: 通过管道生成固定深色 Flexoki 交互式 HTML（竖版自适应高度）
cat flow.mmd | agy-pele render - -f html -o flow.html --theme flexoki-dark --title "部署流程" --height auto
```

```powershell
# Windows PowerShell: 从管道传入源码并导出浅色 SVG
"flowchart TD; A[用户] --> B[Pele CLI]; B --> C[SVG]" | agy-pele render - -o diagram.svg --theme flexoki-light
```

---

## 2. `agy-pele check`

递归扫描一个或多个文件/目录（`.md`、`.markdown`、`.mmd`、`.mermaid`），精确校验所有图表的语法并在错误时输出精确到宿主 Markdown 文件的**行号与列号**。

### 语法

```bash
agy-pele check <paths...> [--strict-mermaid] [--json]
```

> 若省略 `<paths...>`，默认扫描当前工作目录 `.`。工具会自动跳过 `node_modules`、`.git`、`dist`、`.test-dist`、`.next`、`.turbo`、`coverage` 等构建依赖目录。

### 参数说明

| 参数 | 说明 |
| :--- | :--- |
| `--strict-mermaid` | 开启严格兼容性检查：若项目 `.md` 中的 ```` ```mermaid ```` 代码块使用了 10 种 Pele 专属扩展类型，会发出 `pele-exclusive-diagram` 警告并使退出码返回 `1`（确保 GitHub / GitLab 可原生渲染） |
| `--json` | 输出结构化 JSON 诊断报告（含 `ok`、`filesScanned`、`blocksChecked`、`errorCount`、`warningCount`、`diagnostics`），便于 CI 与脚本解析 |

### 退出码

- `0`：所有图表语法正确（开启 `--strict-mermaid` 时同时要求 `warningCount === 0`）。
- `1`：存在至少一个语法错误，或开启 `--strict-mermaid` 后发现 Pele 专属语法警告。

### 示例

```bash
# 校验 README 与 docs 目录，确保 GitHub 100% 兼容
agy-pele check README.md docs/ --strict-mermaid

# 输出 JSON 报告
agy-pele check docs/ --strict-mermaid --json
```

---

## 3. `agy-pele extract`

提取 Markdown 文件中的所有 ```` ```mermaid ````（或 `~~~mermaid`）围栏代码块，按顺序批量编译为 SVG 或 HTML 卡片，并在输出目录生成索引文件 `manifest.json`。

### 语法

```bash
agy-pele extract <file.md> -o <out-dir> [-f svg|html] [--theme <mode>] [--height auto|compact|<px>] [--max-height <px>] [--json]
```

### 输出产物示例

执行 `agy-pele extract docs/design.md -o ./out -f svg` 后，目录 `./out` 将包含：
- `01-flowchart-system-overview.svg`
- `02-sequence-auth-flow.svg`
- `manifest.json`（记录每个图表的 `index`、`title`、`diagramType`、`width`、`height`、`codeStartLine`、`file`、`outputPath`）

---

## 4. `agy-pele preview`

启动轻量本地 HTTP 服务，在浏览器中打开独立版 **Pele Studio**，支持监控指定文件或整个工作区目录。

### 语法

```bash
agy-pele preview [target] [--port <num>] [--no-open] [--no-watch]
```

| 参数 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `[target]` | 要预览的文件或项目目录 | 当前目录 `.` |
| `-p, --port <num>` | 监听端口（`0` 表示系统自动分配空闲端口） | `0` |
| `--no-open` | 仅启动服务并打印访问 URL（含一次性鉴权 Token），不自动拉起浏览器 | 自动打开浏览器 |
| `--no-watch` | 关闭文件变化监听（依赖客户端轮询） | 默认开启 `fs.watch` |

---

## CI / Git 自动化集成示例

### Git `pre-commit` 钩子

在 `.git/hooks/pre-commit` 中加入：

```bash
#!/usr/bin/env sh
agy-pele check README.md docs/ --strict-mermaid || exit 1
```

### GitHub Actions 工作流（使用仓库内置 CLI 检查文档）

```yaml
name: Check Mermaid Diagrams
on: [push, pull_request]
jobs:
  check-diagrams:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: agy-pele check README.md docs/ --strict-mermaid
```
