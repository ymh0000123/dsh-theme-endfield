/**
 * dsh-theme-endfield — Edge Intelligence Theme (browser client bundle)
 * 还原自《明日方舟：终末地》（Arknights: Endfield）官网的「工业编辑风」。
 * 参考：https://endfield.hypergryph.com
 *
 * Client 半部：
 *   1) theme.overrideTokens —— 覆盖主题令牌（亮/暗双色），映射终末地官网色板；
 *   2) insertCss —— 注入字体栈、信号黄强调、直角化、去蓝、hover 反色等全局样式。
 *      （动态插件环境走 styles.insert；安装为独立 bundle 时直接注入 <style> 到 head。）
 *   3) 设置页「主题圆角」开关 —— 直角（默认）/ 圆角（恢复应用原生圆角）切换，
 *      localStorage 持久化（key: dsh-theme-endfield-radius）。
 *
 * 由 dsh-client-modules 以 /plugins/theme-endfield/client.js 形式加载；
 * 通过 `dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield` 安装挂载。
 */
window.__ModuleLoader__.load({
	id: "dsh-theme-endfield",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

function insertCss(css) {
  // Dynamic Cordis runner provides the `styles` global; standalone bundle does not.
  if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
    return styles.insert(css)
  }
  // Idempotency: the installed bundle can be applied more than once (boot loader +
  // cordis composition both mount it). Never stack duplicate theme stylesheets.
  document.querySelectorAll('style[data-plugin="dsh-theme-endfield"]').forEach((old) => old.remove())
  const el = document.createElement('style')
  el.setAttribute('data-plugin', 'dsh-theme-endfield')
  el.textContent = css
  document.head.appendChild(el)
  return () => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }
}

