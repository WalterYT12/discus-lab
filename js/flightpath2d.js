// flightpath2d.js
// Draws a simple 2D side-view (height on the Y axis, downrange distance
// on the X axis) of the simulated flight path into a target <svg> element.
// This is a flat, easy-to-read companion to the 3D scene — useful for
// quickly seeing how release angle / tilt / speed change the SHAPE of the
// arc, without needing to rotate the camera to judge it.
//
// Pure rendering function: takes the same simResult produced by
// physics.js's simulateThrow() plus the current throw-setting state (for
// the release-point indicator), and draws into whatever <svg> element is
// passed in. No internal state of its own.

const PADDING_LEFT = 36;
const PADDING_BOTTOM = 22;
const PADDING_TOP = 14;
const PADDING_RIGHT = 14;

export function renderFlightPath2D(svgEl, simResult, state) {
  if (!svgEl) return;
  svgEl.innerHTML = '';

  const vb = svgEl.viewBox.baseVal;
  const width = vb.width || 280;
  const height = vb.height || 160;

  const plotW = width - PADDING_LEFT - PADDING_RIGHT;
  const plotH = height - PADDING_TOP - PADDING_BOTTOM;

  if (!simResult || !simResult.points.length) return;

  // Determine axis scale: distance on X, height on Y, with a little
  // headroom above the apex so the arc doesn't touch the top edge.
  const maxDistance = Math.max(10, simResult.distance * 1.08);
  const maxHeight = Math.max(3, simResult.apex * 1.25);

  function toSvgX(z) { return PADDING_LEFT + (z / maxDistance) * plotW; }
  function toSvgY(y) { return PADDING_TOP + plotH - (y / maxHeight) * plotH; }

  const ns = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // --- Ground line ---
  svgEl.appendChild(el('line', {
    x1: PADDING_LEFT, y1: toSvgY(0), x2: width - PADDING_RIGHT, y2: toSvgY(0),
    class: 'fp-ground',
  }));

  // --- Y-axis gridlines + labels (height, in meters) ---
  const heightStep = niceStep(maxHeight, 4);
  for (let h = 0; h <= maxHeight; h += heightStep) {
    const y = toSvgY(h);
    svgEl.appendChild(el('line', {
      x1: PADDING_LEFT, y1: y, x2: width - PADDING_RIGHT, y2: y, class: 'fp-grid',
    }));
    const label = el('text', { x: PADDING_LEFT - 6, y: y + 3, class: 'fp-axis-label', 'text-anchor': 'end' });
    label.textContent = `${Math.round(h)}`;
    svgEl.appendChild(label);
  }

  // --- X-axis labels (distance, in meters) ---
  const distStep = niceStep(maxDistance, 4);
  for (let d = 0; d <= maxDistance; d += distStep) {
    const x = toSvgX(d);
    const label = el('text', { x, y: height - 6, class: 'fp-axis-label', 'text-anchor': 'middle' });
    label.textContent = `${Math.round(d)}`;
    svgEl.appendChild(label);
  }

  // --- Flight path curve ---
  const pathPoints = simResult.points
    .filter((_, i) => i % 2 === 0) // thin out for a lighter path string
    .map(p => `${toSvgX(p.z).toFixed(1)},${toSvgY(Math.max(0, p.y)).toFixed(1)}`)
    .join(' ');
  svgEl.appendChild(el('polyline', { points: pathPoints, class: 'fp-path' }));

  // --- Release point marker ---
  const releasePt = simResult.points[0];
  if (releasePt) {
    svgEl.appendChild(el('circle', {
      cx: toSvgX(releasePt.z), cy: toSvgY(releasePt.y), r: 3.5, class: 'fp-release',
    }));
  }

  // --- Apex marker ---
  let apexPoint = simResult.points[0];
  for (const p of simResult.points) if (p.y > apexPoint.y) apexPoint = p;
  svgEl.appendChild(el('circle', {
    cx: toSvgX(apexPoint.z), cy: toSvgY(apexPoint.y), r: 3, class: 'fp-apex',
  }));
  const apexLabel = el('text', {
    x: toSvgX(apexPoint.z), y: toSvgY(apexPoint.y) - 8, class: 'fp-apex-label', 'text-anchor': 'middle',
  });
  apexLabel.textContent = `${simResult.apex.toFixed(1)}m`;
  svgEl.appendChild(apexLabel);

  // --- Landing marker ---
  const landPt = simResult.points[simResult.points.length - 1];
  svgEl.appendChild(el('circle', {
    cx: toSvgX(landPt.z), cy: toSvgY(0), r: 3.5, class: 'fp-landing',
  }));
  const landLabel = el('text', {
    x: toSvgX(landPt.z), y: toSvgY(0) + 16, class: 'fp-landing-label', 'text-anchor': 'middle',
  });
  landLabel.textContent = `${simResult.distance.toFixed(1)}m`;
  svgEl.appendChild(landLabel);
}

/** Picks a "nice" axis step size so labels land on round numbers. */
function niceStep(maxValue, targetTicks) {
  const raw = maxValue / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3.5) step = 2;
  else if (norm < 7.5) step = 5;
  else step = 10;
  return step * mag;
}
