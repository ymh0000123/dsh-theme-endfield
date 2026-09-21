'use strict';
/**
 * Audio notification engine for the installed (bundle) HOST half.
 *
 * Why the sound is played by the HOST and not in the browser: the moments worth
 * marking are exactly the moments the user is NOT looking at the page. A
 * browser `AudioContext` is suspended until a user gesture and dies with the
 * tab, so a task that finishes while the window is minimized would stay silent.
 * The host owns a real process boundary instead and hands the file to the
 * platform player.
 *
 * Consequences handled here:
 *   - `subprocess` is an optional seam. Without it the whole feature degrades to
 *     a no-op (and says so once) rather than throwing during boot.
 *   - The player is a child process per play. Playback is therefore
 *     "fire and forget", latest-wins per slot, with a hard grace timeout.
 *   - Volume is applied by rescaling PCM samples into a cache file, never by
 *     touching the system volume.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { scaleWavVolume } = require('./tone.js');
const { SLOT_IDS } = require('./slots.js');

const LOG_TAG = '[theme-endfield/audio]';
const BUNDLED_SOUNDS = path.join(__dirname, '..', 'sounds');
const CACHE_DIR = path.join(os.tmpdir(), 'dsh-theme-endfield');

/** Preference keys owned by this feature (all strings, per the namespace convention). */
const PREF = {
  enabled: 'audioEnabled',
  volume: 'audioVolume',
  boot: 'audioBoot',
  start: 'audioTurnStart',
  done: 'audioTurnDone',
  attention: 'audioAttention',
  fail: 'audioTurnFail',
  debounceMs: 'audioDebounceMs',
  soundDir: 'audioSoundDir',
  uiSoundDir: 'audioUiSoundDir',
  humanOnly: 'audioHumanOnly',
  diag: 'audioDiag',
};

/** Defaults mirroring FIELD_DEFAULTS in index.js. */
const FALLBACK = {
  [PREF.enabled]: '1',
  [PREF.volume]: '100',
  [PREF.boot]: '1',
  [PREF.start]: '1',
  [PREF.done]: '1',
  [PREF.attention]: '1',
  [PREF.fail]: '1',
  [PREF.debounceMs]: '2500',
  [PREF.soundDir]: '',
  [PREF.uiSoundDir]: '',
  [PREF.humanOnly]: '1',
  [PREF.diag]: '0',
};

/** The user's Desktop, probed lazily: a convenient drop-in place for own sounds. */
function desktopDir() {
  const home = typeof os.homedir === 'function' ? os.homedir() : '';
  if (home === '') return undefined;
  for (const candidate of [path.join(home, 'Desktop'), path.join(home, '桌面')]) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch (error) { /* ignore */ }
  }
  return undefined;
}

/**
 * The audio runtime: preference view, sound resolution, volume cache, playback
 * and the diagnostic ring the settings page reads.
 */
