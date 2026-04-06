/**
 * UI.js — Metronome User Interface Controller
 *
 * Responsibilities:
 *  - Bind DOM elements on load
 *  - Wire user input → Metronome methods
 *  - Receive onBeat callbacks → update visual indicators
 *  - Manage beat dot indicators and counter display
 *
 * Architecture:
 *  UI is the "outer shell" that talks to the Metronome core.
 *  All audio/timing logic lives in Metronome.js — UI never touches AudioContext.
 */

'use strict';

/**
 * @param {Metronome} metronome
 * @param {HTMLElement} rootEl - container element (default: document.body)
 */
function initUI(metronome, rootEl) {
  rootEl = rootEl || document.body;

  // ── Cache DOM elements ─────────────────────────────────
  const $ = (sel) => rootEl.querySelector(sel);

  const bpmDisplay   = $('#bpm-value');
  const bpmSlider    = $('#bpm-slider');
  const bpmInput     = $('#bpm-input');
  const btnMinus1    = $('#btn-minus-1');
  const btnMinus5    = $('#btn-minus-5');
  const btnPlus1     = $('#btn-plus-1');
  const btnPlus5     = $('#btn-plus-5');
  const btnPlay      = $('#btn-play');
  const btnReset     = $('#btn-reset');
  const beatCountEl  = $('#beat-count');
  const beatTotalEl  = $('#beat-total');
  const beatRow      = $('#beat-indicator-row');
  const tsBtns       = rootEl.querySelectorAll('.ts-btn');
  const waveBtns     = rootEl.querySelectorAll('.wave-btn');
  const accentToggle = $('#accent-toggle');

  // ── State ───────────────────────────────────────────────
  let beatsPerMeasure = 4;
  let currentBeat     = 0;
  let isPlaying       = false;

  // ── Build beat dots ─────────────────────────────────────
  function buildDots(n) {
    beatRow.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('div');
      dot.className = 'beat-dot';
      dot.dataset.beat = i;
      beatRow.appendChild(dot);
    }
    return beatRow.querySelectorAll('.beat-dot');
  }

  let dots = buildDots(beatsPerMeasure);

  // ── Update BPM display ───────────────────────────────────
  function updateBPMDisplay(bpm) {
    bpmDisplay.textContent = bpm;
    if (bpmInput) bpmInput.value = bpm;
    if (bpmSlider) bpmSlider.value = bpm;
  }

  // ── Update beat counter ──────────────────────────────────
  function updateBeatCounter(beat, total) {
    if (beatCountEl) beatCountEl.textContent = beat + 1;
    if (beatTotalEl) beatTotalEl.textContent = total;
  }

  // ── Pulse BPM display ───────────────────────────────────
  function pulseBPM() {
    bpmDisplay.classList.remove('pulse');
    // Force reflow
    void bpmDisplay.offsetWidth;
    bpmDisplay.classList.add('pulse');
  }

  // ── Update transport button ──────────────────────────────
  function updatePlayButton(playing) {
    btnPlay.textContent = playing ? '⏸ 暂停' : '▶ 播放';
  }

  // ── Highlight active time sig button ────────────────────
  function setActiveTS(btn) {
    tsBtns.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  // ── Highlight active wave button ───────────────────────
  function setActiveWave(btn) {
    waveBtns.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  // ── On beat callback ────────────────────────────────────
  function onBeat(beatIndex, isAccent) {
    currentBeat = beatIndex;

    // Update dots
    dots.forEach((dot, i) => {
      dot.classList.remove('active', 'accent');
      if (i === beatIndex) {
        dot.classList.add(isAccent ? 'accent' : 'active');
      }
    });

    // Update counter
    updateBeatCounter(beatIndex, beatsPerMeasure);

    // Pulse BPM
    pulseBPM();
  }

  // ── Register beat callback ───────────────────────────────
  metronome.onBeat(onBeat);

  // ── BPM Slider ───────────────────────────────────────────
  bpmSlider.addEventListener('input', (e) => {
    metronome.setBPM(parseInt(e.target.value, 10));
    updateBPMDisplay(metronome.getBPM());
  });

  // ── BPM Number Input ─────────────────────────────────────
  bpmInput.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      metronome.setBPM(val);
      updateBPMDisplay(metronome.getBPM());
    }
  });

  bpmInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') bpmInput.blur();
  });

  // ── BPM +/- buttons ─────────────────────────────────────
  function stepBPM(step) {
    metronome.setBPM(metronome.getBPM() + step);
    updateBPMDisplay(metronome.getBPM());
  }

  btnMinus1.addEventListener('click', () => stepBPM(-1));
  btnMinus5.addEventListener('click', () => stepBPM(-5));
  btnPlus1.addEventListener('click', () => stepBPM(+1));
  btnPlus5.addEventListener('click', () => stepBPM(+5));

  // ── Time Signature ──────────────────────────────────────
  tsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const beats = parseInt(btn.dataset.beats, 10);
      beatsPerMeasure = beats;
      metronome.setBeatsPerMeasure(beats);
      dots = buildDots(beats);
      updateBeatCounter(0, beats);
      setActiveTS(btn);
    });
  });

  // ── Waveform ────────────────────────────────────────────
  waveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      metronome.setWaveform(btn.dataset.wave);
      setActiveWave(btn);
    });
  });

  // ── Accent Toggle ───────────────────────────────────────
  accentToggle.addEventListener('change', (e) => {
    metronome.setAccentEnabled(e.target.checked);
  });

  // ── Play / Stop ─────────────────────────────────────────
  btnPlay.addEventListener('click', () => {
    if (isPlaying) {
      metronome.stop();
      isPlaying = false;
    } else {
      metronome.play();
      isPlaying = true;
    }
    updatePlayButton(isPlaying);
  });

  // Spacebar shortcut
  document.addEventListener('keydown', (e) => {
    if (e.target === bpmInput) return;
    if (e.code === 'Space') {
      e.preventDefault();
      btnPlay.click();
    }
  });

  // ── Reset ───────────────────────────────────────────────
  btnReset.addEventListener('click', () => {
    metronome.reset();
    currentBeat = 0;
    dots.forEach(d => d.classList.remove('active', 'accent'));
    updateBeatCounter(0, beatsPerMeasure);
  });

  // ── Sync UI on load ─────────────────────────────────────
  updateBPMDisplay(metronome.getBPM());
  updatePlayButton(false);
  updateBeatCounter(0, beatsPerMeasure);

  // ── Return public handle ────────────────────────────────
  return {
    metronome,
    setPlaying(p) { isPlaying = p; updatePlayButton(p); },
  };
}

// ── Auto-init when DOM is ready ────────────────────────────
(function initOnLoad() {
  function bootstrap() {
    const root = document.getElementById('app') || document.body;
    if (typeof window.Metronome === 'undefined') return;
    const m = new window.Metronome();
    window._metronomeInstance = m; // exposed BEFORE DOMContentLoaded for bunny scripts
    initUI(m, root);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

// ── Export ────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initUI };
}
