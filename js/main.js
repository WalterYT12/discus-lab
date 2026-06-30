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

async function init() {
  const canvas = document.getElementById('three-canvas');
  const stageEl = document.getElementById('stage');

  // --- UI wiring created FIRST. This matters: setup3DScene below
  // constructs the camera orbit, which calls its onChange callback
  // SYNCHRONOUSLY during setup (to apply its initial position) — so `ui`
  // must already exist before that happens, or the callback throws
  // trying to access it before its declaration finishes initializing. ---
  const ui = createUI(handleStateChange);

  // The 3D scene depends on Three.js loading successfully from its CDN.
  // That's the single most likely thing to fail on a phone (flaky mobile
  // network, a CDN hiccup, a content blocker) — and previously, if it
  // failed, the exception aborted ALL of init(), including the readouts,
  // coaching text, wind arrow, and flight path, none of which actually
  // need Three.js at all.
  //
  // Three.js is loaded with a DYNAMIC import() here rather than a static
  // `import` statement at the top of the file. This distinction matters:
  // a static import that fails to resolve (CDN unreachable, blocked, etc)
  // fails the entire module graph before any of our code runs at all,
  // in a way JavaScript does not let you catch. A dynamic import()
  // returns a promise that rejects normally on failure, which CAN be
  // caught — that's the only way to make this failure recoverable.
  let scene3D = null;
  try {
    scene3D = await setup3DScene(canvas, stageEl, (azimuth, elevation) => {
      ui.setCamReadout(`${normalizeDeg(azimuth).toFixed(1)}° / ${normalizeDeg(elevation).toFixed(1)}°`);
    });
  } catch (err) {
    console.error('3D scene failed to initialize:', err);
    show3DFallbackNotice(stageEl, err);
  }

  if (scene3D) {
    scene3D.camOrbit.setOnDragStart(() => {
      ui.hideStageHint();
      ui.clearPresetHighlight();
    });
    ui.onFreeformClick(() => {
      scene3D.camOrbit.animateTo(0, 12);
      ui.clearPresetHighlight();
    });
  } else {
    ui.onFreeformClick(() => ui.clearPresetHighlight());
  }

  ui.onThrowClick(() => {
    runSimulation(ui.state);
  });

  ui.onHandednessChange(() => {
    handleStateChange(ui.state);
  });

  // Wind preset buttons animate the camera to a clear viewing angle for
  // that condition (when the 3D scene is available). They do NOT touch
  // the discus's rotation directly — the discus's tilt/roll comes from
  // handleStateChange -> coaching below, same as it does for manual
  // slider changes. The coaching/readout/flight-path side of this always
  // runs, with or without the 3D scene.
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.preset;
      if (scene3D) {
        const camPreset = CAMERA_PRESETS[key];
        if (camPreset) scene3D.camOrbit.animateTo(camPreset.azimuth, camPreset.elevation);
      }
      ui.hideStageHint();
      handleStateChange(ui.state);
    });
  });

  function handleStateChange(state) {
    const coaching = getCoaching(state.windSpeed, state.windDirection, state.tiltAngle, state.handedness);
    ui.setCoaching(coaching);
    ui.setAim(coaching);
    ui.setWindArrow(state.windDirection);
    if (scene3D) applyDiscusAttitude(scene3D.discusGroup, state.tiltAngle, coaching.rollDeg);
    const result = runSimulation(state);
    renderFlightPath2D(document.getElementById('flightpath-svg'), result, state);
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
    if (scene3D) scene3D.trajectoryRenderer.render(result);
    ui.setReadouts(result);
    return result;
  }

  // Initial pass
  handleStateChange(ui.state);

  // --- Resize handling ---
  if (scene3D) {
    function handleResize() { scene3D.resize(stageEl); }
    window.addEventListener('resize', handleResize);
    handleResize();

    // --- Render loop ---
    function animate() {
      requestAnimationFrame(animate);
      scene3D.renderer.render(scene3D.scene, scene3D.camera);
    }
    animate();
  }
}

// Builds everything Three.js-dependent in one place, so a failure here
// (most commonly: the CDN script for 'three' failing to load) can be
// caught as a single unit by init()'s try/catch above, without partially
// constructing a broken scene. THREE itself is loaded here via dynamic
// import() — see the comment in init() for why that matters.
async function setup3DScene(canvas, stageEl, onCameraChange) {
  const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');

  const { scene, camera, renderer, resize } = createScene(THREE, canvas);

  const discusGroup = buildDiscus(THREE);
  scene.add(discusGroup);

  const trajectoryRenderer = createTrajectoryRenderer(THREE, scene);

  const camOrbit = createCameraOrbit(camera, { x: 0, y: 0.3, z: 0 }, stageEl, {
    radius: 6.5,
    initialAzimuth: 0,
    initialElevation: 12,
    onChange: onCameraChange,
  });

  return { scene, camera, renderer, resize, discusGroup, trajectoryRenderer, camOrbit };
}

// The discus mesh's visible pitch directly reflects the tiltAngle slider
// (the same value physics.js uses), and its roll reflects the coaching
// system's recommended edge-dip for the current wind — so the model on
// screen always matches both the physics and the advice being given.
function applyDiscusAttitude(discusGroup, tiltAngleDeg, rollDeg) {
  discusGroup.rotation.order = 'XZY';
  discusGroup.rotation.x = -tiltAngleDeg * Math.PI / 180;
  discusGroup.rotation.z = rollDeg * Math.PI / 180;
}

// Shown inside the 3D viewport area specifically (not a full-page
// takeover like the boot-error overlay) when the 3D scene fails but the
// rest of the app is still usable — e.g. the CDN serving Three.js was
// unreachable. The person can still use every slider, see distances,
// coaching, and the flight path diagram; they just won't see the 3D
// discus until the page is reloaded with a working connection to the CDN.
function show3DFallbackNotice(stageEl, err) {
  const notice = document.createElement('div');
  notice.style.cssText = `
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    padding: 24px; gap: 8px; color: #9a9fa6; font-size: 13px; line-height: 1.5;
  `;
  notice.innerHTML = `
    <div style="font-weight:600; color:#eceef0;">3D view unavailable</div>
    <div>Couldn't load the 3D engine — check your connection and reload.<br>Everything else below still works.</div>
  `;
  stageEl.appendChild(notice);
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await init();
  } catch (err) {
    showFatalError(err);
  }
});

// Shows a plain, readable error message directly on the page when init()
// fails. This exists specifically so failures can be diagnosed on devices
// where attaching a debugger/console isn't practical (e.g. an iPhone with
// no Mac available for Safari's Web Inspector). Remove once the app is
// stable, or leave it in — it only ever appears if something throws.
function showFatalError(err) {
  console.error('Discus Lab failed to start:', err);
  const box = document.createElement('div');
  box.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    background: #0a0b0d; color: #eceef0;
    font-family: monospace; font-size: 13px; line-height: 1.5;
    padding: 20px; overflow: auto; white-space: pre-wrap;
  `;
  box.innerHTML =
    '<div style="color:#e8634f; font-weight:bold; margin-bottom:12px;">App failed to start</div>' +
    '<div style="color:#9a9fa6; margin-bottom:12px;">Screenshot this and send it back — it tells us exactly what broke.</div>' +
    '<div>' + escapeHtml(err && err.message ? err.message : String(err)) + '</div>' +
    '<div style="margin-top:12px; color:#5c6066;">' + escapeHtml(err && err.stack ? err.stack : '(no stack trace)') + '</div>';
  document.body.appendChild(box);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

