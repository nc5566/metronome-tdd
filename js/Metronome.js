/**
 * Metronome.js — Core Audio Engine
 *
 * Responsibilities:
 * - AudioContext lifecycle (lazy init)
 * - High-precision beat scheduling (Web Audio API look-ahead scheduler)
 * - Sound synthesis (oscillator + envelope + compressor)
 * - State: BPM, beatsPerMeasure, currentBeatIndex, accent, waveform
 * - Callbacks: onBeat(beatIndex, isAccent)
 *
 * Design:
 * Uses the "look-ahead scheduler" pattern:
 *   A setTimeout loop fires every LOOK_AHEAD_MS (25ms)
 *   and schedules all beats within the look-ahead window (LOOK_AHEAD_S = 0.1s).
 *   This achieves < 1ms timing accuracy independent of main-thread jank.
 *
 * NO setInterval/setTimeout is used for audio timing — only for
 * triggering the scheduler. Audio events are scheduled with
 * AudioContext.currentTime, which is immune to main-thread delays.
 */

'use strict';

class Metronome {

  // ── Constants ────────────────────────────────────────────
  static get MIN_BPM()          { return 40; }
  static get MAX_BPM()          { return 240; }
  static get DEFAULT_BPM()     { return 72; }
  static get LOOK_AHEAD_MS()   { return 25; }   // scheduler interval
  static get LOOK_AHEAD_S()     { return 0.1; }  // look-ahead window

  // ── Constructor ─────────────────────────────────────────
  /**
   * @param {number} [bpm=72]
   * @param {Object} [callbacks={}]
   * @param {Function} [callbacks.onBeat]  - called on each beat: (beatIndex, isAccent, audioTime)
   */
  constructor(bpm = Metronome.DEFAULT_BPM, callbacks = {}) {
    this._bpm              = this._clampBPM(bpm);
    this._beatsPerMeasure  = 4;
    this._currentBeat      = 0;
    this._isPlaying        = false;
    this._accentEnabled    = true;
    this._waveform         = 'sine';
    this._baseFreq         = 880; // Hz for normal beat
    this._accentFreq       = 1320; // Hz for accent beat

    // Scheduler state
    this._nextBeatTime     = 0;
    this._schedulerTimerId  = null;

    // Audio (lazy — initialized on first play)
    this._audioCtx         = null;
    this._mainGainNode     = null;

    // Callbacks
    this._onBeatCallbacks  = [];

    // Beat interval derived from BPM
    this._beatInterval     = 60.0 / this._bpm;
  }

  // ── Getters ─────────────────────────────────────────────
  getBPM()              { return this._bpm; }
  isPlaying()           { return this._isPlaying; }
  getBeatsPerMeasure()  { return this._beatsPerMeasure; }
  getCurrentBeatIndex() { return this._currentBeat; }
  getWaveform()         { return this._waveform; }
  getBeatInterval()     { return this._beatInterval; }

  // ── Setters ─────────────────────────────────────────────
  /**
   * @param {number} bpm
   * @returns {Metronome} this (chainable)
   */
  setBPM(bpm) {
    this._bpm = this._clampBPM(bpm);
    this._beatInterval = 60.0 / this._bpm;
    return this;
  }

  /**
   * @param {number} n  - beats per measure (>= 1)
   * @returns {Metronome} this
   */
  setBeatsPerMeasure(n) {
    if (typeof n === 'number' && n >= 1) {
      this._beatsPerMeasure = Math.floor(n);
    }
    return this;
  }

  /**
   * @param {boolean} enabled
   * @returns {Metronome} this
   */
  setAccentEnabled(enabled) {
    this._accentEnabled = !!enabled;
    return this;
  }

  /**
   * @param {'sine'|'square'|'triangle'} waveform
   * @returns {Metronome} this
   */
  setWaveform(waveform) {
    const valid = ['sine', 'square', 'triangle'];
    if (valid.includes(waveform)) {
      this._waveform = waveform;
    }
    return this;
  }

  /**
   * @param {Function} callback - (beatIndex, isAccent, audioTime) => void
   * @returns {Metronome} this
   */
  onBeat(callback) {
    this._onBeatCallbacks.push(callback);
    return this;
  }

  // ── Audio Context ───────────────────────────────────────
  _getAudioCtx() {
    if (!this._audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      this._audioCtx = new AudioCtor();
    }
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
    return this._audioCtx;
  }

  // ── Playback ─────────────────────────────────────────────
  /**
   * Start the metronome.
   * @returns {Metronome} this
   */
  play() {
    if (this._isPlaying) return this;
    this._isPlaying = true;
    this._nextBeatTime = this._getAudioCtx().currentTime + 0.05;
    this._runScheduler();
    return this;
  }

