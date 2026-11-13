import {
  downloadPngFromElement,
  downloadSvgFromElement,
  observeHostAndSystemTheme,
  wireCopyButtons,
  wireToolbarRovingFallback,
} from '../core/svg-export-client.js';

interface CardMeta {
  title: string;
  slug: string;
  diagramType: string;
  width: number;
  height: number;
  theme: string;
  heightMode?: 'auto' | 'compact' | 'fixed';
  fixedHeight?: number;
  maxHeight?: number;
}

(() => {
  const card = document.getElementById('pele-card');
  const workspace = document.getElementById('pele-workspace');
  const stage = document.getElementById('pele-stage');
  const panLayer = document.getElementById('pele-pan-layer');
  const zoomLabel = document.getElementById('pele-zoom-label');
  const toolbar = document.getElementById('pele-toolbar');
  const statusEl = document.getElementById('pele-status');
  const metaEl = document.getElementById('pele-card-meta');
  const codeEl = document.getElementById('pele-source-code');
  const heightToggleBtn = document.getElementById('pele-height-toggle') as HTMLButtonElement | null;
  const fullscreenBtn = document.getElementById('pele-fullscreen-toggle') as HTMLButtonElement | null;

  if (!card || !stage || !panLayer) return;
  const headerEl = card.querySelector('.pele-header') as HTMLElement | null;

  let meta: CardMeta = {
    title: 'diagram',
    slug: 'diagram',
    diagramType: 'flowchart',
    width: 600,
    height: 300,
    theme: 'flexoki',
    heightMode: 'auto',
    maxHeight: 1400,
  };
  try {
    if (metaEl?.textContent) meta = JSON.parse(metaEl.textContent) as CardMeta;
  } catch {
    // Keep defaults
  }

  const fixedTheme =
    meta.theme === 'flexoki-light'
      ? 'flexoki-light'
      : meta.theme === 'flexoki-dark'
        ? 'flexoki-dark'
        : null;
  if (meta.theme !== 'host') {
    observeHostAndSystemTheme(card, fixedTheme);
  }

  if (toolbar) wireToolbarRovingFallback(toolbar);
  wireCopyButtons(statusEl);

  const svg = panLayer.querySelector('svg');
  let autoHeight = (meta.heightMode ?? 'auto') === 'auto';
  const maxAutoHeight = Math.min(4000, Math.max(200, meta.maxHeight ?? 1400));
  const compactOrFixedCap =
    meta.heightMode === 'fixed' && typeof meta.fixedHeight === 'number' ? meta.fixedHeight : 416;
  let currentViewMode = card.getAttribute('data-view-mode') || 'diagram';
  let lastAppliedHeight = workspace?.clientHeight || 0;

  let scale = 1;
  let fitScale = 1;
  let tx = 0;
  let ty = 0;

  const syncWorkspaceHeight = () => {
    if (!workspace) return;
    if (document.fullscreenElement === card) {
      const headerH = headerEl?.offsetHeight || 42;
      const fsHeight = Math.max(200, window.innerHeight - headerH);
      workspace.style.height = `${fsHeight}px`;
      lastAppliedHeight = fsHeight;
      return;
    }
    const totalW = Math.max(160, workspace.clientWidth || card.clientWidth || 620);
    const stageW =
      currentViewMode === 'split'
        ? Math.max(120, Math.floor(totalW * (1.35 / 2.35)) - 24)
        : Math.max(120, totalW - 24);
    const widthScale = Math.min(1, Math.max(0.2, stageW / Math.max(1, meta.width)));
    const naturalDiagramHeight = Math.ceil(meta.height * widthScale + 28);

    let targetHeight: number;
    if (!autoHeight) {
      if (meta.heightMode === 'fixed' && typeof meta.fixedHeight === 'number') {
        targetHeight = compactOrFixedCap;
      } else {
        targetHeight = Math.min(416, Math.max(140, naturalDiagramHeight));
      }
    } else if (currentViewMode === 'code' && codeEl) {
      const codeH = Math.ceil((codeEl.scrollHeight || codeEl.offsetHeight || 160) + 28);
      targetHeight = Math.min(maxAutoHeight, Math.max(120, codeH));
    } else {
      targetHeight = Math.min(maxAutoHeight, Math.max(120, naturalDiagramHeight));
    }

    if (Math.abs(targetHeight - lastAppliedHeight) > 1) {
      workspace.style.height = `${targetHeight}px`;
      lastAppliedHeight = targetHeight;
    }
  };

  const updateTransform = () => {
    panLayer.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(4)})`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }
  };

  const fitToStage = () => {
    const sw = Math.max(120, stage.clientWidth - 24);
    const sh = Math.max(120, stage.clientHeight - 24);
    const nw = Math.max(1, meta.width);
    const nh = Math.max(1, meta.height);
    const ratio = Math.min(1, sw / nw, sh / nh);
    fitScale = Math.max(0.2, Math.min(1, ratio));
    scale = fitScale;
    tx = (stage.clientWidth - nw * scale) / 2;
    ty = (stage.clientHeight - nh * scale) / 2;
    updateTransform();
  };

  const zoomAroundCenter = (factor: number) => {
    const nextScale = Math.max(0.2, Math.min(4, scale * factor));
    const cx = stage.clientWidth / 2;
    const cy = stage.clientHeight / 2;
    const ratio = nextScale / scale;
    tx = cx - (cx - tx) * ratio;
    ty = cy - (cy - ty) * ratio;
    scale = nextScale;
    updateTransform();
  };

  syncWorkspaceHeight();
  fitToStage();

  let lastCardWidth = card.clientWidth;
  let prevCardWidth = 0;
  const ro = new ResizeObserver(() => {
    const w = card.clientWidth;
    if (w === lastCardWidth) return;
    // Guard against <=20px scrollbar-appearance width oscillation
    if (Math.abs(w - prevCardWidth) <= 1 && Math.abs(w - lastCardWidth) <= 20) {
      return;
    }
    prevCardWidth = lastCardWidth;
    lastCardWidth = w;
    const wasFitted = Math.abs(scale - fitScale) < 0.02;
    syncWorkspaceHeight();
    if (wasFitted && currentViewMode !== 'code') fitToStage();
  });
  ro.observe(card);

  // Pointer drag pan
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startTx = tx;
    startTy = ty;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    updateTransform();
  });

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('is-dragging');
    try {
      stage.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const rect = stage.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const nextScale = Math.max(0.2, Math.min(4, scale * factor));
      const ratio = nextScale / scale;
      tx = cx - (cx - tx) * ratio;
      ty = cy - (cy - ty) * ratio;
      scale = nextScale;
      updateTransform();
    },
    { passive: false }
  );

  // View mode toggles (diagram / code / split)
  const viewButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-view]'));
  const setViewMode = (mode: string) => {
    currentViewMode = mode;
    card.setAttribute('data-view-mode', mode);
    for (const btn of viewButtons) {
      btn.setAttribute('aria-pressed', btn.dataset.view === mode ? 'true' : 'false');
    }
    syncWorkspaceHeight();
    requestAnimationFrame(() => {
      syncWorkspaceHeight();
      if (mode !== 'code') fitToStage();
    });
  };
  for (const btn of viewButtons) {
    btn.addEventListener('click', () => {
      if (btn.dataset.view) setViewMode(btn.dataset.view);
    });
  }

  heightToggleBtn?.addEventListener('click', () => {
    autoHeight = !autoHeight;
    heightToggleBtn.setAttribute('aria-pressed', autoHeight ? 'true' : 'false');
    syncWorkspaceHeight();
    if (currentViewMode !== 'code') fitToStage();
  });

  document.getElementById('pele-zoom-in')?.addEventListener('click', () => zoomAroundCenter(1.2));
  document.getElementById('pele-zoom-out')?.addEventListener('click', () => zoomAroundCenter(1 / 1.2));
  document.getElementById('pele-zoom-reset')?.addEventListener('click', () => fitToStage());

  const announce = (msg: string) => {
    if (statusEl) statusEl.textContent = msg;
  };

  fullscreenBtn?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (typeof card.requestFullscreen === 'function') {
      void card.requestFullscreen().catch(() => {
        announce('当前内嵌框限制系统全屏，请点击卡片下方「全高卡片视图」或打开 Pele Studio');
      });
    } else {
      announce('请点击卡片下方「全高卡片视图」或打开 Pele Studio');
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const isFs = document.fullscreenElement === card;
    fullscreenBtn?.setAttribute('aria-pressed', isFs ? 'true' : 'false');
    syncWorkspaceHeight();
    if (currentViewMode !== 'code') fitToStage();
  });

  document.getElementById('pele-export-svg')?.addEventListener('click', () => {
    if (!svg) return;
    downloadSvgFromElement(svg, card, meta.slug || 'diagram', true);
    announce('SVG downloaded');
  });

  document.getElementById('pele-export-png')?.addEventListener('click', () => {
    if (!svg) return;
    void downloadPngFromElement(svg, card, meta.slug || 'diagram', 2, true)
      .then(() => announce('PNG (2x) downloaded'))
      .catch(() => announce('PNG export failed'));
  });
})();
