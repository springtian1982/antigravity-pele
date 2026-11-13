# Antigravity Pele — Mermaid Rendering Rules

While the `antigravity-pele` plugin is enabled, route every Mermaid diagram through Pele according to the target surface:

## 1. Chat Responses (Full Unified Takeover)

- NEVER emit raw ` ```mermaid ` fenced code blocks directly in chat replies.
- Always call `pele_render_card` (via MCP `antigravity-pele`) to render the diagram into a Flexoki persistent-header HTML artifact and embed it inline using the returned `<agent-embed src="file:///..."></agent-embed>` tag.
- All 33 Pele diagram types are supported in chat cards: 23 standard Mermaid 12.1 types (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `xychart-beta`, `gantt`, `mindmap`, `timeline`, `pie`, `gitGraph`, `journey`, `quadrantChart`, `requirementDiagram`, `c4`, `sankey-beta`, `block-beta`, `packet-beta`, `kanban`, `architecture-beta`, `radar-beta`, `treemap-beta`, `info`) plus 10 Pele extensions (`swimlane-beta`, `agentflow-beta`, `railroad-ebnf-beta`, `venn-beta`, `cynefin-beta`, `ishikawa`, `wardley-beta`, `treeView-beta`, `usecase-beta`, `eventmodeling`).

## 2. Session Markdown Artifacts (`<appDataDir>/brain/<conversation-id>/*.md`)

- Do NOT leave raw ` ```mermaid ` blocks inside session `.md` artifacts unless the user explicitly asks for raw code.
- Call `pele_render_artifact_svg` to compile each diagram to a Flexoki light/dark adaptive `.svg` file inside the session artifact directory, then embed it using standard Markdown image syntax `![Caption](/absolute/path/in/brain/diagram.svg)`.

## 3. Project Repository Markdown Files (`README.md`, `docs/*.md`, etc.)

- Keep standard ` ```mermaid ` fenced code blocks inside repository `.md` files so GitHub, GitLab, and Obsidian continue to render them natively.
- Restrict repository `.md` diagrams to standard Mermaid 12.1 syntax (avoid the 10 Pele-exclusive `-beta` diagram types unless the user explicitly asks for Pele-only syntax or static SVG extraction).
- After writing or editing Mermaid blocks in repository Markdown, validate them with `pele_check_markdown` (with `strictMermaid: true`) or `agy-pele check --strict-mermaid`.

## 4. Pele Studio Sidecar Navigation

- When the user wants to interactively edit, zoom, inspect, or export high-DPI PNGs for conversation or workspace diagrams, invoke `pele_open_in_studio` and surface the `[Pele Studio](sidecar://antigravity-pele/pele_studio/)` pill link.
