const PELE_VAR_NAMES = [
  '--pele-bg',
  '--pele-fg',
  '--pele-muted',
  '--pele-line',
  '--pele-surface',
  '--pele-surface-alt',
  '--pele-border',
  '--pele-accent',
  '--pele-critical',
  '--pele-error',
  '--pele-fg-on-dark',
  '--pele-fg-on-light',
  '--pele-font',
  '--pele-font-mono',
  '--pele-radius',
  '--pele-series-1',
  '--pele-series-2',
  '--pele-series-3',
  '--pele-series-4',
  '--pele-series-5',
  '--pele-series-6',
  '--pele-series-7',
  '--pele-series-8',
];

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resolveSvgDimensions(svgEl: SVGSVGElement): { width: number; height: number } {
  const vb = svgEl.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { width: Math.ceil(vb.width), height: Math.ceil(vb.height) };
  }
  const attrW = parseFloat(svgEl.getAttribute('width') || '');
  const attrH = parseFloat(svgEl.getAttribute('height') || '');
  if (attrW > 0 && attrH > 0) {
    return { width: Math.ceil(attrW), height: Math.ceil(attrH) };
  }
  const rect = svgEl.getBoundingClientRect();
  return {
    width: Math.max(100, Math.ceil(rect.width || 600)),
    height: Math.max(80, Math.ceil(rect.height || 400)),
  };
}

/**
 * Clones an `<svg>` element and materializes all active `--pele-*` CSS custom
 * properties onto the clone so standalone SVG/PNG exports match what is on screen.
 */
export function serializeResolvedSvg(
  svgEl: SVGSVGElement,
  themeSourceEl: Element,
  includeSolidBackground: boolean
): { xml: string; width: number; height: number } {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const computed = getComputedStyle(themeSourceEl);
  const { width, height } = resolveSvgDimensions(svgEl);

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const resolvedPairs: string[] = [];
  let resolvedBg = '#fffcf0';
  for (const name of PELE_VAR_NAMES) {
    const val = computed.getPropertyValue(name).trim();
    if (val) {
      resolvedPairs.push(`${name}:${val}`);
      if (name === '--pele-bg') resolvedBg = val;
    }
  }
  const prevStyle = (clone.getAttribute('style') || '').replace(/^;+|;+$/g, '');
  const resolvedStyle = resolvedPairs.join(';');
  const combinedStyle = prevStyle && resolvedStyle
    ? `${prevStyle};${resolvedStyle}`
    : prevStyle || resolvedStyle;
  clone.setAttribute('style', combinedStyle);

  if (includeSolidBackground) {
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('rx', '8');
    bgRect.setAttribute('fill', resolvedBg);
    clone.insertBefore(bgRect, clone.firstChild);
  }

  const xml = new XMLSerializer().serializeToString(clone);
  return { xml, width, height };
}

export function downloadSvgFromElement(
  svgEl: SVGSVGElement,
  themeSourceEl: Element,
  filenameBase: string,
  includeSolidBackground = true
): void {
  const { xml } = serializeResolvedSvg(svgEl, themeSourceEl, includeSolidBackground);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  triggerBlobDownload(blob, `${filenameBase}.svg`);
}

export function downloadPngFromElement(
  svgEl: SVGSVGElement,
  themeSourceEl: Element,
  filenameBase: string,
  scale = 2,
  includeSolidBackground = true
): Promise<void> {
  const { xml, width, height } = serializeResolvedSvg(
    svgEl,
    themeSourceEl,
    includeSolidBackground
  );
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG encoding failed'));
          return;
        }
        triggerBlobDownload(blob, `${filenameBase}-${scale}x.png`);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load SVG into Image for PNG export'));
    img.src = dataUrl;
  });
}

function legacyCopy(text: string): boolean {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0;pointer-events:none';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
  }
}

/**
 * Attaches copy-button behavior using Invoker Commands (`command="--copy"`)
 * when supported, or a single click delegation fallback otherwise, with an
 * external `role="status"` live region and synchronous `execCommand` fallback
 * for `file:///` origins.
 */
