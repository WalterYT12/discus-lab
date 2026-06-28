// coaching.js
// Translates the current wind settings (and simulation result, once a
// throw has been made) into plain-language coaching feedback and an aim
// recommendation. Kept separate from physics so the *wording* can evolve
// independently of the simulation math.

/**
 * windDirection convention (matches physics.js / UI dial):
 *   0   = pure headwind (blowing into the thrower's face)
 *   180 = pure tailwind
 *   90  = crosswind from the right
 *   270 = crosswind from the left
 *
 * handedness ('right' | 'left'): mirrors only the "which edge to dip"
 * technique cue, since that's tied to which way the discus spins off the
 * thrower's hand. The wind-driven drift and aim-offset direction are NOT
 * mirrored — wind from a given compass direction pushes the discus the
 * same way regardless of which hand threw it, so mirroring those would
 * be physically wrong.
 */
export function getCoaching(windSpeed, windDirection, tiltAngle, handedness = 'right') {
  const mirror = handedness === 'left';
  const edge = (side) => {
    // side is 'left' or 'right' as computed for a right-handed thrower;
    // flip the label for a left-handed thrower's technique cue.
    if (!mirror) return side;
    return side === 'left' ? 'right' : 'left';
  };

  if (windSpeed < 0.5) {
    return {
      icon: '—',
      title: 'Calm conditions',
      detail: 'No meaningful wind. Throw your normal tilt and aim straight down the middle of the sector.',
      aimOffsetDeg: 0,
      aimText: 'Aim center of sector',
    };
  }

  // Classify the wind into one of six buckets for coaching language,
  // using 45-degree windows centered on each cardinal/quarter direction.
  const d = ((windDirection % 360) + 360) % 360;

  const isHead = d >= 337.5 || d < 22.5;
  const isTail = d >= 157.5 && d < 202.5;
  const isQuarterHeadRight = d >= 22.5 && d < 67.5;
  const isQuarterTailRight = d >= 112.5 && d < 157.5;
  const isQuarterHeadLeft = d >= 292.5 && d < 337.5;
  const isQuarterTailLeft = d >= 202.5 && d < 247.5;
  // (67.5-112.5 and 247.5-292.5 are pure crosswind bands, treated as
  // a blend below)

  let title, detail, aimOffsetDeg, aimText, rollDeg;

  if (isHead) {
    title = 'Headwind';
    detail = `A headwind at ${windSpeed.toFixed(1)} m/s gives the discus more lift than usual for a given tilt. Flatten your tilt somewhat (lower nose angle than you'd use in calm air) to avoid ballooning and stalling, and throw straight down the middle.`;
    aimOffsetDeg = 0;
    aimText = 'Aim center of sector';
    rollDeg = 0;
  } else if (isTail) {
    title = 'Tailwind';
    detail = `A tailwind at ${windSpeed.toFixed(1)} m/s reduces the relative airflow over the discus, so you get less natural lift. Nose the discus up more than usual to manufacture lift yourself, and throw straight down the middle.`;
    aimOffsetDeg = 0;
    aimText = 'Aim center of sector';
    rollDeg = 0;
  } else if (isQuarterHeadLeft) {
    title = 'Quarter headwind (left)';
    detail = `Wind hitting your front-left will push the discus rightward as it rises. Dip the ${edge('right')} edge of the discus slightly and aim toward the left side of the sector to compensate.`;
    aimOffsetDeg = -18;
    aimText = 'Aim left of center';
    rollDeg = mirror ? 22 : -22; // negative = right edge down (for right-handed)
  } else if (isQuarterTailLeft) {
    title = 'Quarter tailwind (left)';
    detail = `Wind from your back-left pushes the discus rightward. Nose up slightly more than calm-air technique, dip the ${edge('left')} edge slightly, and aim toward the right side of the sector.`;
    aimOffsetDeg = 18;
    aimText = 'Aim right of center';
    rollDeg = mirror ? -18 : 18; // positive = left edge down (for right-handed)
  } else if (isQuarterHeadRight) {
    title = 'Quarter headwind (right)';
    detail = `Wind hitting your front-right pushes the discus leftward as it rises. Dip the ${edge('left')} edge slightly and aim toward the right side of the sector.`;
    aimOffsetDeg = 18;
    aimText = 'Aim right of center';
    rollDeg = mirror ? -22 : 22;
  } else if (isQuarterTailRight) {
    title = 'Quarter tailwind (right)';
    detail = `Wind from your back-right pushes the discus leftward. Nose up slightly more than calm-air technique, dip the ${edge('right')} edge slightly, and aim toward the left side of the sector.`;
    aimOffsetDeg = -18;
    aimText = 'Aim left of center';
    rollDeg = mirror ? 18 : -18;
  } else {
    // Pure crosswind band
    const fromRight = d < 180;
    title = fromRight ? 'Crosswind (from the right)' : 'Crosswind (from the left)';
    detail = `A direct crosswind at ${windSpeed.toFixed(1)} m/s will drift the discus ${fromRight ? 'left' : 'right'} through the flight. Aim toward the ${fromRight ? 'right' : 'left'} side of the sector to land in the middle.`;
    aimOffsetDeg = fromRight ? 22 : -22;
    aimText = fromRight ? 'Aim right of center' : 'Aim left of center';
    rollDeg = fromRight ? -20 : 20;
    if (mirror) rollDeg = -rollDeg;
  }

  // Scale the aim suggestion (and roll) mildly with wind speed (stronger
  // wind, more correction) — capped so the visual tilt never looks absurd.
  const speedScale = Math.min(1.6, windSpeed / 6);
  aimOffsetDeg = Math.round(aimOffsetDeg * speedScale);
  rollDeg = Math.round(rollDeg * speedScale);

  return {
    icon: title[0],
    title,
    detail,
    aimOffsetDeg,
    aimText,
    rollDeg,
  };
}
