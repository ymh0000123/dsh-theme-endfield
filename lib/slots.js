'use strict';
/**
 * Sound-slot definitions for the audio-notification feature.
 *
 * One entry per slot, each documented with the moment it marks so the settings
 * page and the docs can describe them without a second source of truth.
 *
 * Wired to events by the host half: `boot` (the loader plates) and `turn-start`
 * / `turn-done`. Generated but NOT wired: `attention` and `turn-fail`, so the
 * package already carries the whole set and a later version only has to add the
 * triggers.
 */

const SLOTS = {
  /**
   * 启动加载动画 —— the boot plate starts. A rising three-note figure that lands
   * on the same G5 the task-end chime begins from, so the boot sound leads INTO
   * that interval instead of competing with it. Shorter and lighter than
   * `turn-start`: it marks a page arriving, not work beginning. Fired only on
   * the real once-per-page-load run of the loader, never by a preview button.
   */
  boot: {
    duration: 0.95,
    peakDbfs: -3,
    notes: [
      { note: 'G4', start: 0, duration: 0.42, gain: 0.34, timbre: 'blip', decay: 2.2, curve: 2.4 },
      { note: 'D5', start: 0.11, duration: 0.5, gain: 0.32, timbre: 'blip', decay: 1.9, curve: 2.2 },
      { note: 'G5', start: 0.22, duration: 0.7, gain: 0.32, timbre: 'chime', decay: 1.5, curve: 2.0 },
      { note: 'D6', start: 0.34, duration: 0.55, gain: 0.06, timbre: 'chime', decay: 2.0 },
    ],
  },

  /**
   * 任务开始 —— the user submitted a prompt from the composer and the agent is
   * picking it up. Short, quiet, informational: it confirms the instruction was
   * received without implying anything finished.
   */
  'turn-start': {
    duration: 0.5,
    peakDbfs: -4,
    notes: [
      { note: 'F4', start: 0, duration: 0.3, gain: 0.42, timbre: 'blip', decay: 3.4, curve: 2.6 },
      { note: 'A#4', start: 0.075, duration: 0.4, gain: 0.34, timbre: 'blip', decay: 3.0, curve: 2.4 },
      { note: 'C5', start: 0.15, duration: 0.34, gain: 0.22, timbre: 'blip', decay: 3.6, curve: 2.4 },
    ],
  },

  /**
   * 任务结束 —— the agent delivered a final text result. Rising major third
   * (C5 -> G5) with an almost inaudible C6 shimmer: closing, not celebratory.
   */
  'turn-done': {
    duration: 1.15,
    peakDbfs: -2,
    notes: [
      { note: 'C5', start: 0, duration: 0.55, gain: 0.34, timbre: 'chime' },
      { note: 'G5', start: 0.16, duration: 0.85, gain: 0.3, timbre: 'chime', decay: 1.0 },
      { note: 'C6', start: 0.34, duration: 0.75, gain: 0.07, timbre: 'chime', decay: 1.4 },
    ],
  },

  /**
   * 需要你回应 (reserved) —— human attention required. Descending minor second
   * with a detuned partial beats against the fundamental: unresolved on
   * purpose, so it does not read as "done".
   */
  attention: {
    duration: 1.0,
    peakDbfs: -2,
    notes: [
      { note: 'A4', start: 0, duration: 0.5, gain: 0.34, timbre: 'chime', decay: 1.8 },
      { note: 'G#4', start: 0.22, duration: 0.8, gain: 0.32, timbre: 'chime', decay: 1.5 },
      { note: 'A4', start: 0, duration: 0.5, gain: 0.2, timbre: 'chime', detuneCents: 22, decay: 1.8 },
    ],
  },

  /**
   * 出错 (reserved) —— the turn failed. Low, hollow, two hits: reads as a fault
   * rather than a completion.
   */
  'turn-fail': {
    duration: 0.9,
    peakDbfs: -2,
    notes: [
      { note: 'F3', start: 0, duration: 0.28, gain: 0.4, timbre: 'hollow', decay: 2.6, attack: 0.003 },
      { note: 'C3', start: 0.2, duration: 0.62, gain: 0.4, timbre: 'hollow', decay: 1.9, attack: 0.003 },
    ],
  },
};

/** Slot ids in playback/preview order. */
const SLOT_IDS = ['boot', 'turn-start', 'turn-done', 'attention', 'turn-fail'];

module.exports = { SLOTS, SLOT_IDS };
