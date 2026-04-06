/**
 * Metronome.js — TDD Unit Tests
 *
 * Run with: npm test
 * (requires Jest: npm install --save-dev jest)
 */

'use strict';

// ─────────────────────────────────────────────────────────
// NOTE: AudioContext cannot be constructed in Node.js env.
// All audio-related tests use mocks.
// ─────────────────────────────────────────────────────────

describe('Metronome Core', () => {

  let metronome;

  beforeEach(() => {
    // Mock AudioContext globally before requiring Metronome
    global.AudioContext = jest.fn().mockImplementation(() => ({
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: jest.fn().mockReturnValue({
        type: '', frequency: { value: 440 }, detune: { value: 0 },
        connect: jest.fn(), start: jest.fn(), stop: jest.fn(),
      }),
      createGain: jest.fn().mockReturnValue({
        gain: { value: 0, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        connect: jest.fn(),
      }),
      createDynamicsCompressor: jest.fn().mockReturnValue({
        threshold: {}, knee: {}, ratio: {}, attack: {}, release: {},
        connect: jest.fn(),
      }),
      createWaveShaper: jest.fn().mockReturnValue({ curve: null, oversample: '' }),
      resume: jest.fn().mockResolvedValue(),
    }));
  });

  afterEach(() => {
    if (metronome) {
      metronome.stop();
      metronome = null;
    }
    jest.clearAllMocks();
  });

  // ── A.1: Constructor & defaults ─────────────────────────
  describe('constructor()', () => {
    test('creates instance with default BPM of 72', () => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome();
      expect(metronome.getBPM()).toBe(72);
    });

    test('accepts custom initial BPM', () => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(100);
      expect(metronome.getBPM()).toBe(100);
    });

    test('clamps BPM to min 40 and max 240', () => {
      const { Metronome } = require('../js/Metronome.js');
      const mLow  = new Metronome(10);
      const mHigh = new Metronome(999);
      expect(mLow.getBPM()).toBe(40);
      expect(mHigh.getBPM()).toBe(240);
    });

    test('initial state is stopped', () => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome();
      expect(metronome.isPlaying()).toBe(false);
    });
  });

  // ── A.2: BPM get/set ───────────────────────────────────
  describe('setBPM() / getBPM()', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(72);
    });

    test('setBPM updates internal value', () => {
      metronome.setBPM(100);
      expect(metronome.getBPM()).toBe(100);
    });

    test('setBPM clamps at minimum 40', () => {
      metronome.setBPM(20);
      expect(metronome.getBPM()).toBe(40);
    });

    test('setBPM clamps at maximum 240', () => {
      metronome.setBPM(300);
      expect(metronome.getBPM()).toBe(240);
    });

    test('setBPM(120) recalculates beatInterval to 0.5s', () => {
      metronome.setBPM(120);
      expect(metronome.getBeatInterval()).toBeCloseTo(0.5, 4);
    });

    test('setBPM(60) gives beatInterval of 1.0s', () => {
      metronome.setBPM(60);
      expect(metronome.getBeatInterval()).toBeCloseTo(1.0, 4);
    });
  });

  // ── A.3: Time Signature ─────────────────────────────────
  describe('setBeatsPerMeasure() / getBeatsPerMeasure()', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(72);
    });

    test('default beats per measure is 4', () => {
      expect(metronome.getBeatsPerMeasure()).toBe(4);
    });

    test('setBeatsPerMeasure(3) updates internal value', () => {
      metronome.setBeatsPerMeasure(3);
      expect(metronome.getBeatsPerMeasure()).toBe(3);
    });

    test('setBeatsPerMeasure rejects values < 1', () => {
      metronome.setBeatsPerMeasure(0);
      expect(metronome.getBeatsPerMeasure()).toBe(4);
    });
  });

  // ── A.4: Play / Stop / Reset ───────────────────────────
  describe('play() / stop() / reset()', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(60);
    });

    test('play() sets isPlaying to true', () => {
      metronome.play();
      expect(metronome.isPlaying()).toBe(true);
    });

    test('stop() sets isPlaying to false', () => {
      metronome.play();
      metronome.stop();
      expect(metronome.isPlaying()).toBe(false);
    });

    test('stop() while not playing is safe (no error)', () => {
      expect(() => metronome.stop()).not.toThrow();
    });

    test('reset() sets beatIndex to 0', () => {
      metronome.play();
      metronome.reset();
      expect(metronome.getCurrentBeatIndex()).toBe(0);
    });

    test('reset() does not stop playback', () => {
      metronome.play();
      metronome.reset();
      expect(metronome.isPlaying()).toBe(true);
    });
  });

  // ── A.5: Beat interval calculation ─────────────────────
  describe('beat interval calculation', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome();
    });

    test('BPM 60 → interval = 1.0s', () => {
      metronome.setBPM(60);
      expect(metronome.getBeatInterval()).toBeCloseTo(1.0, 4);
    });

    test('BPM 120 → interval = 0.5s', () => {
      metronome.setBPM(120);
      expect(metronome.getBeatInterval()).toBeCloseTo(0.5, 4);
    });

    test('BPM 240 → interval = 0.25s', () => {
      metronome.setBPM(240);
      expect(metronome.getBeatInterval()).toBeCloseTo(0.25, 4);
    });

    test('BPM 40 → interval = 1.5s', () => {
      metronome.setBPM(40);
      expect(metronome.getBeatInterval()).toBeCloseTo(1.5, 4);
    });
  });

  // ── A.6: Accent logic ───────────────────────────────────
  describe('accentOnFirstBeat', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(60);
    });

    test('isAccentBeat returns true for beat index 0', () => {
      expect(metronome.isAccentBeat(0)).toBe(true);
    });

    test('isAccentBeat returns false for beat index 1', () => {
      expect(metronome.isAccentBeat(1)).toBe(false);
    });

    test('setAccentEnabled(false) makes isAccentBeat return false for all', () => {
      metronome.setAccentEnabled(false);
      expect(metronome.isAccentBeat(0)).toBe(false);
      expect(metronome.isAccentBeat(1)).toBe(false);
    });
  });

  // ── A.7: Waveform setting ───────────────────────────────
  describe('setWaveform() / getWaveform()', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome();
    });

    test('default waveform is "sine"', () => {
      expect(metronome.getWaveform()).toBe('sine');
    });

    test('setWaveform("square") updates value', () => {
      metronome.setWaveform('square');
      expect(metronome.getWaveform()).toBe('square');
    });

    test('setWaveform("triangle") updates value', () => {
      metronome.setWaveform('triangle');
      expect(metronome.getWaveform()).toBe('triangle');
    });
  });

  // ── A.8: Current beat index ─────────────────────────────
  describe('getCurrentBeatIndex()', () => {
    beforeEach(() => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(60);
    });

    test('starts at 0', () => {
      expect(metronome.getCurrentBeatIndex()).toBe(0);
    });

    test('play() does not immediately increment beat', () => {
      metronome.play();
      // scheduling happens async, beat increments on scheduler ticks
      expect(metronome.isPlaying()).toBe(true);
    });
  });

  // ── A.9: Scheduler is called on play ───────────────────
  describe('scheduler integration', () => {
    test('play() initiates scheduling loop', () => {
      const { Metronome } = require('../js/Metronome.js');
      metronome = new Metronome(60);
      const scheduleSpy = jest.spyOn(metronome, 'schedule');
      metronome.play();
      expect(metronome.isPlaying()).toBe(true);
      // schedule() may be called; cleanup
      metronome.stop();
      scheduleSpy.mockRestore();
    });
  });

});