  /**
   * Stop the metronome.
   * @returns {Metronome} this
   */
  stop() {
    this._isPlaying = false;
    if (this._schedulerTimerId !== null) {
      clearTimeout(this._schedulerTimerId);
      this._schedulerTimerId = null;
    }
    return this;
  }

  /**
   * Reset beat counter to 0 without stopping.
   * @returns {Metronome} this
   */
  reset() {
    this._currentBeat = 0;
    return this;
  }

  // ── Scheduler ───────────────────────────────────────────
  /**
   * Look-ahead scheduler — called every LOOK_AHEAD_MS.
   * Schedules all beats within the look-ahead window.
   */
  _runScheduler() {
    if (!this._isPlaying) return;

    const ctx = this._getAudioCtx();
    const lookAhead = Metronome.LOOK_AHEAD_S;

    while (this._nextBeatTime < ctx.currentTime + lookAhead) {
      this._scheduleBeat(this._nextBeatTime);
      this._nextBeatTime += this._beatInterval;
    }

    this._schedulerTimerId = setTimeout(
      () => this._runScheduler(),
      Metronome.LOOK_AHEAD_MS
    );
  }

  /**
   * Schedule a single beat at the given AudioContext time.
   * @param {number} time - AudioContext time in seconds
   */
  _scheduleBeat(time) {
    const beatIndex = this._currentBeat;
    const isAccent  = this.isAccentBeat(beatIndex);
    const ctx       = this._getAudioCtx();
    const delay     = (time - ctx.currentTime) * 1000;

    // Schedule visual callback (on main thread, after audio fires)
    setTimeout(() => {
      if (!this._isPlaying) return;
      this._onBeatCallbacks.forEach(function(cb) {
        cb(beatIndex, isAccent, time);
      });
      this._currentBeat = (this._currentBeat + 1) % this._beatsPerMeasure;
    }, Math.max(0, delay));

    // Schedule audio (uses AudioContext time — immune to main-thread jank)
    this._playClick(time, isAccent);
  }

  // ── Sound Synthesis ─────────────────────────────────────
  /**
   * Synthesize a single metronome click at the given AudioContext time.
   * Uses Web Audio API oscillator + envelope + compressor.
   *
   * Sound design:
   *  - Sine wave (fundamental) + short noise transient
   *  - Fast attack (2ms), short decay (~80ms)
   *  - Accent beat: higher freq + slightly louder
   *  - DynamicsCompressor for clean clipping at high BPM
   *
   * @param {number} time      - AudioContext time
   * @param {boolean} isAccent - whether this is an accented beat
   */
  _playClick(time, isAccent) {
    const ctx = this._getAudioCtx();

    const freq    = isAccent ? this._accentFreq : this._baseFreq;
    const vel     = isAccent ? 1.0 : 0.6;
    const decay   = isAccent ? 0.09 : 0.07;

    // Oscillator
    const osc = ctx.createOscillator();
    osc.type = this._waveform;
    osc.frequency.setValueAtTime(freq, time);

    // Envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(vel, time + 0.002);     // 2ms attack
    env.gain.exponentialRampToValueAtTime(0.001, time + decay); // decay

    // Compressor (prevents clipping)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 4;
    comp.ratio.value = 6;
    comp.attack.value = 0.001;
    comp.release.value = 0.05;

    // Short noise transient for "click" texture
    const noiseDuration = Math.floor(ctx.sampleRate * 0.015); // 15ms
    const noiseBuffer = ctx.createBuffer(1, noiseDuration, ctx.sampleRate);
    const noiseData   = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseDuration; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseDuration * 0.3));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(vel * 0.25, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = freq * 1.5;

    // Connect
    osc.connect(env);
    env.connect(comp);
    comp.connect(ctx.destination);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // Start / stop
    osc.start(time);
    osc.stop(time + decay + 0.01);
    noise.start(time);
    noise.stop(time + 0.02);
  }

  // ── Helpers ──────────────────────────────────────────────
  isAccentBeat(beatIndex) {
    return this._accentEnabled && beatIndex === 0;
  }

  _clampBPM(bpm) {
    const n = parseInt(bpm, 10);
    if (isNaN(n)) return Metronome.DEFAULT_BPM;
    return Math.max(Metronome.MIN_BPM, Math.min(Metronome.MAX_BPM, n));
  }

  // ── Cleanup ─────────────────────────────────────────────
  /**
   * Release AudioContext resources.
   */
  dispose() {
    this.stop();
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }
  }
}

// ── ES Module / CommonJS export ────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Metronome };
}
if (typeof window !== 'undefined') {
  window.Metronome = Metronome;
}