class AudioRuntime {
  /**
   * @param ctx - the host Cordis context the feature is mounted on.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.values = Object.assign({}, FALLBACK);
    this.scope = undefined;
    /** Last play timestamp per slot, for the per-slot debounce window. */
    this.lastPlayed = Object.create(null);
    /** Slots whose child process has not settled yet — no overlapping play. */
    this.playing = new Set();
    /** Bounded diagnostic ring: what the plugin saw and what it did about it. */
    this.diag = [];
    this.warnedNoSubprocess = false;
    this.uiSoundDir = '';
  }

  /** Record one diagnostic line and echo it to the host console. */
  note(kind, detail) {
    const entry = { at: Date.now(), kind, detail: detail === undefined ? '' : String(detail) };
    this.diag.push(entry);
    if (this.diag.length > 60) this.diag.shift();
    console.log(`${LOG_TAG} ${kind}${entry.detail === '' ? '' : ' — ' + entry.detail}`);
  }

  /** Whether verbose diagnostics are on (the settings page can switch them on). */
  get diagnosing() {
    return this.values[PREF.diag] !== '0';
  }

  /** Adopt the durable preference snapshot and remember the live UI sound dir. */
  setValues(values) {
    this.values = Object.assign({}, FALLBACK, values === undefined ? {} : values);
  }

  /** One preference as a string, falling back to the shipped default. */
  value(key) {
    const raw = this.values[key];
    return raw === undefined || raw === null ? FALLBACK[key] : String(raw);
  }

  /** One preference as an integer with bounds. */
  number(key, min, max) {
    const parsed = Number.parseInt(this.value(key), 10);
    if (!Number.isFinite(parsed)) return Number.parseInt(FALLBACK[key], 10);
    return Math.min(max, Math.max(min, parsed));
  }

  /** Whether one switch preference is on (stored `'1'`, read with `!== '0'`). */
  enabled(key) {
    return this.value(key) !== '0';
  }

  /** Candidate directories for own sound files, most specific first. */
  soundDirs() {
    const dirs = [];
    const ui = String(this.uiSoundDir || '');
    if (ui !== '') dirs.push(ui);
    const configured = this.value(PREF.soundDir);
    if (configured !== '') dirs.push(configured);
    try {
      const workspace = this.ctx.get('workspace');
      const root = workspace === undefined || typeof workspace.root !== 'function' ? undefined : workspace.root();
      if (typeof root === 'string' && root !== '') dirs.push(root);
    } catch (error) { /* workspace service absent — fine */ }
    const desktop = desktopDir();
    if (desktop !== undefined) dirs.push(desktop);
    dirs.push(BUNDLED_SOUNDS);
    return dirs;
  }

  /**
   * Resolve one slot to a playable file: configured dirs, then the workspace,
   * then the Desktop drop-in, then the bundled synthesized tone.
   *
   * @param slot - slot id from `lib/slots.js`.
   * @returns `{ file, origin }` or undefined when nothing exists.
   */
  resolve(slot) {
    const name = `${slot}.wav`;
    const dirs = this.soundDirs();
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { file: candidate, origin: dir === BUNDLED_SOUNDS ? 'bundled' : candidate };
        }
      } catch (error) { /* unreadable candidate — try the next */ }
    }
    return undefined;
  }

  /**
   * Whether one slot's OWN switch is on.
   *
   * Callers that fire on an event already test this before calling `play()`; it
   * exists as a method so the preview route can honour the same switch and report
   * it, instead of playing a sound the user has switched off. `play()` itself
   * deliberately does NOT consult it: `force` means "ignore the debounce", and
   * folding a second meaning into it would make the switch and the preview fight
   * each other.
   *
   * @param slot - slot id from `lib/slots.js`.
   * @returns true when the slot may sound.
   */
  slotEnabled(slot) {
    const key = PREF[slotSwitchKey(slot)];
    if (key === undefined) return false;
    return this.enabled(key);
  }

  /**
   * Apply the volume to a sound file by rescaling its PCM into the cache, so the
   * system volume is never touched.
   *
   * @param file - source wav path.
   * @param volume - 0..100.
   * @returns the file to play (the source itself when scaling is a no-op).
   */
  applyVolume(file, volume) {
    if (volume >= 100) return file;
    let bytes;
    try {
      bytes = fs.readFileSync(file);
    } catch (error) {
      return file;
    }
    const scaled = scaleWavVolume(bytes, volume);
    if (scaled === bytes) return file; // non-rescalable format: original level
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const target = path.join(CACHE_DIR, `${path.basename(file, path.extname(file))}-v${volume}-${bytes.length}.wav`);
      if (!fs.existsSync(target)) fs.writeFileSync(target, scaled);
      return target;
    } catch (error) {
      return file;
    }
  }

  /** The platform command matrix: try each entry until one runs. */
  playerCommands(file) {
    if (process.platform === 'win32') {
      // PowerShell's Media.SoundPlayer takes a literal path, so quote-escape it
      // and hand the whole script over as -EncodedCommand (no shell quoting
      // games, no console window when run detached).
      const escaped = file.replace(/'/g, "''");
      const script = `$p = New-Object Media.SoundPlayer '${escaped}'; $p.PlaySync()`;
      const encoded = Buffer.from(script, 'utf16le').toString('base64');
      const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded];
      return [
        [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ...args],
        ['pwsh.exe', ...args],
      ];
    }
    if (process.platform === 'darwin') return [['/usr/bin/afplay', file]];
    return [['paplay', file], ['aplay', file]];
  }

  /**
   * Play one slot.
   *
   * @param slot - slot id.
   * @param options - `force` skips the debounce (used by the settings preview),
   *   `reason` is recorded in diagnostics.
   * @returns the outcome, for the preview route to report.
   */
  play(slot, options) {
    const force = options !== undefined && options.force === true;
    const reason = options === undefined || options.reason === undefined ? '' : options.reason;
    if (!SLOT_IDS.includes(slot)) return { played: false, why: `unknown slot "${slot}"` };
    if (!this.enabled(PREF.enabled)) return { played: false, why: 'audio disabled' };
    const volume = this.number(PREF.volume, 0, 100);
    if (volume <= 0) return { played: false, why: 'volume is 0' };
    const resolved = this.resolve(slot);
    if (resolved === undefined) return { played: false, why: 'no sound file found' };
    const debounce = this.number(PREF.debounceMs, 0, 60000);
    const now = Date.now();
    if (!force && now - (this.lastPlayed[slot] || 0) < debounce) {
      return { played: false, why: `debounced (${debounce} ms window)`, file: resolved.file };
    }
    const subprocess = (() => {
      try { return this.ctx.get('subprocess'); } catch (error) { return undefined; }
    })();
    if (subprocess === undefined || typeof subprocess.spawn !== 'function') {
      if (!this.warnedNoSubprocess) {
        this.warnedNoSubprocess = true;
        this.note('unavailable', 'the subprocess service is absent; audio notifications stay silent');
      }
      return { played: false, why: 'subprocess service unavailable' };
    }
    if (this.playing.has(slot)) return { played: false, why: 'previous play still running', file: resolved.file };

    const file = this.applyVolume(resolved.file, volume);
    const attempts = this.playerCommands(file);
    this.lastPlayed[slot] = now;
    this.playing.add(slot);
    const runtime = this;
    let index = 0;
    const tryNext = () => {
      if (index >= attempts.length) {
        runtime.playing.delete(slot);
        runtime.note('failed', `${slot}: no player command succeeded`);
        return;
      }
      const argv = attempts[index++];
      let handle;
      try {
        handle = subprocess.spawn({
          argv,
          cwd: process.platform === 'win32' ? (process.env.SystemRoot || 'C:\\Windows') : '/',
          stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
          graceMs: 8000,
        });
      } catch (error) {
        tryNext();
        return;
      }
      Promise.resolve(handle.done).then(
        () => { runtime.playing.delete(slot); },
        (error) => {
          runtime.note('player-failed', `${slot}: ${argv[0]}`);
          tryNext();
        },
      );
    };
    tryNext();
    if (this.diagnosing) {
      this.note('played', `${slot} (${force ? 'preview' : reason || 'event'}) <- ${resolved.origin} volume=${volume}`);
    }
    return { played: true, file: resolved.file, origin: resolved.origin, volume };
  }

  /** Diagnostic snapshot for the settings page. */
  snapshot() {
    return {
      enabled: this.enabled(PREF.enabled),
      volume: this.number(PREF.volume, 0, 100),
      debounceMs: this.number(PREF.debounceMs, 0, 60000),
      humanOnly: this.enabled(PREF.humanOnly),
      slots: SLOT_IDS.map((slot) => {
        const resolved = this.resolve(slot);
        return {
          id: slot,
          switchOn: this.enabled(PREF[slotSwitchKey(slot)]),
          file: resolved === undefined ? null : resolved.file,
          origin: resolved === undefined ? null : resolved.origin,
          bundled: resolved !== undefined && resolved.origin === 'bundled',
        };
      }),
      soundDirs: this.soundDirs(),
      desktop: desktopDir() === undefined ? null : desktopDir(),
      subprocess: (() => {
        try { return typeof this.ctx.get('subprocess')?.spawn === 'function'; } catch (error) { return false; }
      })(),
      diagnosing: this.diagnosing,
      log: this.diag.slice(-40),
    };
  }
}

/** Preference key holding one slot's own switch. */
function slotSwitchKey(slot) {
  if (slot === 'boot') return 'boot';
  if (slot === 'turn-start') return 'start';
  if (slot === 'turn-done') return 'done';
  if (slot === 'attention') return 'attention';
  return 'fail';
}

module.exports = { AudioRuntime, PREF, FALLBACK, LOG_TAG, desktopDir, BUNDLED_SOUNDS, CACHE_DIR };
