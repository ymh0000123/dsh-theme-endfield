'use strict';
/**
 * Zero-dependency PCM WAV tone synthesizer.
 *
 * The audio-notification feature needs four short sounds and must NOT ship
 * binary audio assets (no licensing question, no repo weight). This module
 * computes the samples instead: a note is a fundamental plus a few harmonics
 * under an attack/decay envelope, and the mix is normalized so every slot lands
 * at the same loudness.
 *
 * Output format is deliberately the one the whole stack already proved it can
 * play (verified end to end with Windows Media.SoundPlayer): RIFF/WAVE,
 * 16-bit PCM, mono, 44.1 kHz.
 */

const SAMPLE_RATE = 44100;

/** Equal-temperament pitch of one note name against A4 = 440 Hz. */
const SEMITONES = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };

/**
 * Resolve a note name such as `C5`, `F#4` or `A4` to hertz.
 * @param name - letter, optional `#`, then the octave digit(s).
 * @returns frequency in hertz.
 */
function noteHz(name) {
  const match = /^([A-G]#?)(-?\d+)$/.exec(String(name));
  if (match === null) throw new Error(`bad note name: ${name}`);
  const semitone = SEMITONES[match[1]];
  const octave = Number(match[2]);
  return 440 * Math.pow(2, (semitone + (octave - 4) * 12) / 12);
}

/** Timbre presets: [harmonic multiplier, amplitude] pairs. */
const TIMBRES = {
  // Warm chime: fundamental with a soft octave and a faint twelfth.
  chime: [[1, 1], [2, 0.3], [3, 0.08]],
  // Bright, more present top end — for the short "received" blip.
  blip: [[1, 1], [2, 0.42], [3, 0.12]],
  // Hollow and darker — used where the sound must read as a warning.
  hollow: [[1, 1], [2, 0.12], [3, 0.3]],
};

/**
 * Mix one note into the sample buffer.
 *
 * @param data - mono sample buffer, added into (not overwritten).
 * @param spec - frequency (Hz), start (s), duration (s), gain, timbre, detune
 *   in cents applied to the whole note, and envelope shape.
 */
function addNote(data, spec) {
  const {
    freq,
    start,
    duration,
    gain,
    timbre = 'chime',
    detuneCents = 0,
    attack = 0.006,
    decay = 1.15,
    curve = 2.2,
  } = spec;
  const hz = freq * Math.pow(2, detuneCents / 1200);
  const from = Math.floor(start * SAMPLE_RATE);
  const length = Math.floor(duration * SAMPLE_RATE);
  const attackSamples = Math.max(1, Math.floor(attack * SAMPLE_RATE));
  const voices = TIMBRES[timbre];
  if (voices === undefined) throw new Error(`unknown timbre: ${timbre}`);
  for (let i = 0; i < length; i++) {
    const cursor = from + i;
    if (cursor >= data.length) break;
    const t = i / SAMPLE_RATE;
    const envelope =
      (i < attackSamples ? i / attackSamples : 1) *
      Math.pow(1 - i / length, curve) *
      Math.exp(-decay * t);
    let sample = 0;
    for (const [multiplier, amplitude] of voices) {
      sample += amplitude * Math.sin(2 * Math.PI * hz * multiplier * t);
    }
    data[cursor] += sample * envelope * gain;
  }
}

/**
 * Render a slot definition to a complete WAV file.
 *
 * @param slot - `{ duration, peakDbfs, notes: [...] }` where each note uses the
 *   `addNote` fields plus a `note` name instead of a raw frequency.
 * @returns the file bytes.
 */
function renderWav(slot) {
  const total = Math.floor(SAMPLE_RATE * slot.duration);
  const data = new Float64Array(total);
  for (const note of slot.notes) {
    addNote(data, Object.assign({}, note, {
      freq: note.freq === undefined ? noteHz(note.note) : note.freq,
    }));
  }
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(data[i]));
  const target = Math.pow(10, (slot.peakDbfs === undefined ? -2 : slot.peakDbfs) / 20);
  const scale = peak > 0 ? target / peak : 1;
  const pcm = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    let value = Math.round(data[i] * scale * 32767);
    if (value > 32767) value = 32767;
    if (value < -32768) value = -32768;
    pcm.writeInt16LE(value, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Parse a WAV buffer far enough to locate its PCM data and format. */
function parseWav(buffer) {
  if (buffer.length < 44) return undefined;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return undefined;
  let offset = 12;
  let audioFormat = 0;
  let bitsPerSample = 0;
  let channels = 0;
  let sampleRate = 0;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ' && chunkSize >= 16) {
      audioFormat = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
      // WAVE_FORMAT_EXTENSIBLE wraps the real format in the first two bytes of
      // the sub-format GUID.
      if (audioFormat === 0xfffe && chunkSize >= 40 && buffer.readUInt16LE(body + 24) === 1) audioFormat = 1;
    } else if (id === 'data') {
      dataOffset = body;
      dataSize = Math.min(chunkSize, buffer.length - body);
    }
    if (dataOffset >= 0 && bitsPerSample > 0) break;
    offset = body + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0 || audioFormat !== 1) return undefined;
  if (channels <= 0 || sampleRate <= 0) return undefined;
  return { dataOffset, dataSize, bitsPerSample, channels, sampleRate };
}

/**
 * Rescale a PCM WAV's samples by `volume` percent without touching the system
 * volume. Returns the original buffer when the format is not rescalable, so a
 * caller can always write the result out.
 *
 * @param buffer - the source WAV bytes.
 * @param volume - 0..100.
 * @returns scaled WAV bytes (or the input, unchanged, when scaling is a no-op).
 */
function scaleWavVolume(buffer, volume) {
  const gain = volume / 100;
  if (gain === 1) return buffer;
  const parsed = parseWav(buffer);
  if (parsed === undefined) return buffer;
  const { dataOffset, dataSize, bitsPerSample, channels } = parsed;
  if (bitsPerSample !== 16 && bitsPerSample !== 8) return buffer;
  /* Scale EVERY channel. The first version assumed mono and stepped 2 bytes per
     sample, so on stereo input it scaled only the left channel — volume 50 would
     have produced a left channel at half level and an untouched right one. The
     bundled tones are mono, but a user-supplied file need not be, and the whole
     point of this path is honouring a user's own audio. */
  const frameBytes = (bitsPerSample / 8) * channels;
  const out = Buffer.from(buffer);
  const frames = Math.floor(dataSize / frameBytes);
  if (bitsPerSample === 16) {
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const pos = dataOffset + frame * frameBytes + channel * 2;
        let value = Math.round(out.readInt16LE(pos) * gain);
        if (value > 32767) value = 32767;
        else if (value < -32768) value = -32768;
        out.writeInt16LE(value, pos);
      }
    }
  } else {
    for (let frame = 0; frame < frames; frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const pos = dataOffset + frame * frameBytes + channel;
        let value = Math.round((out.readUInt8(pos) - 128) * gain + 128);
        if (value > 255) value = 255;
        else if (value < 0) value = 0;
        out.writeUInt8(value, pos);
      }
    }
  }
  return out;
}

module.exports = { SAMPLE_RATE, noteHz, renderWav, scaleWavVolume, parseWav };
