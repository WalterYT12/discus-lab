// main.js
// App entry point. Wires together scene.js (rendering), discus.js (mesh),
// camera-orbit.js (drag-to-orbit the CAMERA around a fixed discus, plus
// animated jumps to a preset view), physics.js (simulation), trajectory.js
// (3D flight path), flightpath2d.js (2D side view), coaching.js (feedback
// text), and ui.js (DOM controls) — and runs the render loop.
//
// ROTATION MODEL (per product decision): the discus never spins from user
// input. Dragging always orbits the CAMERA around a fixed discus, the same
// way orbiting a camera around an object works in a 3D modeling tool — the
// object and its axes never change, only the vantage point does. The
// discus's own rotation is driven ENTIRELY by the physical tilt + the
// coaching system's recommended roll (dip-this-edge) for the current wind,
// so what you see always matches what the coaching text says. Clicking a
// wind preset animates the camera to a good viewing angle on that same
// orbit sphere; it does not lock or disable dragging.

import { createScene } from './scene.js';
import { buildDiscus } from './discus.js';
import { createCameraOrbit } from './camera-orbit.js';
import { simulateThrow } from './physics.js';
import { createTrajectoryRenderer } from './trajectory.js';
import { renderFlightPath2D } from './flightpath2d.js';
import { getCoaching } from './coaching.js';
import { createUI } from './ui.js';

// --- Camera-orbit presets: each wind condition has a camera viewing angle
//     (azimuth = around, elevation = up/down) chosen so the discus's tilt
//     reads clearly — mostly edge-on with a slight downward look, swung
//     toward whichever side is dipping. ---
const CAMERA_PRESETS = {
  tail: { azimuth: 0,    elevation: 8 },
  head: { azimuth: 180,  elevation: 8 },
  qhl:  { azimuth: -35,  elevation: 10 },
  qtl:  { azimuth: 145,  elevation: 10 },
  qhr:  { azimuth: 35,   elevation: 10 },
  qtr:  { azimuth: -145, elevation: 10 },
};

function normalizeDeg(d) {
  const m = ((d % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}

function init() {
  const canvas = document.getElementById('three-canvas');
  const stageEl = document.getElementById('stage');

  const { scene, camera, renderer, resize } = createScene(canvas);

  const discusGroup = buildDiscus();
  scene.add(discusGroup);

  const trajectoryRenderer = createTrajectoryRenderer(scene);

  // --- UI wiring (created first so `ui` is in scope for callbacks below) ---
  const ui = createUI(handleStateChange);

  // --- Camera orbit: dragging moves the viewer around the fixed discus ---
  const camOrbit = createCameraOrbit(camera, { x: 0, y: 0.3, z: 0 }, stageEl, {
    radius: 6.5,
    initialAzimuth: 0,
    initialElevation: 12,
    onChange: (azimuth, elevation) => {
      ui.setCamReadout(`${normalizeDeg(azimuth).toFixed(1)}° / ${normalizeDeg(elevation).toFixed(1)}°`);
    },
  });
  camOrbit.setOnDragStart(() => {
    ui.hideStageHint();
    ui.clearPresetHighlight();
  });

  ui.onFreeformClick(() => {
    camOrbit.animateTo(0, 12);
    ui.clearPresetHighlight();
  });

  ui.onThrowClick(() => {
    runSimulation(ui.state);
  });

  ui.onHandednessChange(() => {
    handleStateChange(ui.state);
  });

  // Wind preset buttons animate the camera to a clear viewing angle for
  // that condition. They do NOT touch the discus's rotation directly —
  // the discus's tilt/roll comes from handleStateChange -> coaching below,
  // same as it does for manual slider changes.
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      const camPreset = CAMERA_PRESETS[key];
      if (camPreset) camOrbit.animateTo(camPreset.azimuth, camPreset.elevation);
      ui.hideStageHint();
      handleStateChange(ui.state);
    });
  });

  function handleStateChange(state) {
    const coaching = getCoaching(state.windSpeed, state.windDirection, state.tiltAngle, state.handedness);
    ui.setCoaching(coaching);
    ui.setAim(coaching);
    ui.setWindArrow(state.windDirection);
    applyDiscusAttitude(state.tiltAngle, coaching.rollDeg);
    const result = runSimulation(state);
    renderFlightPath2D(document.getElementById('flightpath-svg'), result, state);
  }

  // The discus mesh's visible pitch directly reflects the tiltAngle slider
  // (the same value physics.js uses), and its roll reflects the coaching
  // system's recommended edge-dip for the current wind — so the model on
  // screen always matches both the physics and the advice being given.
  function applyDiscusAttitude(tiltAngleDeg, rollDeg) {
    discusGroup.rotation.order = 'XZY';
    discusGroup.rotation.x = -tiltAngleDeg * Math.PI / 180;
    discusGroup.rotation.z = rollDeg * Math.PI / 180;
  }

  function runSimulation(state) {
    const result = simulateThrow({
      releaseAngle: state.releaseAngle,
      tiltAngle: state.tiltAngle,
      spinRate: state.spinRate,
      releaseSpeed: state.releaseSpeed,
      windSpeed: state.windSpeed,
      windDirection: state.windDirection,
      gustsEnabled: state.gustsEnabled,
      gustStrength: state.gustStrength,
      handedness: state.handedness,
    });
    trajectoryRenderer.render(result);
    ui.setReadouts(result);
    return result;
  }

  // Initial pass
  handleStateChange(ui.state);

  // --- Resize handling ---
  function handleResize() { resize(stageEl); }
  window.addEventListener('resize', handleResize);
  handleResize();

  // --- Render loop ---
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

document.addEventListener('DOMContentLoaded', init);

