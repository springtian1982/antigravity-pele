---
name: pele-mermaid
description: Render all 33 Mermaid 12.1 and Pele extended diagram types (including gantt, mindmap, timeline, swimlane-beta, agentflow-beta, railroad-ebnf-beta, venn-beta, ishikawa) using the antigravity-pele MCP tools, Pele Studio sidecar, and cross-platform agy-pele CLI.
---

# Antigravity Pele — Mermaid Skill

Use `antigravity-pele` whenever creating, verifying, extracting, or previewing Mermaid diagrams across Antigravity Desktop (Windows & Linux) and `agy` CLI.

## 1. Choosing the Right Modality

1. **Chat replies**: Call MCP tool `pele_render_card` with `{ code, title, theme?, height?, maxHeight? }` (`height` defaults to `"auto"` so portrait/vertical diagrams expand cleanly to their natural height; pass `"compact"` for `<= 416px` or a pixel string like `"680"` if needed) and embed the returned `<agent-embed src="file:///..."></agent-embed>` tag directly in the response. Cards also provide a 1-click **`自适应`** toggle button in the sticky header toolbar.
2. **Session `.md` artifacts**: Call MCP tool `pele_render_artifact_svg` and insert the returned `![title](/abs/path/diagram.svg)` image reference.
3. **Repository `.md` docs**: Write standard Mermaid 12.1 ` ```mermaid ` fenced blocks and validate via `pele_check_markdown` (`strictMermaid: true`) or `agy-pele check --strict-mermaid`.
4. **Live interactive studio / PNG export**: Call `pele_open_in_studio` and include `[Pele Studio](sidecar://antigravity-pele/pele_studio/)`.
5. **Terminal / batch / CI workflows**: Run `agy-pele` CLI commands.

## 2. Verified Syntax Quick Reference (Extended & Non-Native Diagrams)

Antigravity's built-in `.md` renderer only handles 6 basic types. Pele supports all 33:

### Swimlane (`swimlane-beta`)
```mmd
swimlane-beta LR
  subgraph User
    A[Request] --> B[Review]
  end
  subgraph Agent
    A --> C[Pele Render]
    C --> B
  end
```

### AgentFlow (`agentflow-beta`)
```mmd
agentflow-beta
  prompt[User Prompt] --> planner[Planner]
  planner --> tool[Pele MCP]
```

### Railroad Grammar (`railroad-ebnf-beta`)
```mmd
railroad-ebnf-beta
  cmd = "agy-pele" , ( "render" | "check" | "extract" | "preview" ) ;
```

### Venn Diagram (`venn-beta`)
```mmd
venn-beta
  set A["Mermaid 12.1"]
  set B["Pele Extensions"]
  union A,B["Shared Engine"]
```

### Cynefin & Ishikawa
```mmd
cynefin-beta
  clear "Known Knowns"
  complicated "Analyze & Plan"
  complex "Probe & Sense"
  chaotic "Act Fast"
```

```mmd
ishikawa
  effect Slow Diagrams
    cause DOM Layout
      detail Heavy Browser Runtime
```

## 3. `agy-pele` CLI Commands

- **Render single file or stdin**:
  - `agy-pele render diagram.mmd -o diagram.svg`
  - `cat diagram.mmd | agy-pele render -f html -o card.html --theme flexoki [--height auto|compact|<px>] [--max-height <px>]`
- **Validate Markdown / Mermaid files**:
  - `agy-pele check README.md docs/ [--strict-mermaid] [--json]`
- **Batch extract all diagrams from a Markdown file**:
  - `agy-pele extract docs/design.md -o ./assets/diagrams -f svg [--height auto|compact|<px>] [--max-height <px>]`
- **Launch local Pele Studio in browser**:
  - `agy-pele preview README.md --watch`
