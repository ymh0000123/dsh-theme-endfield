/**
 * dsh-theme-endfield — Edge Intelligence Theme (browser client bundle)
 * 还原自《明日方舟：终末地》（Arknights: Endfield）官网的「工业编辑风」。
 * 参考：https://endfield.hypergryph.com
 *
 * 动态 Cordis 插件（Client 半部）：
 *   1) theme.overrideTokens —— 覆盖 13 个主题令牌（亮/暗双色），映射终末地官网色板；
 *   2) styles.insert —— 注入字体栈、信号黄强调、直角化、去蓝、hover 反色等全局样式。
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

function apply(ctx) {
    const theme = ctx.get('theme')
    if (theme === undefined) return

    const disposeToken = theme.overrideTokens('edge-intelligence-theme', {
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
        dark: '#242624',
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
        light: '#757874',
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

    const disposeStyles = styles.insert(`
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
      button, input, textarea, select, [role='button'], [role='dialog'], [role='menu'], [role='tooltip'], [role='tab'] {
        border-radius: 0 !important;
      }
      [class*='card'], [class*='Card'], [class*='input'], [class*='Input'], [class*='button'], [class*='Button'], [class*='menu'], [class*='Menu'], [class*='tooltip'], [class*='Tooltip'], [class*='dialog'], [class*='Dialog'], [class*='popover'], [class*='Popover'], [class*='tag'], [class*='Tag'], [class*='pill'], [class*='bubble'], [class*='composer'], [class*='sidebar'], [class*='Sidebar'], [class*='tab'], [class*='Tab'], [class*='badge'], [class*='Badge'], [class*='icon'], [class*='Icon'], [class*='tool' i], [class*='Tool' i] {
        border-radius: 0 !important;
      }
      [class*='avatar'], [class*='Avatar'], [class*='spinner'], [class*='Spinner'], [class*='dot'], [class*='Dot'], [class*='actionButton' i] {
        border-radius: 50% !important;
      }
      [class*='scrollbar'], [class*='Scrollbar'] {
        border-radius: 0 !important;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: var(--edge-line) transparent;
      }
      /* ---------- Neutralize remaining DeepSeek brand blues ---------- */
      body {
        --dsw-static-deepseek-50: #dcddd6;
        --dsw-static-deepseek-100: #dcddd6;
        --dsw-static-deepseek-200: #d8d9d5;
        --dsw-static-deepseek-300: #c8cac5;
        --dsw-static-deepseek-400: #757874;
        --dsw-static-deepseek-450: #fff500;
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
      :is(button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], [role='link'], [role='treeitem'], [role='checkbox'], [role='switch'], [role='radio'], [role='combobox'], [class*='nav-item' i], [class*='menu-item' i], [class*='list-item' i], [class*='session-item' i], [class*='workspace-item' i], [class*='search-result' i], [class*='item' i], [class*='tab' i], [class*='card' i], [class*='row' i], [class*='tool' i], [class*='composer' i]):hover {
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
      [data-cordis-switch],
      [class*='actionButton' i] {
        border-radius: 999px !important;
      }
      /* ---------- Session header actions (agent preset / subagent / jobs) ---------- */
      [class$='_trigger']:hover:not(:disabled),
      [class$='_trigger'][aria-expanded='true'],
      [class$='_trigger']:focus-visible {
        color: #000 !important;
        background: #fff500 !important;
      }
      [class$='_label'] {
        color: #000 !important;
        background: #fff500 !important;
        border-radius: 0 !important;
      }
      [class$='_label'] .SVAs4q_icon,
      [class$='_label'] svg {
        opacity: 1 !important;
      }
    `)

    ctx.effect(() => () => {
      disposeToken()
      disposeStyles()
    })
  }

		exports.name = "dsh-theme-endfield";
		exports.apply = apply;
		return module.exports;
	}
});
