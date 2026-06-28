// ui.js
// Wires up all the DOM controls (sliders, toggles, preset buttons) and
// keeps a central `state` object in sync, calling `onChange` whenever
// anything the simulation cares about is updated. Also handles purely
// cosmetic UI updates (slider value labels, wind dial needle, preset
// active-state highlighting) that don't need to touch Three.js.

const WIND_PRESETS = {
  tail:  { windDirection: 180, label: 'Tailwind' },
  head:  { windDirection: 0,   label: 'Headwind' },
  qhl:   { windDirection: 315, label: 'Quarter headwind (left)' },
  qtl:   { windDirection: 225, label: 'Quarter tailwind (left)' },
  qhr:   { windDirection: 45,  label: 'Quarter headwind (right)' },
  qtr:   { windDirection: 135, label: 'Quarter tailwind (right)' },
};

export function createUI(onChange) {
  const state = {
    windSpeed: 0,
    windDirection: 0,
    gustsEnabled: false,
    gustStrength: 3,
    releaseAngle: 35,
    tiltAngle: 20,
    spinRate: 6,
    releaseSpeed: 22,
    handedness: 'right',
    activePreset: null,
  };

  const el = id => document.getElementById(id);

  function emit() { onChange({ ...state }); }

  // --- Wind speed ---
  el('wind-speed').addEventListener('input', e => {
    state.windSpeed = parseFloat(e.target.value);
    el('wind-speed-val').textContent = `${state.windSpeed.toFixed(1)} m/s`;
    state.activePreset = null;
    updatePresetHighlight();
    emit();
  });

  // --- Wind direction ---
  el('wind-dir').addEventListener('input', e => {
    state.windDirection = parseFloat(e.target.value);
    el('wind-dir-val').textContent = `${Math.round(state.windDirection)}°`;
    updateDial();
    state.activePreset = null;
    updatePresetHighlight();
    emit();
  });

  // --- Gust toggle ---
  el('gusts-toggle').addEventListener('click', () => {
    state.gustsEnabled = !state.gustsEnabled;
    el('gusts-toggle').dataset.on = String(state.gustsEnabled);
    el('gusts-toggle').setAttribute('aria-pressed', String(state.gustsEnabled));
    el('gust-strength-wrap').style.display = state.gustsEnabled ? 'flex' : 'none';
    emit();
  });

  el('gust-strength').addEventListener('input', e => {
    state.gustStrength = parseFloat(e.target.value);
    el('gust-strength-val').textContent = `${state.gustStrength.toFixed(1)} m/s`;
    emit();
  });

  // --- Throw controls ---
  el('release-angle').addEventListener('input', e => {
    state.releaseAngle = parseFloat(e.target.value);
    el('release-angle-val').textContent = `${state.releaseAngle}°`;
    emit();
  });

  el('tilt-angle').addEventListener('input', e => {
    state.tiltAngle = parseFloat(e.target.value);
    el('tilt-angle-val').textContent = `${state.tiltAngle}°`;
    emit();
  });

  el('spin-rate').addEventListener('input', e => {
    state.spinRate = parseFloat(e.target.value);
    el('spin-rate-val').textContent = `${state.spinRate} rev/s`;
    emit();
  });

  el('release-speed').addEventListener('input', e => {
    state.releaseSpeed = parseFloat(e.target.value);
    el('release-speed-val').textContent = `${state.releaseSpeed} m/s`;
    emit();
  });

  // --- Handedness toggle ---
  let handednessChangeFn = null;
  el('handedness-btn').addEventListener('click', () => {
    state.handedness = state.handedness === 'right' ? 'left' : 'right';
    el('handedness-btn').textContent = state.handedness === 'right' ? 'Right-handed' : 'Left-handed';
    el('handedness-btn').dataset.hand = state.handedness;
    emit();
    handednessChangeFn && handednessChangeFn();
  });

  function onHandednessChange(fn) { handednessChangeFn = fn; }

  // --- Wind presets ---
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      const preset = WIND_PRESETS[key];
      if (!preset) return;
      state.windDirection = preset.windDirection;
      if (state.windSpeed < 2) state.windSpeed = 4; // ensure preset is visible if wind was off
      state.activePreset = key;
      el('wind-dir').value = state.windDirection;
      el('wind-dir-val').textContent = `${state.windDirection}°`;
      el('wind-speed').value = state.windSpeed;
      el('wind-speed-val').textContent = `${state.windSpeed.toFixed(1)} m/s`;
      updateDial();
      updatePresetHighlight();
      emit();
    });
  });

  function updatePresetHighlight() {
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === state.activePreset);
    });
  }

  function updateDial() {
    const needle = el('dial-needle');
    needle.style.transform = `rotate(${state.windDirection}deg)`;
  }

  // --- Free rotate button (handled by main.js via callback) ---
  function onFreeformClick(fn) {
    el('freeform-btn').addEventListener('click', fn);
  }

  // --- Throw button ---
  function onThrowClick(fn) {
    el('throw-btn').addEventListener('click', fn);
  }

  function setReadouts({ distance, drift, flightTime }) {
    el('readout-distance').textContent = distance != null ? `${distance.toFixed(1)} m` : '—';
    el('readout-drift').textContent = drift != null ? `${drift >= 0 ? '+' : ''}${drift.toFixed(1)} m` : '—';
    el('readout-time').textContent = flightTime != null ? `${flightTime.toFixed(2)} s` : '—';
  }

  function setCoaching({ icon, title, detail }) {
    el('coaching-icon').textContent = icon;
    el('coaching-title').textContent = title;
    el('coaching-detail').textContent = detail;
  }

  function setAim({ aimOffsetDeg, aimText }) {
    el('sector-arrow').style.transform = `rotate(${aimOffsetDeg}deg)`;
    el('aim-readout').textContent = aimText;
  }

  // The wind arrow shows where the wind is COMING FROM, pointing inward
  // toward the thrower, so beginners can read "wind's blowing at me from
  // there." windDirection convention: 0 = headwind (from straight ahead,
  // i.e. from the far side of the sector), 180 = tailwind (from behind
  // the thrower), 90 = from the right, 270 = from the left — matching
  // physics.js / coaching.js.
  function setWindArrow(windDirection) {
    // The sector diagram's "ahead" direction (away from "you") is -y in
    // SVG space, i.e. a rotate(0) arrow already points away from "you."
    // A headwind (windDirection=0) should appear to blow FROM ahead
    // TOWARD the thrower, so we point the wind arrow back down the same
    // axis windDirection already uses, offset by 180 since "coming from
    // ahead" visually means the arrowhead points at the thrower.
    el('wind-arrow').style.transform = `rotate(${windDirection}deg)`;
  }

  function setCamReadout(text) {
    el('cam-readout').textContent = text;
  }

  function hideStageHint() {
    const hint = el('stage-hint');
    if (hint) hint.style.opacity = '0';
  }

  updateDial();
  updatePresetHighlight();

  return {
    state,
    onFreeformClick,
    onThrowClick,
    onHandednessChange,
    setReadouts,
    setCoaching,
    setAim,
    setWindArrow,
    setCamReadout,
    hideStageHint,
    clearPresetHighlight: () => { state.activePreset = null; updatePresetHighlight(); },
  };
}