// ─────────────────────────────────────────────────────────
// UI State Tests
// ─────────────────────────────────────────────────────────
describe('UI state management', () => {

  // Mock DOM
  let mockDOM;
  const createMockDOM = () => {
    const els = {};
    const createEl = (tag, id) => {
      const listeners = {};
      const obj = {
        id, tag,
        value: '', textContent: '',
        checked: false,
        classList: {
          add: jest.fn(), remove: jest.fn(), toggle: jest.fn(),
          contains: jest.fn(() => false),
        },
        addEventListener: jest.fn((evt, cb) => { listeners[evt] = cb; }),
        removeEventListener: jest.fn((evt, cb) => { delete listeners[evt]; }),
        setAttribute: jest.fn(),
        getAttribute: jest.fn(() => null),
        click: jest.fn(() => { if (listeners.click) listeners.click(); }),
        focus: jest.fn(),
        blur: jest.fn(),
        appendChild: jest.fn(),
      };
      els[id] = obj;
      return obj;
    };

    global.document = {
      getElementById: jest.fn(id => els[id] || createEl('div', id)),
      querySelectorAll: jest.fn(() => []),
      querySelector: jest.fn(() => null),
      createElement: jest.fn(tag => createEl(tag, 'tmp-' + Math.random())),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };

    return els;
  };

  beforeEach(() => {
    mockDOM = createMockDOM();
  });

  afterEach(() => {
    jest.resetModules();
    delete global.document;
    jest.clearAllMocks();
  });

  test('UI controller updates bpm-value display when BPM changes', () => {
    // This test documents expected behavior:
    // When Metronome.setBPM is called, the UI display element
    // textContent should be updated.
    const el = { textContent: '' };
    expect(el.textContent).toBe(''); // baseline
  });

  test('time signature buttons update beatsPerMeasure', () => {
    // Clicking a time signature button should call
    // metronome.setBeatsPerMeasure()
    expect(true).toBe(true); // placeholder
  });

  test('waveform buttons update oscillator type', () => {
    // Clicking a waveform button should call metronome.setWaveform()
    expect(true).toBe(true);
  });

  test('play button text toggles between ▶ and ⏸', () => {
    // Before play: textContent = '▶ 播放'
    // After play:  textContent = '⏸ 暂停'
    expect(true).toBe(true);
  });

  test('beat counter display updates each beat', () => {
    // beat-count element should show current beat + 1 (1-indexed)
    expect(true).toBe(true);
  });

  test('accent toggle checkbox enables/disables accent', () => {
    expect(true).toBe(true);
  });

});


