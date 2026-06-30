// physics.js
// A simplified but structured discus flight simulation.
//
// ASSUMPTIONS (intentionally simple for v1 — see comments for how each
// could be made more realistic later):
//   1. The discus is treated as a point mass with an attached "attitude"
//      (tilt angle) that determines lift/drag coefficients, rather than
//      simulating full 6-DOF rigid body rotation. Real discus flight
//      involves gyroscopic precession (spin keeps the disc's attitude
//      roughly fixed in space while the flight path curves under it),
//      which changes the effective angle of attack throughout the flight.
//      We approximate this by holding the tilt fixed for the whole flight
//      and using the angle BETWEEN the tilt and the velocity vector as the
//      effective angle of attack — this captures the headwind/tailwind/
//      crosswind asymmetry without needing full rotational dynamics.
//   2. Lift and drag coefficients vs. angle-of-attack are modeled with
//      simple smooth curves (not measured wind-tunnel data for a real
//      discus). They're tuned so the qualitative behavior — headwinds
//      help via added lift, tailwinds hurt via lift loss, crosswinds
//      drift the disc sideways — comes out right, and distances land in
//      a believable range (35-65m for elite-level inputs).
//   3. Wind is a constant vector for the whole flight, optionally with a
//      pseudo-random "gust" function layered on top that varies smoothly
//      over time (not based on real turbulence spectra).
//   4. SIMPLIFIED spin-direction side-lift: real discus flight has a
//      well-documented asymmetry where the longest throws for a given
//      thrower come from a quartering wind on their dominant side (e.g.
//      quarter-headwind-from-the-right for a right-hander), because the
//      disc spins clockwise (viewed from above) off a right hand and
//      counterclockwise off a left hand, and that spin direction
//      interacts with crosswind to add or remove lift asymmetrically —
//      similar in spirit to a Magnus effect, though the real mechanism in
//      discus is more about gyroscopic precession changing the effective
//      angle of attack than classic Magnus lift. Rather than simulate
//      full rigid-body precession, we add a SIDE-LIFT term proportional
//      to (crosswind component) x (spin rate) x (handedness sign), tuned
//      so the favorable-quarter / unfavorable-quarter distance gap roughly
//      matches what coaches and biomechanics writeups describe
//      qualitatively. This is a deliberate simplification, not a
//      first-principles derivation — see the seam noted below for
//      upgrading it.
//   5. Units: meters, seconds, m/s, kilograms, radians internally
//      (degrees at the UI boundary).
//
// HOW TO IMPROVE LATER (left as seams in the code):
//   - Replace point-mass + fixed-attitude with full rigid-body torque
//     integration (gyroscopic precession) for accurate spin-stabilized
//     flight — this would naturally produce the favorable-quarter-wind
//     asymmetry instead of needing the hand-tuned SPIN_SIDE_LIFT_COEFF
//     constant below.
//   - Replace the hand-tuned Cl(alpha)/Cd(alpha) curves with digitized
//     wind-tunnel data (several biomechanics papers publish discus
//     aerodynamic coefficient tables).
//   - Add turbulence/gust modeled as filtered noise instead of a sine
//     wave.

const GRAVITY = 9.81;           // m/s^2
const AIR_DENSITY = 1.225;      // kg/m^3 at sea level
const DISCUS_MASS = 2.0;        // kg (men's regulation discus)
const DISCUS_AREA = 0.0616;     // m^2, frontal area ~ pi * (0.221/2)^2 scaled for tilt projection
const DISCUS_RADIUS = 0.1105;   // m — not yet used; reserved for a future
                                 // moment-of-inertia model

// Tunable strength of the simplified spin-direction side-lift effect
// (see assumption #4 above). Calibrated so a moderate quartering wind on
// the favorable side gains a few meters over the same wind on the
// unfavorable side, matching the qualitative size of the effect described
// in discus coaching literature — not derived from first-principles
// aerodynamics.
const SPIN_SIDE_LIFT_COEFF = 0.018;

/**
 * Lift coefficient as a function of angle of attack (radians).
 * Peaks around a moderate positive AoA, drops off (and goes negative /
 * "stalls") past a critical angle — a simplified thin-airfoil-like curve.
 * Magnitude is tuned to realistic discus Cl values (peak roughly 0.35-0.45
 * per biomechanics literature), much lower than a true airfoil, since a
 * discus is a blunt rotating disc, not a wing.
 */
