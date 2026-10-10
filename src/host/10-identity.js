
const NAME = 'dsh-theme-endfield';

/**
 * DSH 0.1.7-rc.1 settings namespace: the profile entry id of this plugin's row
 * (cordis.patch.yml: `id: theme-endfield`). `ctx.settings.describe()` keys every
 * form by `entry.options.id`, and the browser's `configForms.get(ns)` mirrors
 * the same string, so this constant is what ties the two halves together.
 */
const SETTINGS_ENTRY = 'theme-endfield';

/**
 * Pre-0.1.7 settings namespace, registered through `ctx.settings.register` and
 * persisted to `<dshHome>/settings.yaml`. Kept so an older host keeps working
 * (and so the legacy client seam in client.js still has a producer).
 */
const LEGACY_NAMESPACE = 'dsh-theme-endfield';

/** Historical name of the namespace; kept for callers and tests. */
const NAMESPACE = LEGACY_NAMESPACE;

/**
 * Schema defaults for every field. Field names are the short tails of the
 * original localStorage keys (the `dsh-theme-endfield-` prefix is implied by
 * the namespace). Keeping the actual stored values as strings means the value
 * model survives every storage generation unchanged, and an older persisted
 * document still validates without a migration step.
 *
 * Default polarity (same rules as before, now enforced by the schema defaults
 * instead of by an "absent key" check, and documented in docs/features.md):
 *   - default-ON switches store '1' and the client reads them as `!== '0'`;
 *   - default-OFF switches store '0' and the client reads them as `=== '1'`;
 *   - palettes / radii / frame-rate / speed each store exactly one of their
 *     documented literals ('valley'/'wuling'; 'square'/'round'; fps in
 *     24/60/120; speed in 1/2/4), with the shipped default filled in here.
 */
const FIELD_DEFAULTS = {
  enabled: '1',             // 终末地主题 —— default on
  palette: 'valley',        // 主题配色 —— 谷地黄 (walley default)
  glass: 'off',             // optional local frost; original material by default
  radius: 'square',         // 主题圆角 —— 直角
  contour: '0',             // 等高线背景 —— default off
  contourAnim: '1',         // 动态等高线 —— default on
  contourFps: '24',         // 动态帧率 —— 24 FPS
  contourSpeed: '2',        // 动态速度 —— 标准 2x
  contourRenderer: 'canvas', // opt-in Worker/WebGL; original backend by default
  contourTrail: '0',        // optional mouse deformation, default off
  contourScrollPause: '1',  // 滚动暂停 —— default on
  // 输出滚动动画 —— default ON. It leaves the app's own scroll bookkeeping
  // untouched (the scrollTop read-back stays exact, so stream following survives)
  // and only compensates the transcript column visually, so an install that
  // upgrades into it gets smoother streaming output with nothing to configure.
  scrollAnim: '1',
  scrollAnimLevel: 'standard', // 动画强度 —— soft / standard / snappy
  watermark: '1',           // 背景水印 —— default on
  watermarkPersist: '0',    // 水印保持显示 —— default off
  loader: '0',              // 启动加载动画 —— default off
  thunder: '0',             // 雷霆大字 —— default off
  thunderAnim: '0',         // 大字入场动画 —— default off
  balanceCapsule: '0',      // 顶部余额胶囊 —— default off
  creditDisplay: 'remaining', // 渠道额度主读数 —— remaining（剩余）| used（已用）
  // --- 音频通知 ---------------------------------------------------------
  // Four live slots: the boot plate, the prompt that starts a turn, the final
  // answer that ends one, and `attention` for the two moments that actually
  // need a human (an approval request and my own question). `turn-fail` ships as
  // a sound and a switch but is wired to nothing on purpose: an error that needs
  // no human decision must stay silent.
  //
  // The MASTER switch ships OFF: sound is opt-in, so an install that upgrades
  // into this feature never starts making noise on its own. The per-slot
  // switches stay ON, which is why flipping the master on is enough to hear the
  // live slots; each one can then be silenced individually.
  audioEnabled: '0',        // 音频通知总开关 —— default OFF（默认不出声，需手动开启）
  audioVolume: '100',        // 音量 0-100 —— rescaled PCM, not system volume
  audioBoot: '1',           // 启动加载动画音 —— 页面加载播放加载板时响一次
  audioTurnStart: '1',      // 任务开始音 —— 会话框提交后播放
  audioTurnDone: '1',       // 任务结束音 —— 最终结果产出后播放
  audioAttention: '1',      // 需要你回应 —— 审批请求 / 我的提问 / 计划求批
  audioTurnFail: '1',       // 出错音 —— 无事件接线：不需要人工干预的错误保持静音
  audioDebounceMs: '2500',  // 同一槽位最小间隔
  audioSoundDir: '',        // 自定义音效目录，留空则用工作区/桌面/内置
  audioHumanOnly: '1',      // 开始音只认会话框提交（带 rpcId 的用户消息）
  audioDiag: '0',           // 诊断日志 —— 记录事件与判定结果
};