function apply(ctx) {
    // Idempotency: the installed bundle can be applied more than once (boot loader +
    // cordis composition both mount it). Only the first application owns tokens/styles;
    // duplicate overrideTokens would replace the layer and break the toggle's dispose.
    if (typeof window !== 'undefined' && window.__dshThemeEndfieldApplied) return
    if (typeof window !== 'undefined') window.__dshThemeEndfieldApplied = true

    const theme = ctx.get('theme')
    if (theme === undefined) return

    const RADIUS_KEY = 'dsh-theme-endfield-radius'
    const ENABLED_KEY = 'dsh-theme-endfield-enabled'
    const isEnabled = () => (typeof localStorage !== 'undefined' && localStorage.getItem(ENABLED_KEY)) !== '0'
    const syncRadiusMode = () => {
      const mode = (typeof localStorage !== 'undefined' && localStorage.getItem(RADIUS_KEY)) || 'square'
      if (mode === 'round') document.body.classList.add('theme-endfield-round')
      else document.body.classList.remove('theme-endfield-round')
    }

    let disposeToken = () => {}
    let disposeStyles = () => {}
    let mounted = false
    const mount = () => {
      if (mounted) return
      mounted = true
      disposeToken = theme.overrideTokens('edge-intelligence-theme', {
      '--dsw-alias-bg-base': {
        light: '#e8e8e2',
        dark: '#101110',
      },
      '--dsw-alias-bg-layer-1': {
        light: '#f2f2ec',
        dark: '#181a18',
      },
      '--dsw-alias-bg-layer-2': {
        light: '#dcddd6',
        dark: '#1e201d',
      },
      '--dsw-alias-bg-overlay': {
        light: '#f2f2ec',
        dark: '#1c1e1c',
      },
      '--dsw-alias-border-l1': {
        light: '#d8d9d5',
        dark: '#343633',
      },
      '--dsw-alias-border-l2': {
        light: '#b6b8b3',
        dark: '#4a4d49',
      },
      '--dsw-alias-brand-primary': {
        light: '#101110',
        dark: '#fff500',
      },
      '--dsw-alias-label-primary': {
        light: '#101110',
        dark: '#f5f5f0',
      },
      '--dsw-alias-label-secondary': {
        light: '#4a4c48',
        dark: '#898d89',
      },
      '--dsw-alias-state-error-primary': {
        light: '#ff3b30',
        dark: '#ff6b61',
      },
      '--dsw-alias-state-success-primary': {
        light: '#2f9e44',
        dark: '#4fbf5c',
      },
      '--dsw-alias-state-warn-primary': {
        light: '#d9822b',
        dark: '#ffb700',
      },
      '--dsw-specific-sidebar-fill': {
        light: '#e8e8e2',
        dark: '#101110',
      },
    })

    disposeStyles = insertCss(`
      :root {
        --dsw-font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
        --ds-font-family-code: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
        --edge-signal: #fff500;
        --edge-signal-dim: rgba(255, 245, 0, 0.7);
        --edge-paper: var(--dsw-alias-bg-base);
        --edge-panel: var(--dsw-alias-bg-layer-1);
        --edge-line: var(--dsw-alias-border-l1);
        --edge-soft: var(--dsw-alias-bg-layer-2);
      }
      body {
        font-feature-settings: "tnum" 1, "ss01" 1;
        font-variant-ligatures: no-common-ligatures;
      }
      ::selection {
        color: #000;
        background: var(--edge-signal, #fff500);
      }
      /* Square corners (default): zero EVERY classed element, then restore circles/pills below.
         body.theme-endfield-round disables all of this and restores app-native rounding. */
      body:not(.theme-endfield-round) button,
      body:not(.theme-endfield-round) input,
      body:not(.theme-endfield-round) textarea,
      body:not(.theme-endfield-round) select,
      body:not(.theme-endfield-round) [role='button'],
      body:not(.theme-endfield-round) [role='dialog'],
      body:not(.theme-endfield-round) [role='menu'],
      body:not(.theme-endfield-round) [role='tooltip'],
      body:not(.theme-endfield-round) [role='tab'] {
        border-radius: 0 !important;
      }
      body:not(.theme-endfield-round) [class] {
        border-radius: 0 !important;
      }
      body:not(.theme-endfield-round) [class*='avatar'],
      body:not(.theme-endfield-round) [class*='Avatar'],
      body:not(.theme-endfield-round) [class*='spinner'],
      body:not(.theme-endfield-round) [class*='Spinner'],
      body:not(.theme-endfield-round) [class*='dot'],
      body:not(.theme-endfield-round) [class*='Dot'],
      body:not(.theme-endfield-round) [class*='actionButton' i],
      body:not(.theme-endfield-round) [class$='_iconButton'] {
        border-radius: 50% !important;
      }
      body:not(.theme-endfield-round) [class*='scrollbar'],
      body:not(.theme-endfield-round) [class*='Scrollbar'] {
        border-radius: 0 !important;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: var(--edge-line) transparent;
      }
      /* ---------- Light mode: deepen tertiary/secondary labels for icon visibility ---------- */
      body:not([data-ds-dark-theme]) {
        --dsw-alias-label-tertiary: #6a6d68;
        --dsw-alias-label-caption: #5a5d58;
        --dsw-alias-label-dimmed: #9a9d98;
        --edge-btn-muted: #dcddd6;
      }
      /* ---------- Neutralize remaining DeepSeek brand blues ---------- */
      body {
        --dsw-static-deepseek-50: #dcddd6;
        --dsw-static-deepseek-100: #dcddd6;
        --dsw-static-deepseek-200: #d8d9d5;
        --dsw-static-deepseek-300: #c8cac5;
        --dsw-static-deepseek-400: #757874;
        --dsw-static-deepseek-450: #d9c700;
        --dsw-static-deepseek-500: #101110;
        --dsw-static-deepseek-600: #101110;
        --dsw-static-deepseek-800: #3a3c38;
        --dsw-static-deepseek-900: #2a2c2a;
        --dsw-static-blue-900: #101110;
        --dsw-alias-button-info-fill: #101110;
        --dsw-alias-button-info-hover: #2a2b28;
        --dsw-alias-state-business-primary: #101110;
        --dsw-alias-state-business-tertiary: rgba(255, 245, 0, 0.14);
        --dsw-alias-brand-primary-new-colorprimary-new-color: #101110;
        --dsw-alias-label-primary-bluish: #101110;
        --dsw-specific-bubble: #f2f2ec;
        --dsw-specific-bubble-highlight: #dcddd6;
        --dsw-specific-sidebar-nav-item-active-accent: #101110;
        --dsw-alias-interactive-bg-hover-accent: rgba(255, 245, 0, 0.14);
        --dsw-alias-border-l3: #b6b8b3;
        --dsw-alias-border-l4: #9a9d98;
      }
      body[data-ds-dark-theme] {
        --dsw-static-deepseek-50: #242624;
        --dsw-static-deepseek-100: #242624;
        --dsw-static-deepseek-200: #2f312e;
        --dsw-static-deepseek-300: #3a3c38;
        --dsw-static-deepseek-400: #898d89;
        --dsw-static-deepseek-450: #fff500;
        --dsw-static-deepseek-500: #f5f5f0;
        --dsw-static-deepseek-600: #d8d9d5;
        --dsw-static-deepseek-800: #343633;
        --dsw-static-deepseek-900: #242624;
        --dsw-static-blue-900: #f5f5f0;
        --dsw-alias-button-info-fill: #fff500;
        --dsw-alias-button-info-hover: #fff500;
        --dsw-alias-state-business-primary: #fff500;
        --dsw-alias-state-business-tertiary: rgba(255, 245, 0, 0.22);
        --dsw-alias-brand-primary-new-colorprimary-new-color: #fff500;
        --dsw-alias-label-primary-bluish: #f5f5f0;
        --dsw-specific-bubble: #181a18;
        --dsw-specific-bubble-highlight: #242624;
        --dsw-specific-sidebar-nav-item-active-accent: #fff500;
        --dsw-alias-interactive-bg-hover-accent: rgba(255, 245, 0, 0.22);
        --dsw-alias-border-l3: #4f534f;
        --dsw-alias-border-l4: #5f6460;
        --edge-btn-muted: #3a3c38;
      }
      /* ---------- Signal yellow everywhere (light: visible but soft) ---------- */
      body {
        --dsw-alias-interactive-bg-hover: rgba(255, 245, 0, 0.16);
        --dsw-alias-interactive-bg-active: rgba(255, 245, 0, 0.26);
        --dsw-alias-interactive-bg-hover-solid: #fff500;
        --dsw-alias-bg-multi-select: rgba(255, 245, 0, 0.16);
        --dsw-alias-bg-skeleton: rgba(255, 245, 0, 0.12);
        --dsw-alias-markdown-citation: rgba(255, 245, 0, 0.16);
        --dsw-alias-markdown-code-block-banner: rgba(255, 245, 0, 0.10);
        --dsw-alias-markdown-code-segment-selected: rgba(255, 245, 0, 0.22);
        --dsw-alias-markdown-code-segment-unselected: rgba(255, 245, 0, 0.06);
        --dsw-alias-markdown-inline-code: rgba(255, 245, 0, 0.14);
        --dsw-alias-markdown-tag: rgba(255, 245, 0, 0.18);
        --dsw-alias-scrollbar-bg-l1: transparent;
        --dsw-alias-scrollbar-bg-l2: transparent;
        --dsw-alias-scrollbar-hover-l1: #fff500;
        --dsw-alias-scrollbar-hover-l2: #fff500;
        --dsw-specific-sidebar-nav-item-active: rgba(255, 245, 0, 0.16);
        --dsw-specific-sidebar-nav-item-hover: rgba(255, 245, 0, 0.12);
      }
      body[data-ds-dark-theme] {
        --dsw-alias-interactive-bg-hover: rgba(255, 245, 0, 0.18);
        --dsw-alias-interactive-bg-active: rgba(255, 245, 0, 0.28);
        --dsw-alias-interactive-bg-hover-solid: #fff500;
        --dsw-alias-bg-multi-select: rgba(255, 245, 0, 0.18);
        --dsw-alias-bg-skeleton: rgba(255, 245, 0, 0.14);
        --dsw-alias-markdown-citation: rgba(255, 245, 0, 0.20);
        --dsw-alias-markdown-code-block-banner: rgba(255, 245, 0, 0.12);
        --dsw-alias-markdown-code-segment-selected: rgba(255, 245, 0, 0.26);
        --dsw-alias-markdown-code-segment-unselected: rgba(255, 245, 0, 0.08);
        --dsw-alias-markdown-inline-code: rgba(255, 245, 0, 0.18);
        --dsw-alias-markdown-tag: rgba(255, 245, 0, 0.22);
        --dsw-alias-scrollbar-bg-l1: transparent;
        --dsw-alias-scrollbar-bg-l2: transparent;
        --dsw-alias-scrollbar-hover-l1: #fff500;
        --dsw-alias-scrollbar-hover-l2: #fff500;
        --dsw-specific-sidebar-nav-item-active: rgba(255, 245, 0, 0.20);
        --dsw-specific-sidebar-nav-item-hover: rgba(255, 245, 0, 0.16);
      }
      input, textarea, [contenteditable='true'] {
        caret-color: #fff500;
      }
      :focus-visible {
        outline: 2px solid #fff500 !important;
        outline-offset: 1px;
      }
      a {
        text-decoration-thickness: 1px;
      }
      a:hover {
        text-decoration-color: #fff500;
      }
      body[data-ds-dark-theme] a:hover {
        color: #fff500;
      }
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ::-webkit-scrollbar-thumb {
        border-radius: 0;
        background: var(--edge-line);
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #fff500 !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      /* ---------- Hover text contrast (reference page inversion) ---------- */
      /* Note: plain buttons are excluded — their own fill/text color must survive hover
         (e.g. yellow toggle button keeps black text; white-on-dark send button stays white). */
      :is([role='tab'], [role='menuitem'], [role='option'], [role='link'], [role='treeitem'], [role='checkbox'], [role='switch'], [role='radio'], [role='combobox'], [class*='nav-item' i], [class*='menu-item' i], [class*='list-item' i], [class*='session-item' i], [class*='workspace-item' i], [class*='search-result' i], [class*='item' i], [class*='tab' i], [class*='card' i], [class*='row' i], [class*='tool' i], [class*='composer' i]):hover {
        color: var(--dsw-alias-label-primary) !important;
      }
      /* ---------- Workspace browser rows (YDXeBa) ---------- */
      .YDXeBa_slot {
        color: var(--dsw-alias-brand-primary) !important;
      }
      .YDXeBa_projectRow:hover,
      .YDXeBa_sessionRow:hover,
      .YDXeBa_sessionRow.YDXeBa_selected,
      .YDXeBa_searchResultRow:hover,
      .YDXeBa_searchResultRow.YDXeBa_selected {
        background: rgba(255, 245, 0, 0.22) !important;
      }
      .YDXeBa_projectRow:hover *,
      .YDXeBa_sessionRow:hover *,
      .YDXeBa_sessionRow.YDXeBa_selected *,
      .YDXeBa_searchResultRow:hover *,
      .YDXeBa_searchResultRow.YDXeBa_selected * {
        color: #000 !important;
      }
      /* ---------- Light mode: workspace folder / icon buttons ink ---------- */
      body:not([data-ds-dark-theme]) .YDXeBa_folder,
      body:not([data-ds-dark-theme]) .YDXeBa_folderActive,
      body:not([data-ds-dark-theme]) .YDXeBa_chevron,
      body:not([data-ds-dark-theme]) .YDXeBa_arrow,
      body:not([data-ds-dark-theme]) .YDXeBa_iconButton,
      body:not([data-ds-dark-theme]) .qDHVXG_iconButton,
      body:not([data-ds-dark-theme]) .qDHVXG_searchButton,
      body:not([data-ds-dark-theme]) .qDHVXG_clearButton {
        color: #101110 !important;
      }
      /* ---------- Dark mode: solid signal-yellow inversions ---------- */
      body[data-ds-dark-theme] .YDXeBa_projectRow:hover,
      body[data-ds-dark-theme] .YDXeBa_sessionRow:hover,
      body[data-ds-dark-theme] .YDXeBa_sessionRow.YDXeBa_selected,
      body[data-ds-dark-theme] .YDXeBa_searchResultRow:hover,
      body[data-ds-dark-theme] .YDXeBa_searchResultRow.YDXeBa_selected {
        background: #fff500 !important;
      }
      body[data-ds-dark-theme] [class*='badge' i]:hover,
      body[data-ds-dark-theme] [class*='badge' i][data-active] {
        background: #fff500 !important;
      }
      /* ---------- Dark mode: icon buttons (plus / ellipsis / stop / actions) ---------- */
      body[data-ds-dark-theme] [class$='_iconButton'],
      body[data-ds-dark-theme] [data-cordis-approve],
      body[data-ds-dark-theme] [data-cordis-approve-plugin],
      body[data-ds-dark-theme] [data-cordis-decline],
      body[data-ds-dark-theme] [data-cordis-switch],
      body[data-ds-dark-theme] [class*='actionButton' i] {
        color: #fff500 !important;
      }
      body[data-ds-dark-theme] [class$='_iconButton']:hover:not(:disabled),
      body[data-ds-dark-theme] [data-cordis-switch]:hover:not(:disabled),
      body[data-ds-dark-theme] [class*='actionButton' i]:hover:not(:disabled) {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ---------- Cordis approval buttons (allow once / allow plugin / decline) ---------- */
      [data-cordis-approve],
      [data-cordis-approve-plugin] {
        color: #101110 !important;
        background: #fff500 !important;
      }
      [data-cordis-decline] {
        color: #fff !important;
        background: var(--dsw-alias-state-error-primary) !important;
      }
      [data-cordis-approve]:hover:not(:disabled),
      [data-cordis-approve-plugin]:hover:not(:disabled) {
        color: #000 !important;
        background: #e8e000 !important;
      }
      [data-cordis-decline]:hover:not(:disabled) {
        color: #fff !important;
        background: #d6281d !important;
      }
      /* ---------- Tables: bright signal-yellow hover (reference .data-table) ---------- */
      [class*='tableScroll' i] th,
      [class*='table' i] th {
        background: var(--edge-soft) !important;
        border-bottom-color: var(--edge-line) !important;
      }
      [class*='tableScroll' i] td,
      [class*='table' i] td {
        border-bottom-color: var(--edge-line) !important;
      }
      tbody tr:hover,
      tbody tr:hover *,
      [class*='table' i] tbody tr:hover,
      [class*='table' i] tbody tr:hover *,
      [class*='tableScroll' i] tbody tr:hover,
      [class*='tableScroll' i] tbody tr:hover * {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ---------- New session button (sidebar) ---------- */
      [class$='_newSession'] {
        color: #000 !important;
        background: #fff500 !important;
        border-color: #fff500 !important;
      }
      body:not(.theme-endfield-round) [class$='_newSession'] {
        border-radius: 0 !important;
      }
      [class$='_newSession']:hover,
      [class$='_newSession']:focus-visible {
        color: #000 !important;
        background: #e8e000 !important;
        border-color: #e8e000 !important;
      }
      [class$='_newSession'] svg {
        color: #000 !important;
      }
      [class$='_newSessionLabel'] {
        color: #000 !important;
      }
      /* ---------- Badge hover: signal-yellow inversion (reference .kpi:hover) ---------- */
      [class*='badge' i]:hover,
      [class*='badge' i]:hover *,
      [class*='badge' i][data-active],
      [class*='badge' i][data-active] * {
        color: #000 !important;
      }
      /* ---------- Cordis action buttons (run/stop/approve) ---------- */
      [data-cordis-switch]:hover:not(:disabled),
      [class*='actionButton' i]:hover:not(:disabled) {
        color: #000 !important;
        background: #fff500 !important;
      }
      body:not(.theme-endfield-round) [data-cordis-switch],
      body:not(.theme-endfield-round) [class*='actionButton' i] {
        border-radius: 999px !important;
      }
      /* ---------- Session header actions (agent preset / subagent / jobs) ---------- */
      [class$='_trigger']:hover:not(:disabled),
      [class$='_trigger'][aria-expanded='true'],
      [class$='_trigger']:focus-visible {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ---------- Agent-preset header chip: signal yellow, stretches to fill the action row ---------- */
      /* (scoped: the old broad [class$='_label'] rule yellowed plain text labels like 产物/settings/jobs names) */
      .SVAs4q_label {
        color: #000 !important;
        background: #fff500 !important;
        flex: 1 1 auto !important;
        max-width: none !important;
        justify-content: center !important;
        padding: 0 12px !important;
      }
      body:not(.theme-endfield-round) .SVAs4q_label {
        border-radius: 0 !important;
      }
      .SVAs4q_label .SVAs4q_icon,
      .SVAs4q_label svg {
        opacity: 1 !important;
        color: #000 !important;
      }
      /* ================= dark compaction notice + residual blues ================= */
      /* Dark mode: warm label grays (compaction notice title/summary/sep used bluish defaults) */
      body[data-ds-dark-theme] {
        --dsw-alias-label-tertiary: #9a9d98;
        --dsw-alias-label-caption: #8a8d88;
        --dsw-alias-label-dimmed: #70736f;
        --dsw-alias-label-primary-dimmed: #d8d9d5;
        --dsw-alias-label-primary-inverted: #2a2b28;
      }
      /* Light + dark: warm the remaining bluish-gray surfaces / buttons / code blocks */
      body {
        --dsw-alias-bg-layer-3: #dcddd6;
        --dsw-alias-bg-module-platform: #f2f2ec;
        --dsw-alias-markdown-code-block: #ecece6;
        --dsw-alias-button-elevated-fill: #f2f2ec;
        --dsw-alias-button-floating-fill: #f2f2ec;
        --dsw-alias-button-floating-hover: #e8e8e2;
        --dsw-alias-button-ghost-active-fill: #dcddd6;
        --dsw-alias-button-ghost-active-hover: #d8d9d5;
        --dsw-alias-button-ghost-active-border: #b6b8b3;
        --dsw-alias-button-primary-hover: #2a2b28;
        --dsw-alias-button-contrast-fill: #3a3c38;
        --dsw-alias-tooltip-bg: #2a2b28;
        --dsw-specific-input-major: #f2f2ec;
        --dsw-specific-selector: #e8e8e2;
        --dsw-specific-tip: #e8e8e2;
        --dsw-static-blue-400: #757874;
        --dsw-static-blue-450: #fff500;
        --dsw-static-blue-500: #101110;
        --dsw-alias-label-quaternary: #6a6d68;
        --dsw-alias-label-error: #ff3b30;
        --dsw-alias-label-inverse: #101110;
        --dsw-alias-line-secondary: #d8d9d5;
        --dsw-alias-separator-primary: #9a9d98;
        --dsw-alias-border-secondary: #b6b8b3;
        --dsw-alias-bg-primary: #f2f2ec;
        --dsw-alias-interactive-bg-primary: #fff500;
        --dsw-alias-fill-l2: #dcddd6;
        --dsw-alias-fill-tsp-secondary: #dcddd6;
      }
      body[data-ds-dark-theme] {
        --dsw-alias-bg-layer-3: #2c2e2a;
        --dsw-alias-bg-module-platform: #2c2e2a;
        --dsw-alias-bg-layer-2: #1e201d;
        --dsw-alias-markdown-code-block: #181a18;
        --dsw-alias-button-elevated-fill: #3a3c38;
        --dsw-alias-button-floating-fill: #343633;
        --dsw-alias-button-floating-hover: #3a3c38;
        --dsw-alias-button-ghost-active-fill: #343633;
        --dsw-alias-button-ghost-active-hover: #3f413d;
        --dsw-alias-button-ghost-active-border: #5f6460;
        --dsw-alias-button-primary-hover: #e8e000;
        --dsw-alias-button-contrast-fill: #f5f5f0;
        --dsw-alias-tooltip-bg: #2a2b28;
        --dsw-specific-input-major: #202220;
        --dsw-specific-selector: #2c2e2a;
        --dsw-specific-tip: #2c2e2a;
        --dsw-static-blue-400: #9a9d98;
        --dsw-static-blue-450: #fff500;
        --dsw-static-blue-500: #f5f5f0;
        --dsw-alias-label-quaternary: #9a9d98;
        --dsw-alias-label-error: #ff6b61;
        --dsw-alias-label-inverse: #101110;
        --dsw-alias-line-secondary: #343633;
        --dsw-alias-separator-primary: #70736f;
        --dsw-alias-border-secondary: #4a4d49;
        --dsw-alias-bg-primary: #181a18;
        --dsw-alias-interactive-bg-primary: #fff500;
        --dsw-alias-fill-l2: #242624;
        --dsw-alias-fill-tsp-secondary: #242624;
      }
      /* Token meter: messages segment signal yellow, system warm gray (tools keeps purple) */
      .JObwrW_colorMessages {
        --meter-tint: #fff500 !important;
      }
      .JObwrW_colorSystem {
        --meter-tint: #9a9d98 !important;
      }
      /* Appearance theme cube selected border: warm */
      ._8HJdBW_selected {
        border-color: var(--dsw-alias-border-l2) !important;
      }
      /* Compaction notice row: soft yellow wash + accent in dark, hover = solid inversion */
      body[data-ds-dark-theme] [class$='_compactionRow'] {
        background: rgba(255, 245, 0, 0.08) !important;
        border-left: 2px solid rgba(255, 245, 0, 0.55) !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover:not(:disabled),
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible {
        background: #fff500 !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover *,
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible * {
        color: #000 !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover [class$='_compactionSep'],
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible [class$='_compactionSep'] {
        background: #000 !important;
      }
      /* ================= composer add (+) button hover inversion ================= */
      /* Dark: + icon signal yellow at rest; on hover solid yellow bg + black icon */
      body[data-ds-dark-theme] .uV2eYG_add {
        color: #fff500 !important;
      }
      body[data-ds-dark-theme] .uV2eYG_add:hover:not(:disabled),
      body[data-ds-dark-theme] .uV2eYG_add:focus-visible {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ================= composer primary send/stop button ================= */
      /* Dark: hardcoded #fff icon on yellow info-fill -> black icon; hover deeper yellow */
      body[data-ds-dark-theme] .uV2eYG_primary {
        color: #101110 !important;
      }
      body[data-ds-dark-theme] .uV2eYG_primary:hover:not(:disabled) {
        color: #101110 !important;
        background: #e8e000 !important;
      }
      /* ================= light-mode white-on-dark buttons keep white icon ================= */
      /* Generic hover inversion would make the white send icon black on the dark fill */
      body:not([data-ds-dark-theme]) :is(.uV2eYG_primary, .zGbnIq_primaryButton),
      body:not([data-ds-dark-theme]) :is(.uV2eYG_primary, .zGbnIq_primaryButton):hover:not(:disabled) {
        color: #fff !important;
      }
    `)
      syncRadiusMode()
    }
    const unmount = () => {
      if (!mounted) return
      mounted = false
      disposeToken()
      disposeStyles()
      disposeToken = () => {}
      disposeStyles = () => {}
      document.body.classList.remove('theme-endfield-round')
    }

    if (isEnabled()) mount()

    /* ---------- Settings rows: theme master switch + corner mode ---------- */
    const slots = ctx.get('slots')
    const disposeRows = []
    let disposeSettings = () => { disposeRows.forEach((d) => d()) }
    if (slots !== undefined) {
      slots.inject('settings.general.item', () => {
        const d = slots.register(
        { name: 'settings.general.item', id: 'theme-endfield-switch', order: 14 },
        () => {
          const R = (typeof React !== 'undefined') ? React : ((typeof require === 'function') ? require('react') : null)
          if (!R) return null
          const [enabled, setEnabled] = R.useState(isEnabled())
          const radiusMode = (typeof localStorage !== 'undefined' && localStorage.getItem(RADIUS_KEY)) || 'square'
          const toggle = () => {
            const next = !enabled
            if (typeof localStorage !== 'undefined') localStorage.setItem(ENABLED_KEY, next ? '1' : '0')
            setEnabled(next)
            if (next) mount()
            else unmount()
          }
          const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0' }
          const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: 500, lineHeight: '1.5' }
          const btnStyle = {
            color: enabled ? '#000' : 'var(--dsw-alias-label-primary)',
            background: enabled ? '#fff500' : 'var(--edge-btn-muted)',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: radiusMode === 'round' ? '999px' : '0',
            padding: '4px 14px',
            fontSize: '12px',
            cursor: 'pointer',
          }
          return R.createElement('div', { style: rowStyle },
            R.createElement('span', { style: labelStyle }, '终末地主题：' + (enabled ? '开启' : '关闭')),
            R.createElement('button', { type: 'button', onClick: toggle, style: btnStyle }, enabled ? '关闭主题' : '开启主题')
          )
        }
      )
      disposeRows.push(d)
      return d
    })
      slots.inject('settings.general.item', () => {
        const d = slots.register(
        { name: 'settings.general.item', id: 'theme-endfield-radius', order: 15 },
        () => {
          const R = (typeof React !== 'undefined') ? React : ((typeof require === 'function') ? require('react') : null)
          if (!R) return null
          const [mode, setMode] = R.useState((typeof localStorage !== 'undefined' && localStorage.getItem(RADIUS_KEY)) || 'square')
          const toggle = () => {
            const next = mode === 'round' ? 'square' : 'round'
            if (typeof localStorage !== 'undefined') localStorage.setItem(RADIUS_KEY, next)
            setMode(next)
            if (next === 'round') document.body.classList.add('theme-endfield-round')
            else document.body.classList.remove('theme-endfield-round')
          }
          const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0' }
          const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: 500, lineHeight: '1.5' }
          const btnStyle = {
            color: mode === 'round' ? '#000' : 'var(--dsw-alias-label-primary)',
            background: mode === 'round' ? '#fff500' : 'var(--edge-btn-muted)',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: mode === 'round' ? '999px' : '0',
            padding: '4px 14px',
            fontSize: '12px',
            cursor: 'pointer',
          }
          return R.createElement('div', { style: rowStyle },
            R.createElement('span', { style: labelStyle }, '主题圆角：' + (mode === 'round' ? '圆角' : '直角')),
            R.createElement('button', { type: 'button', onClick: toggle, style: btnStyle }, mode === 'round' ? '切换直角' : '切换圆角')
          )
        }
      )
      disposeRows.push(d)
      return d
    })
    }

    ctx.effect(() => () => {
      unmount()
      disposeSettings()
    })
  }

		exports.name = "dsh-theme-endfield";
		exports.apply = apply;
		return module.exports;
	}
});
