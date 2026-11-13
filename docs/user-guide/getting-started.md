# 安装与快速上手

本指南帮助你在 **Windows 10/11** 或 **Linux** 环境中完成 `antigravity-pele` 插件与 `agy-pele` 命令行工具的安装、启用与基础验证。

---

## 运行环境要求

- **操作系统**：Windows 10/11（x64/ARM64）或 Linux（x64/ARM64）。
- **运行时**：推荐 `Node.js >= 20`；若本机尚未全局安装 Node.js，也可使用 Google Antigravity 客户端内置的 `agy-node` / `agy-node.exe`。
- **宿主软件**：Google Antigravity（支持 Customizations 插件、MCP 与 Sidecar AUX_PANE）或独立终端（仅使用 CLI 时无需启动 IDE）。

> **开箱即用特性**：仓库已随附预构建产物（`dist/` 与 `sidecars/pele_studio/dist/`），普通用户**不需要**运行 `npm install` 或构建脚本即可直接安装使用。

---

## 第一步：获取代码并全局安装

### Linux（bash / zsh）

```bash
git clone https://github.com/springtian1982/antigravity-pele.git
cd antigravity-pele
node scripts/install.mjs
```

如果系统未安装全局 `node`，可以直接用 Antigravity 内置的 `agy-node` 运行安装脚本（路径示例见下文"仅使用 `agy-node` 运行"）：

```bash
agy-node scripts/install.mjs
```

安装完成后，`scripts/install.mjs` 会写入以下位置：
- **插件目录**：`~/.gemini/config/plugins/antigravity-pele`
- **CLI 可执行软链接**：`~/.local/bin/agy-pele` -> `~/.gemini/config/plugins/antigravity-pele/bin/agy-pele`

确认 `~/.local/bin` 已在 `$PATH` 中（若不在，可加入 `~/.bashrc` 或 `~/.zshrc`）：

```bash
export PATH="$HOME/.local/bin:$PATH"
agy-pele --version
```

预期输出：`agy-pele 0.1.0`。

---

### Windows（PowerShell / CMD）

在 PowerShell 或命令提示符中执行：

```powershell
git clone https://github.com/springtian1982/antigravity-pele.git
cd antigravity-pele
node scripts/install.mjs
```

安装完成后，脚本会自动复制插件并生成 Windows 启动器：
- **插件目录**：`%USERPROFILE%\.gemini\config\plugins\antigravity-pele`
- **CLI 启动器**：`%USERPROFILE%\.local\bin\agy-pele.cmd` 与 `agy-pele.ps1`
- **自动补充路径**：若存在 `%APPDATA%\npm` 目录（常见于已安装 Node.js 的环境），脚本也会同步写入 `agy-pele.cmd` 与 `agy-pele.ps1`，实现免配环境变量即刻运行。

如果终端提示找不到 `agy-pele`，请将 `%USERPROFILE%\.local\bin` 添加到系统"用户环境变量 -> Path"，然后重开终端验证：

```powershell
agy-pele --version
```

---

## 第二步：在 Antigravity 中确认插件已启用

1. 打开 Google Antigravity，进入 **Customizations -> Plugins** 页面。
2. 在插件列表中找到 **Antigravity Pele**（图标为珊瑚橙渐变卡片徽章），确认其处于 **Enabled（启用）** 状态。
3. 开启后无需重启软件，以下能力立即生效：
   - **MCP Server**：`antigravity-pele`（提供 4 个 MCP 工具）
   - **Rule**：`rules/AGENTS.md`（按表面自动接管 Mermaid 渲染）
   - **Skill**：`pele-mermaid`（33 种图表语法与工作流指引）
   - **Sidecar**：`Pele Studio`（位于右侧工作台面板 `AUX_PANE`）

---

## 第三步：30 秒快速体验

### 在对话中测试

在 Antigravity 对话框中直接向助手发送提示语（亦可在插件卡片的推荐提示词中一键点击）：

- *"使用 Pele 为当前项目绘制一张 swimlane-beta 泳道架构图"*
- *"检查当前工作区所有 Markdown 文件中的 Mermaid 语法"*
- *"在 Pele Studio 中打开 README.md 的图表"*

助手将自动调用 `pele_render_card`，在聊天回复中输出一张带吸顶工具栏的 Flexoki 交互式图表卡片。

### 在终端中测试

```bash
# 生成测试图表的 SVG
echo "flowchart LR; Start --> Render --> Done" | agy-pele render - -o test-flow.svg

# 实时检查当前目录的 Markdown 图表
agy-pele check . --strict-mermaid
```

---

## 升级与卸载

### 升级到最新版本

```bash
cd antigravity-pele
git pull
node scripts/install.mjs
```

> **升级提示**：新版安装脚本支持原位原子更新，执行 `node scripts/install.mjs` 时还会自动调用 `agy-pele upgrade-cards` 将 `~/.gemini/antigravity/brain/` 下**历史会话中已生成的旧版卡片**原位升级到最新模板（补齐 `自适应` 与 `全屏` 工具栏，如需跳过可传 `--no-upgrade-cards`）；同时 MCP 路由会在检测到 `mcp-worker.cjs` 更新后自动热重载，**新建或已有会话均可立即生效**。若某历史会话标签页正处于打开状态，切换一次会话或重新打开窗口即可刷新 WebView 缓存看到升级后的卡片。

### 彻底卸载

```bash
cd antigravity-pele
node scripts/install.mjs --uninstall
```

卸载脚本会移除 `~/.gemini/config/plugins/antigravity-pele` 以及 `~/.local/bin`（及 Windows `%APPDATA%\npm`）下创建的 `agy-pele` 启动器，不会影响你工作区中的源码或 `.md` 文件。

---

## 常见安装问题排查

### 1. 提示 `agy-pele: neither node nor agy-node found`

`bin/agy-pele`（Linux）及 `agy-pele.cmd` / `agy-pele.ps1`（Windows）会按以下顺序寻找 Node 运行时：
1. `PATH` 中的 `node`
2. `PATH` 中的 `agy-node` / `agy-node.exe`
3. 常见 Antigravity 安装目录（如 Linux `~/.local/bin/agy-node`、`/usr/local/bin/agy-node`；Windows `%APPDATA%\Antigravity\bin\agy-node.exe`、`%LOCALAPPDATA%\Programs\Antigravity\bin\agy-node.exe`）

若你的 Antigravity 安装在自定义路径，建议安装 Node.js >= 20 或将 `agy-node` 所在目录加入系统 `PATH`。

### 2. Linux 下通过软链接执行报错 `Cannot find module`

请升级至最新仓库版本并重新执行 `node scripts/install.mjs`。最新版 `bin/agy-pele` 使用 POSIX 兼容的 `readlink` 循环解析软链接真实目标，确保从任意软链接位置都能定位插件内的 `dist/cli.cjs`。