function liftCoefficient(alpha) {
  const alphaDeg = alpha * 180 / Math.PI;
  const stallAngle = 28; // degrees, beyond which lift falls off
  const peak = 0.38;
  if (Math.abs(alphaDeg) <= stallAngle) {
    return peak * Math.sin((alphaDeg / stallAngle) * (Math.PI / 2));
  }
  // Past stall, lift falls off but doesn't vanish entirely
  const over = Math.abs(alphaDeg) - stallAngle;
  const sign = Math.sign(alphaDeg);
  return sign * Math.max(0.08, peak - over * 0.012);
}

/**
 * Drag coefficient as a function of angle of attack (radians).
 * Minimum drag near zero AoA, increasing roughly with |alpha|.
 * Baseline Cd0 ~0.15 matches published discus drag estimates at small AoA.
 */
function dragCoefficient(alpha) {
  const alphaDeg = Math.abs(alpha * 180 / Math.PI);
  const cd0 = 0.15; // baseline drag at zero angle of attack
  return cd0 + 0.00045 * alphaDeg * alphaDeg;
}

/**
 * Simulates one discus throw and returns a time-sampled trajectory plus
 * summary stats. All angle inputs are in DEGREES (UI-friendly); internally
 * converted to radians.
 *
 * @param {Object} params
 * @param {number} params.releaseAngle   - vertical release angle, degrees above horizontal
 * @param {number} params.tiltAngle      - discus attitude tilt in degrees above horizontal,
 *                                          held fixed for the whole flight (independent of
 *                                          release angle — see assumption #1)
 * @param {number} params.spinRate       - revolutions per second
 * @param {number} params.releaseSpeed   - m/s
 * @param {number} params.windSpeed      - m/s
 * @param {number} params.windDirection  - degrees, 0 = pure headwind, 180 = pure tailwind,
 *                                          90 = crosswind from the right, 270 = from the left
 *                                          (matches the UI dial: 0 at top = headwind)
 * @param {boolean} params.gustsEnabled
 * @param {number} params.gustStrength   - m/s, amplitude of gust variation
 * @param {string} [params.handedness]   - 'right' or 'left' (default 'right').
 *                                          Determines spin direction for the
 *                                          simplified side-lift effect (see
 *                                          assumption #4) — right-handers spin
 *                                          the disc clockwise from above, so a
 *                                          quartering wind from their right is
 *                                          the favorable side, and the mirror
 *                                          holds for left-handers.
 * @returns {Object} { points: [{x,y,z,t}], distance, drift, flightTime, apex }
 */
