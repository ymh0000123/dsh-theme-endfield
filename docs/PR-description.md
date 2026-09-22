# PR: 音频通知（Audio notifications）

> 这份文件是给上游作者的 PR 描述草稿，可直接粘贴到 GitHub。分支：`feat/audio-notifications`

## What this adds

Four audio notifications for the web profile, played **by the host process** (not the browser),
so a minimized window or another app in front still gets the sound:

| Slot | Moment | Trigger |
| --- | --- | --- |
| `boot` | the boot plate plays | client reports the once-per-page-load run of `runLoader()` |
| `turn-start` | the user submits from the composer | `agent/inbox/claimed` where the message carries a composer submission credential (`source.rpcId`) and the agent is a root |
| `turn-done` | the assistant produced a final answer | `agent/turn-stopping` where that turn's last assistant message had visible text |
| `attention` | a confirmation box that needs the user appears | the page observes the three panels, **and** the host-side `approval/request` / `user-questions/request` waterfalls |
| `turn-fail` | — | **deliberately unwired**: an error that needs no human decision stays silent |

Plus a `05 音频` settings section (master switch, per-slot switches, volume, four preview buttons,
diagnostics), a loopback bridge (`/theme-endfield/audio/*`), and a zero-dependency tone synthesizer
so the package ships no binary audio assets.

## Why the host plays the sound

A browser `AudioContext` is suspended until a user gesture and dies with the tab, so a task that
finishes while the window is minimized stays silent — which is exactly the case worth notifying.
`lib/audio.js` hands the file to the platform player instead (`powershell.exe` / `afplay` /
`paplay`), rescales PCM for volume without touching the system volume, and degrades to a no-op when
the `subprocess` service is absent.

## Two things worth a reviewer's attention

### 1. The page observes the UI for `attention` — and only via `data-*` attributes

In *some* deployments (including the one this was developed against) `ask_user_question` is provided
outside the profile's plugin stack, so `dsh-tool-ask-user` never runs and `user-questions/request` is
never raised. Measured: a question was answered while the host-side counter stayed at `0`.

So the client watches for the three confirmation panels. The anchors are the panels' own data
attributes — `[data-approval-key]`, `[data-plan-review-key]`, `[data-question-key]`.

A class-based first attempt was **removed**: `[class*='_card']` matches 15 different components in the
installed client packages and `[class*='_frame']` matches 8, so opening an unrelated card rang the
sound. A test now asserts **no marker contains `class`**.

Detection is a `MutationObserver` coalesced onto the next animation frame, with a 1 s poll as the
backstop (an observer bound to a container the app later replaces stops delivering silently; a poll
cannot). The host still owns the switch, the volume and the debounce; the page only reports "a box is
on screen".

### 2. `tools/execute` is a waterfall — do not listen to it naively

An earlier revision of this branch added a `tools/execute` listener as a redundant `ask_user_question`
trigger. It broke **every tool call in the profile** (`Cannot read properties of undefined (reading
'isError')`) because `tools/execute` is a waterfall:

```js
// @deepseek-ai/dsh-tools
const result = await this.ctx.waterfall(carrier, 'tools/execute', mutableExec, () => this.dispatchToolBody(mutableExec));
```

A listener that inspects the call and returns without calling `next()` reports "no result", so the
tool body never runs. The listener was removed and a structural test now guards it:
`the plugin never subscribes to the tools/execute waterfall`.

## Duration handling

The host-derived "still speaking" gate (`playUntil` = the file's own duration + 250 ms) means a long
user-supplied announcement is never clipped and a short one is not held back — no per-slot setting to
keep in sync with whatever audio is dropped in. Volume scaling is channel-aware (the first version
assumed mono and would have left the right channel untouched on stereo input).

## Tests

```bash
node test/audio-notify.test.js           # host half
node test/audio-attention-watch.test.js  # client half
node scripts/build-sounds.js --check     # generated tones match their definitions
```

The suite covers: composer-credential classification, "only a turn that produced text ends with a
sound", subagents staying silent, switch/volume gating, silent degradation without `subprocess`,
user-file override, the volume cache, the duration gate, and `agent/error` staying silent.

Full run: 14/14 test files pass, plus `node check.js` and `node selftest.js`.
**One pre-existing failure is untouched by this branch**: `test/contour-perf.test.js` reports
`p95 over 120fps budget` on the pristine upstream tree too (verified by stashing this branch).

## One unrelated fix included

`contourRenderer` was written and read by the settings panel but was **never declared** in
`FIELD_DEFAULTS`, so it lived only in the page and `test/settings-namespace.test.js` failed on it
(`client maps keys onto fields the host does NOT declare`). This branch declares it
(`contourRenderer: 'canvas'`), which is what made that test pass. Happy to split it into its own
commit/PR if you prefer.

## Files

| Path | What |
| --- | --- |
| `lib/tone.js` | PCM WAV synthesizer + WAV parsing + volume rescale (no deps) |
| `lib/slots.js` | the four slot definitions (notes, envelopes, durations) |
| `lib/audio.js` | resolution order, volume cache, platform players, debounce + duration gate |
| `scripts/build-sounds.js` | regenerates `sounds/*.wav` from `lib/slots.js` (`--check` verifies) |
| `index.js` | slots/fields/settings registration, host event wiring, `/theme-endfield/audio/*` routes |
| `client.js` | `05 音频` panel (switches, volume, preview, source read-out) |
| `docs/audio-notifications.md` | the feature's own documentation |

## Not included on purpose

The voice-pack wav used in development is **not** committed (1.3 MB of generated binary). Users point
`audioSoundDir` at their own directory, or drop `<slot>.wav` into the workspace; the resolution order
is custom dir → workspace → Desktop → bundled tone. This keeps the repository free of binary assets
while making replacement a one-file drop.
