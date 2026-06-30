// camera-orbit.js
// Orbits the CAMERA around a fixed point in space (the discus) on a sphere
// of constant radius, parameterized by azimuth (horizontal angle around
// the discus) and elevation (vertical angle above/below it). The discus
// itself never rotates from user input — it only holds whatever physical
// tilt the current wind/throw settings call for. Dragging the mouse moves
// the VIEWER around that fixed discus, the same way orbiting a camera
// around an object works in a 3D modeling tool: the object and its axes
// never change, only the vantage point does.
//
// Math: standard spherical-to-Cartesian conversion.
//   x = r * cos(elevation) * sin(azimuth)
//   y = r * sin(elevation)
//   z = r * cos(elevation) * cos(azimuth)
// azimuth = 0 points the camera at the discus from "in front" (+Z),
// increasing azimuth swings the camera around to the right.

export function createCameraOrbit(camera, lookAtTarget, stageEl, opts = {}) {
  const radius = opts.radius ?? 6.5;
  const sensitivity = opts.sensitivity ?? 0.4;
  const minElevation = opts.minElevation ?? -80;
  const maxElevation = opts.maxElevation ?? 80;

  let azimuth = opts.initialAzimuth ?? 0;
  let elevation = opts.initialElevation ?? 12; // degrees above horizontal
  let animFrame = null;
  let dragging = false;
  let lastX = 0, lastY = 0;
  let onDragStart = null;

  function deg2rad(d) { return d * Math.PI / 180; }

  function apply() {
    const az = deg2rad(azimuth);
    const el = deg2rad(elevation);
    camera.position.x = radius * Math.cos(el) * Math.sin(az);
    camera.position.y = radius * Math.sin(el) + lookAtTarget.y;
    camera.position.z = radius * Math.cos(el) * Math.cos(az);
    camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
    opts.onChange && opts.onChange(azimuth, elevation);
  }

  function animateTo(targetAzimuth, targetElevation, duration = 900) {
    cancelAnimationFrame(animFrame);
    const startAz = azimuth, startEl = elevation;

    // Take the shorter path around the circle for azimuth (e.g. going
    // from 350deg to 10deg should rotate +20, not -340).
    let deltaAz = targetAzimuth - startAz;
    while (deltaAz > 180) deltaAz -= 360;
    while (deltaAz < -180) deltaAz += 360;

    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      azimuth = startAz + deltaAz * eased;
      elevation = startEl + (targetElevation - startEl) * eased;
      apply();
      if (t < 1) animFrame = requestAnimationFrame(step);
    }
    animFrame = requestAnimationFrame(step);
  }

  // --- Drag-to-orbit input (mouse + touch) ---
  function onPointerDown(x, y) {
    dragging = true;
    lastX = x; lastY = y;
    cancelAnimationFrame(animFrame);
    stageEl.classList.add('dragging');
    onDragStart && onDragStart();
  }
  function onPointerMove(x, y) {
    if (!dragging) return;
    const dx = x - lastX, dy = y - lastY;
    // Dragging right moves the camera around to the right (azimuth+),
    // matching standard "orbit" tools (Blender, Sketchfab, etc).
    azimuth += dx * sensitivity;
    elevation = Math.max(minElevation, Math.min(maxElevation, elevation + dy * sensitivity));
    lastX = x; lastY = y;
    apply();
  }
  function onPointerUp() {
    dragging = false;
    stageEl.classList.remove('dragging');
  }

  stageEl.addEventListener('mousedown', e => { onPointerDown(e.clientX, e.clientY); e.preventDefault(); });
  window.addEventListener('mousemove', e => onPointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onPointerUp);
  stageEl.addEventListener('touchstart', e => onPointerDown(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  stageEl.addEventListener('touchmove', e => onPointerMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  stageEl.addEventListener('touchend', onPointerUp);

  apply();

  return {
    animateTo,
    getAngles() { return { azimuth, elevation }; },
    setOnDragStart(fn) { onDragStart = fn; },
  };
}