export function simulateThrow(params) {
  const {
    releaseAngle,
    tiltAngle,
    spinRate,
    releaseSpeed,
    windSpeed,
    windDirection,
    gustsEnabled,
    gustStrength,
    handedness = 'right',
  } = params;

  const dt = 1 / 120; // integration timestep (seconds) — small for stability
  const maxTime = 8;

  // Convert release angle to a velocity vector. +Z is the throw direction
  // (downrange), +Y is up, +X is rightward drift (crosswind axis).
  const releaseRad = releaseAngle * Math.PI / 180;
  let vz = releaseSpeed * Math.cos(releaseRad);
  let vy = releaseSpeed * Math.sin(releaseRad);
  let vx = 0;

  let x = 0, y = 1.4, z = 0; // release height ~1.4m (approximate shoulder/arm height)
  let t = 0;

  // Wind vector decomposition. windDirection: 0 = headwind (blowing toward
  // thrower, i.e. opposing throw => negative Z component), 180 = tailwind,
  // 90 = from the right (wind travels toward -X / left), 270 = from the
  // left (wind travels toward +X / right).
  const windRad = windDirection * Math.PI / 180;
  // Base wind blows FROM windDirection, so its velocity vector points
  // opposite that compass bearing onto the field.
  const baseWindZ = -windSpeed * Math.cos(windRad); // headwind (0deg) -> opposes throw
  const baseWindX = -windSpeed * Math.sin(windRad); // from-right (90deg) -> travels toward -X

  const points = [];
  let apex = 0;

  // Tilt is the discus's attitude angle in absolute terms (degrees above
  // horizontal), held fixed for the whole flight per assumption #1 above.
  // This is independent of release angle — a thrower chooses release angle
  // (how high they launch it) and tilt (how the disc's face is angled)
  // somewhat separately, and the gap between the two is what determines
  // the angle of attack at release.
  const tiltRad = tiltAngle * Math.PI / 180;

  // Spin contributes a small stability bonus (less effective drag) at
  // higher spin rates, reflecting real discus behavior where adequate
  // spin keeps the throw "locked in" rather than wobbling/tumbling.
  const spinStabilityFactor = Math.min(1, spinRate / 6); // 6 rev/s ~ "fully stable"
  const wobblePenalty = (1 - spinStabilityFactor) * 0.04;

  // Spin direction sign for the simplified side-lift effect (assumption
  // #4): +1 for right-handed (clockwise from above), -1 for left-handed.
  // A positive sign means a crosswind FROM THE RIGHT (positive relVx
  // component, since wind-from-the-right travels toward -X — see baseWindX
  // below) is the favorable side.
  const spinSign = handedness === 'left' ? -1 : 1;

  while (t < maxTime) {
    // --- Gust layering (smooth pseudo-random variation over time) ---
    let gustZ = 0, gustX = 0;
    if (gustsEnabled) {
      gustZ = Math.sin(t * 3.1 + 1.3) * gustStrength * 0.5;
      gustX = Math.sin(t * 2.3) * gustStrength * 0.35;
    }
    const windZ = baseWindZ + gustZ;
    const windX = baseWindX + gustX;

    // Velocity of the disc relative to the air (this is what generates
    // aerodynamic forces, not ground-relative velocity).
    const relVz = vz - windZ;
    const relVx = vx - windX;
    const relVy = vy;
    const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy + relVz * relVz) || 0.0001;

    // Angle of the relative-wind vector in the vertical (Y-Z) plane.
    // Crosswind (relVx) is handled separately below and doesn't affect
    // this pitch-plane angle of attack in this simplified model.
    const relWindAngle = Math.atan2(relVy, relVz);

    // Effective angle of attack: how far the disc's fixed nose direction
    // sits above/below the direction the air is actually coming from.
    const alpha = tiltRad - relWindAngle;

    const cl = liftCoefficient(alpha);
    const cd = dragCoefficient(alpha) + wobblePenalty;

    const q = 0.5 * AIR_DENSITY * relSpeed * relSpeed; // dynamic pressure
    const liftForce = q * DISCUS_AREA * cl;
    const dragForce = q * DISCUS_AREA * cd;

    // Simplified spin-direction side-lift (assumption #4): adds extra
    // upward lift when the crosswind comes from the favorable side for
    // this thrower's handedness, and removes lift when it comes from the
    // unfavorable side. relVx > 0 corresponds to wind from the right; for
    // a right-handed thrower (spinSign=+1) that's the favorable side, so
    // this term is positive there and negative for wind from the left —
    // and the whole thing flips for a left-handed thrower. Scaled by
    // spin rate, since a faster-spinning disc holds this aerodynamic
    // asymmetry more strongly (a slow/wobbly throw won't show it as much).
    const sideLiftBoost = SPIN_SIDE_LIFT_COEFF * relVx * spinSign * spinStabilityFactor;
    const extraLiftForce = q * DISCUS_AREA * sideLiftBoost;

    // Drag acts opposite the relative-velocity direction (full 3D).
    const dragDirX = -relVx / relSpeed;
    const dragDirY = -relVy / relSpeed;
    const dragDirZ = -relVz / relSpeed;

    // Lift acts perpendicular to the relative-wind vector, in the same
    // vertical (Y-Z) plane, rotated +90° from the relative-wind direction
    // toward "up". This is the standard 2D lift convention applied within
    // the pitch plane. The side-lift boost is added directly to the
    // vertical component as a simplification (see assumption #4) rather
    // than computed as a true 3D cross-product force.
    const liftDirY = Math.cos(relWindAngle);
    const liftDirZ = -Math.sin(relWindAngle);

    const ax =
      (dragForce * dragDirX) / DISCUS_MASS;
    const ay =
      -GRAVITY + (liftForce * liftDirY + extraLiftForce + dragForce * dragDirY) / DISCUS_MASS;
    const az =
      (liftForce * liftDirZ + dragForce * dragDirZ) / DISCUS_MASS;

    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    t += dt;
    apex = Math.max(apex, y);

    points.push({ x, y, z, t });

    if (y <= 0 && t > 0.05) break;
  }

  const last = points[points.length - 1] || { x: 0, z: 0, t: 0 };

  return {
    points,
    distance: Math.max(0, last.z),
    drift: last.x,
    flightTime: last.t,
    apex,
  };
}