export function wireCopyButtons(statusEl: HTMLElement | null): void {
  const timers = new WeakMap<HTMLElement, number>();
  let lastMessage = '';

  function report(button: HTMLElement, ok: boolean): void {
    const tip = statusEl || (button.parentElement?.querySelector('.tip') as HTMLElement | null);
    window.clearTimeout(timers.get(button));
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    let message = ok ? 'Copied' : 'Copy failed';
    if (message === lastMessage) message += '\u00A0';
    lastMessage = message;
    if (tip) tip.textContent = '';
    void button.offsetWidth;
    button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
    if (tip) {
      requestAnimationFrame(() => {
        tip.textContent = message;
      });
    }
    timers.set(
      button,
      window.setTimeout(() => {
        button.removeAttribute('data-copied');
        button.removeAttribute('data-failed');
        if (tip) tip.textContent = '';
      }, 2000)
    );
  }

  async function copyFromTarget(button: HTMLElement, target: HTMLElement): Promise<void> {
    const text =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? target.value
        : (target.textContent || '').trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        report(button, true);
        return;
      }
    } catch {
      // Fall through to legacyCopy on file:/// or restricted frames
    }
    report(button, legacyCopy(text));
  }

  if ('CommandEvent' in window) {
    document.addEventListener(
      'command',
      (event: Event) => {
        const cmdEvent = event as Event & {
          command?: string;
          source?: Element | null;
          target?: EventTarget | null;
        };
        if (
          cmdEvent.command === '--copy' &&
          cmdEvent.source instanceof HTMLElement &&
          cmdEvent.target instanceof HTMLElement
        ) {
          void copyFromTarget(cmdEvent.source, cmdEvent.target);
        }
      },
      true
    );
  } else {
    document.addEventListener('click', (event) => {
      const targetEl = event.target instanceof Element ? event.target : null;
      const button = targetEl?.closest('button[command="--copy"]');
      if (!(button instanceof HTMLElement)) return;
      const targetId = button.getAttribute('commandfor');
      const target = targetId ? document.getElementById(targetId) : null;
      if (target) void copyFromTarget(button, target);
    });
  }
}

/**
 * Installs a roving-tabindex fallback ONLY when the browser lacks native
 * `focusgroup` support.
 */
export function wireToolbarRovingFallback(toolbar: HTMLElement): void {
  if ('focusGroup' in HTMLElement.prototype) return;

  const getItems = (): HTMLElement[] =>
    Array.from(toolbar.querySelectorAll<HTMLElement>('button, select'));

  const syncInitial = () => {
    const items = getItems();
    items.forEach((item, idx) => {
      item.tabIndex = idx === 0 ? 0 : -1;
    });
  };
  syncInitial();

  toolbar.addEventListener('focusin', (event) => {
    const items = getItems();
    const target = event.target as HTMLElement | null;
    if (!target || !items.includes(target)) return;
    items.forEach((item) => {
      item.tabIndex = item === target ? 0 : -1;
    });
  });

  toolbar.addEventListener('keydown', (event) => {
    const items = getItems();
    if (items.length === 0) return;
    const current = document.activeElement as HTMLElement | null;
    const idx = current ? items.indexOf(current) : -1;
    if (idx === -1) return;

    const vertical = toolbar.getAttribute('aria-orientation') === 'vertical';
    const rtl = getComputedStyle(toolbar).direction === 'rtl';
    let nextIdx: number | null = null;

    if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = items.length - 1;
    else if (!vertical && event.key === 'ArrowRight') nextIdx = (idx + (rtl ? -1 : 1) + items.length) % items.length;
    else if (!vertical && event.key === 'ArrowLeft') nextIdx = (idx + (rtl ? 1 : -1) + items.length) % items.length;
    else if (vertical && event.key === 'ArrowDown') nextIdx = (idx + 1) % items.length;
    else if (vertical && event.key === 'ArrowUp') nextIdx = (idx - 1 + items.length) % items.length;

    if (nextIdx !== null) {
      event.preventDefault();
      const next = items[nextIdx];
      items.forEach((item) => {
        item.tabIndex = item === next ? 0 : -1;
      });
      next.focus();
    }
  });
}

/**
 * Subscribes to both host theme class changes and `prefers-color-scheme`
 * media query changes so components adapt immediately on theme switches.
 */
export function observeHostAndSystemTheme(
  targetEl: HTMLElement,
  fixedTheme?: 'light' | 'dark' | 'flexoki-light' | 'flexoki-dark' | 'gov-light' | 'gov-dark' | null,
  onChange?: (resolved: 'light' | 'dark') => void
): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');

  const resolve = (): 'light' | 'dark' => {
    if (fixedTheme === 'light' || fixedTheme === 'flexoki-light' || fixedTheme === 'gov-light') {
      return 'light';
    }
    if (fixedTheme === 'dark' || fixedTheme === 'flexoki-dark' || fixedTheme === 'gov-dark') {
      return 'dark';
    }
    const root = document.documentElement;
    if (root.classList.contains('dark')) return 'dark';
    if (root.classList.contains('light')) return 'light';
    return mql.matches ? 'dark' : 'light';
  };

  const apply = () => {
    const mode = resolve();
    targetEl.setAttribute('data-resolved-theme', mode);
    onChange?.(mode);
  };

  apply();
  const handleMedia = () => apply();
  mql.addEventListener('change', handleMedia);
  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });

  return () => {
    mql.removeEventListener('change', handleMedia);
    observer.disconnect();
  };
}