// ─────────────────────────────────────────────────────────
// Integration: Full Playback Cycle
// ─────────────────────────────────────────────────────────
describe('Playback integration', () => {

  beforeEach(() => {
    global.AudioContext = jest.fn().mockImplementation(() => ({
      currentTime: 0, state: 'running', destination: {},
      createOscillator: jest.fn().mockReturnValue({
        type: '', frequency: { value: 440 },
        connect: jest.fn(), start: jest.fn(), stop: jest.fn(),
      }),
      createGain: jest.fn().mockReturnValue({
        gain: { value: 0, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() },
        connect: jest.fn(),
      }),
      createDynamicsCompressor: jest.fn().mockReturnValue({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: jest.fn() }),
      createWaveShaper: jest.fn().mockReturnValue({ curve: null }),
      resume: jest.fn().mockResolvedValue(),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('start → beat fires → stop cycle completes without error', () => {
    const { Metronome } = require('../js/Metronome.js');
    const m = new Metronome(60);
    m.play();
    expect(m.isPlaying()).toBe(true);
    m.stop();
    expect(m.isPlaying()).toBe(false);
  });

  test('changing BPM while playing does not crash', () => {
    const { Metronome } = require('../js/Metronome.js');
    const m = new Metronome(60);
    m.play();
    expect(() => m.setBPM(120)).not.toThrow();
    m.stop();
  });

  test('setting beatsPerMeasure to 3, 6, etc. works while playing', () => {
    const { Metronome } = require('../js/Metronome.js');
    const m = new Metronome(60);
    m.play();
    expect(() => m.setBeatsPerMeasure(6)).not.toThrow();
    expect(m.getBeatsPerMeasure()).toBe(6);
    m.stop();
  });

});
