import { detectType, mount, PeleError, type Mounted } from 'pele';
import { getFixedSchemeForTheme, normalizeThemeMode } from '../core/palette.js';
import {
  downloadPngFromElement,
  downloadSvgFromElement,
  observeHostAndSystemTheme,
  wireCopyButtons,
  wireToolbarRovingFallback,
} from '../core/svg-export-client.js';

interface StudioItem {
  id: string;
  source: 'conversation' | 'workspace';
  kind: 'card-artifact' | 'svg-artifact' | 'markdown-block' | 'mmd-file' | 'draft';
  title: string;
  filePath?: string;
  blockIndex?: number;
  code: string;
  sourceHash: string;
  diagramType?: string;
  subtitle?: string;
  canSave: boolean;
}

interface StateResponse {
  unchanged?: boolean;
  etag: string;
  focusedId?: string;
  items: StudioItem[];
}

declare global {
  interface Window {
    sidecar?: {
      conversationId?: string;
      fetch?: typeof fetch;
      onWorkspaceChange?: (cb: (uris: string[]) => void) => () => void;
    };
  }
}

const TEMPLATES: Record<string, string> = {
  swimlane: `swimlane-beta LR
  subgraph User
    A[发起需求] --> B[审阅卡片]
  end
  subgraph Agent
    A --> C[Pele 渲染]
    C --> B
  end`,
  agentflow: `agentflow-beta
  prompt[User Prompt] --> planner[Orchestrator]
  planner --> mcp[antigravity-pele MCP]
  mcp --> card[Inline Flexoki Card]`,
  gantt: `gantt
  title Antigravity Pele 研发里程碑
  dateFormat YYYY-MM-DD
  section 内核
    Flexoki 主题引擎 :done, a1, 2026-11-01, 2d
    33 类图表封装   :done, a2, after a1, 2d
  section 四大形态
    CLI & MCP      :active, b1, after a2, 3d
    Pele Studio    :b2, after b1, 3d`,
  mindmap: `mindmap
  root((Antigravity Pele))
    33 类图表
      23 种 Mermaid 12.1
      10 种 Pele 扩展
    四大形态
      内联工作卡
      Pele Studio
      Rules 自动接管
      agy-pele CLI`,
  sequence: `sequenceDiagram
  autonumber
  participant U as User
  participant A as Agent
  participant P as Pele MCP
  U->>A: 生成系统架构图
  A->>P: pele_render_card(code)
  P-->>A: <agent-embed src="file:///...">
  A-->>U: 内联渲染卡片`,
  railroad: `railroad-ebnf-beta
  command = "agy-pele" , ( "render" | "check" | "extract" | "preview" ) , { option } ;`,
  venn: `venn-beta
  set A["Mermaid 12.1 (23)"]
  set B["Pele Extended (10)"]
  union A,B["33 Diagram Types"]`,
  cynefin: `cynefin-beta
  clear "Known Knowns"
  complicated "Analyze & Plan"
  complex "Probe & Sense"
  chaotic "Act Immediately"`,
};

(() => {
  const appEl = document.getElementById('studio-app') as HTMLElement | null;
  const toolbar = document.getElementById('studio-toolbar') as HTMLElement | null;
  const statusEl = document.getElementById('studio-status') as HTMLElement | null;
  const editor = document.getElementById('studio-editor') as HTMLTextAreaElement | null;
  const diagEl = document.getElementById('editor-diag') as HTMLElement | null;
  const stageEl = document.getElementById('preview-stage') as HTMLElement | null;
  const badgeEl = document.getElementById('active-badge') as HTMLElement | null;
  const filePathEl = document.getElementById('active-file-path') as HTMLElement | null;
  const dirtyEl = document.getElementById('dirty-indicator') as HTMLElement | null;
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement | null;
  const zoomLabel = document.getElementById('zoom-label') as HTMLElement | null;
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
  const templateSelect = document.getElementById('template-select') as HTMLSelectElement | null;
  const pngScaleSelect = document.getElementById('png-scale') as HTMLSelectElement | null;
  const convList = document.getElementById('conv-list') as HTMLElement | null;
  const wsList = document.getElementById('ws-list') as HTMLElement | null;
  const convCount = document.getElementById('conv-count') as HTMLElement | null;
  const wsCount = document.getElementById('ws-count') as HTMLElement | null;
  const scratchBtn = document.getElementById('scratchpad-btn') as HTMLButtonElement | null;
  const sidebarToggle = document.getElementById('toggle-sidebar') as HTMLButtonElement | null;

  if (!appEl || !editor || !stageEl || !diagEl || !saveBtn) return;

  const editorEl = editor;

  let workspaceUris: string[] = [];
  let items: StudioItem[] = [];
  let activeId = 'scratchpad';
  let scratchCode = TEMPLATES.swimlane;
  let savedCode = scratchCode;
  let lastEtag = '';
  let lastFocusedFromServer = '';
  let mounted: Mounted | null = null;
  let stopThemeObserver: (() => void) | null = null;

  const sidecarFetch = (url: string, init?: RequestInit): Promise<Response> => {
    if (window.sidecar?.fetch) {
      return window.sidecar.fetch(url, init);
    }
    return fetch(url, init);
  };

  const getActiveItem = (): StudioItem | null => {
    if (activeId === 'scratchpad') return null;
    return items.find((item) => item.id === activeId) ?? null;
  };

  const announce = (msg: string) => {
    if (statusEl) statusEl.textContent = msg;
  };

  const updateSaveUi = () => {
    const active = getActiveItem();
    const isDirty = editor.value !== savedCode;
    if (dirtyEl) dirtyEl.classList.toggle('hidden', !active || !isDirty);
    const canSaveNow = Boolean(active && active.canSave && isDirty);
    saveBtn.setAttribute('aria-disabled', canSaveNow ? 'false' : 'true');
  };

  const updateZoomLabel = () => {
    if (!zoomLabel) return;
    const z = mounted?.zoom?.scale ?? 1;
    zoomLabel.textContent = `${Math.round(z * 100)}%`;
  };

  const renderDiagramNow = (code: string) => {
    if (!mounted) {
      mounted = mount(stageEl, code, {
        responsive: true,
        padding: 16,
        zoom: { always: true, controls: false, maxScale: 5 },
        onRender: (res) => {
          const detected = detectType(editorEl.value) || res.type;
          if (badgeEl) badgeEl.textContent = detected;
          diagEl.className = 'editor-diag is-ok';
          diagEl.textContent = `Rendered ${detected} (${res.width}×${res.height})`;
          requestAnimationFrame(updateZoomLabel);
        },
        onError: (err) => {
          diagEl.className = 'editor-diag is-err';
          if (err instanceof PeleError) {
            diagEl.textContent = `Line ${err.line}:${err.column} [${err.code}] ${err.message}`;
          } else {
            diagEl.textContent = err instanceof Error ? err.message : String(err);
          }
        },
      });
    } else {
      mounted.update(code);
    }
    updateZoomLabel();
  };

  const selectEntry = (id: string, forceReplaceEditor = true) => {
    activeId = id;
    scratchBtn?.classList.toggle('is-active', id === 'scratchpad');

    const active = getActiveItem();
    if (!active) {
      activeId = 'scratchpad';
      if (forceReplaceEditor) {
        editor.value = scratchCode;
        savedCode = scratchCode;
      }
      if (filePathEl) {
        filePathEl.textContent = 'Scratchpad (内存草稿，不修改任何磁盘文件)';
      }
    } else {
      if (forceReplaceEditor) {
        editor.value = active.code;
        savedCode = active.code;
      }
      if (filePathEl) {
        filePathEl.textContent = active.filePath
          ? `${active.filePath}${active.blockIndex !== undefined ? ` #${active.blockIndex + 1}` : ''}`
          : active.title;
      }
    }

    renderNavLists();
    updateSaveUi();
    renderDiagramNow(editor.value);
  };

  const createNavButton = (item: StudioItem): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-item${item.id === activeId ? ' is-active' : ''}`;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'nav-title';
    titleSpan.textContent = item.title;
    const subSpan = document.createElement('span');
    subSpan.className = 'nav-sub';
    subSpan.textContent = item.subtitle || item.kind;
    btn.append(titleSpan, subSpan);
    btn.addEventListener('click', () => selectEntry(item.id, true));
    return btn;
  };

  const renderNavLists = () => {
    const convItems = items.filter((i) => i.source === 'conversation');
    const wsItems = items.filter((i) => i.source === 'workspace');
    if (convCount) convCount.textContent = String(convItems.length);
    if (wsCount) wsCount.textContent = String(wsItems.length);

    if (convList) {
      convList.innerHTML = '';
      if (convItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nav-sub';
        empty.textContent = '暂无会话图表';
        convList.append(empty);
      } else {
        convItems.forEach((i) => convList.append(createNavButton(i)));
      }
    }
    if (wsList) {
      wsList.innerHTML = '';
      if (wsItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nav-sub';
        empty.textContent = '当前工作区未发现 Mermaid 块';
        wsList.append(empty);
      } else {
        wsItems.forEach((i) => wsList.append(createNavButton(i)));
      }
    }
  };

  const STUDIO_THEME_STORAGE_KEY = 'pele-studio-theme';

  const applyThemeMode = (rawMode: string) => {
    const mode = normalizeThemeMode(rawMode);
    appEl.setAttribute('data-theme-mode', mode);
    if (themeSelect && themeSelect.value !== mode) {
      themeSelect.value = mode;
    }
    stopThemeObserver?.();
    stopThemeObserver = null;
    if (mode === 'host') {
      appEl.removeAttribute('data-resolved-theme');
      return;
    }
    stopThemeObserver = observeHostAndSystemTheme(appEl, getFixedSchemeForTheme(mode));
  };

  let initialTheme = 'flexoki';
  try {
    const savedTheme = localStorage.getItem(STUDIO_THEME_STORAGE_KEY);
    if (savedTheme) initialTheme = normalizeThemeMode(savedTheme);
  } catch {
    // Ignore storage access restrictions
  }
  applyThemeMode(initialTheme);

  if (toolbar) wireToolbarRovingFallback(toolbar);
  wireCopyButtons(statusEl);

  sidebarToggle?.addEventListener('click', () => {
    const collapsed = appEl.classList.toggle('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  scratchBtn?.addEventListener('click', () => selectEntry('scratchpad', true));

  templateSelect?.addEventListener('change', () => {
    const key = templateSelect.value;
    if (!key || !TEMPLATES[key]) return;
    templateSelect.value = '';
    if (activeId !== 'scratchpad') {
      activeId = 'scratchpad';
      scratchBtn?.classList.add('is-active');
      if (filePathEl) {
        filePathEl.textContent = 'Scratchpad (内存草稿，不修改任何磁盘文件)';
      }
    }
    scratchCode = TEMPLATES[key];
    editor.value = scratchCode;
    savedCode = scratchCode;
    renderNavLists();
    updateSaveUi();
    renderDiagramNow(editor.value);
  });

  themeSelect?.addEventListener('change', () => {
    const mode = normalizeThemeMode(themeSelect.value);
    applyThemeMode(mode);
    try {
      localStorage.setItem(STUDIO_THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage access restrictions
    }
    const label = themeSelect.selectedOptions[0]?.textContent || mode;
    announce(`已切换配色：${label}`);
  });

  const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-view]'));
  for (const btn of viewButtons) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.view;
      if (!mode) return;
      appEl.setAttribute('data-view-mode', mode);
      viewButtons.forEach((b) =>
        b.setAttribute('aria-pressed', b.dataset.view === mode ? 'true' : 'false')
      );
      requestAnimationFrame(() => mounted?.refresh());
    });
  }

  document.getElementById('zoom-in')?.addEventListener('click', () => {
    mounted?.zoom?.zoomBy(1.2);
    updateZoomLabel();
  });
  document.getElementById('zoom-out')?.addEventListener('click', () => {
    mounted?.zoom?.zoomBy(1 / 1.2);
    updateZoomLabel();
  });
  document.getElementById('zoom-reset')?.addEventListener('click', () => {
    mounted?.zoom?.reset();
    updateZoomLabel();
  });

  editor.addEventListener('input', () => {
    if (activeId === 'scratchpad') {
      scratchCode = editor.value;
      savedCode = scratchCode;
    }
    updateSaveUi();
    renderDiagramNow(editor.value);
  });

  saveBtn.addEventListener('click', async () => {
    if (saveBtn.getAttribute('aria-disabled') === 'true') return;
    const active = getActiveItem();
    if (!active || !active.filePath) return;

    announce('Saving...');
    try {
      const res = await sidecarFetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: active.kind,
          filePath: active.filePath,
          blockIndex: active.blockIndex,
          expectedHash: active.sourceHash,
          newCode: editor.value,
          title: active.title,
          theme: themeSelect?.value || 'flexoki',
          conversationId: window.sidecar?.conversationId || '',
          workspaces: workspaceUris,
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        updatedHash?: string;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        announce(payload.error || `Save failed (${res.status})`);
        return;
      }
      active.code = editor.value;
      if (payload.updatedHash) active.sourceHash = payload.updatedHash;
      savedCode = editor.value;
      updateSaveUi();
      announce('Saved');
      lastEtag = '';
      void pollState();
    } catch (err) {
      announce(err instanceof Error ? err.message : 'Save failed');
    }
  });

  document.getElementById('export-svg')?.addEventListener('click', () => {
    const svg = stageEl.querySelector('svg');
    if (!svg) return;
    const title = getActiveItem()?.title || 'pele-diagram';
    downloadSvgFromElement(svg, appEl, title.toLowerCase().replace(/[^a-z0-9_-]+/gi, '-') || 'diagram', true);
    announce('SVG exported');
  });

  document.getElementById('export-png')?.addEventListener('click', () => {
    const svg = stageEl.querySelector('svg');
    if (!svg) return;
    const scale = parseInt(pngScaleSelect?.value || '2', 10) || 2;
    const title = getActiveItem()?.title || 'pele-diagram';
    void downloadPngFromElement(
      svg,
      appEl,
      title.toLowerCase().replace(/[^a-z0-9_-]+/gi, '-') || 'diagram',
      scale,
      true
    )
      .then(() => announce(`PNG (${scale}x) exported`))
      .catch(() => announce('PNG export failed'));
  });

  async function pollState(): Promise<void> {
    try {
      const convId = window.sidecar?.conversationId || new URLSearchParams(location.search).get('conversationId') || '';
      const qs = new URLSearchParams();
      if (convId) qs.set('conversationId', convId);
      if (workspaceUris.length > 0) qs.set('workspaces', workspaceUris.join(','));
      if (lastEtag) qs.set('etag', lastEtag);

      const res = await sidecarFetch(`/api/state?${qs.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as StateResponse;
      if (data.unchanged) return;
      lastEtag = data.etag;
      items = data.items || [];
      renderNavLists();

      if (data.focusedId && data.focusedId !== lastFocusedFromServer) {
        const target = items.find((i) => i.id === data.focusedId);
        if (target) {
          lastFocusedFromServer = data.focusedId;
          selectEntry(target.id, editorEl.value === savedCode);
          return;
        }
      }

      const active = getActiveItem();
      if (active && editorEl.value === savedCode && active.code !== savedCode) {
        editorEl.value = active.code;
        savedCode = active.code;
        updateSaveUi();
        renderDiagramNow(editorEl.value);
      } else if (activeId === 'scratchpad' && items.length > 0 && !lastFocusedFromServer) {
        const first = items[0];
        lastFocusedFromServer = first.id;
        selectEntry(first.id, true);
      }
    } catch {
      // Ignore transient polling failures
    }
  }

  if (window.sidecar?.onWorkspaceChange) {
    window.sidecar.onWorkspaceChange((uris) => {
      workspaceUris = Array.isArray(uris) ? uris : [];
      lastEtag = '';
      void pollState();
    });
  }

  selectEntry('scratchpad', true);
  void pollState();
  window.setInterval(() => void pollState(), 2000);
})();
