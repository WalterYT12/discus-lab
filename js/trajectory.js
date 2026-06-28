// trajectory.js
// Renders the simulated flight path as a glowing line in 3D space, plus a
// landing marker. Distances from physics.js (meters) are scaled down to
// match the scene's "1 unit ~ 10cm" convention used by the discus mesh and
// grid, so the arc sits naturally above the grid instead of flying off
// into the distance.

import * as THREE from 'three';

const SCENE_SCALE = 0.12; // 1 meter = 0.12 scene units (keeps long throws on-screen)

export function createTrajectoryRenderer(scene) {
  let lineObj = null;
  let landingMarker = null;
  let landingRing = null;

  function clear() {
    if (lineObj) { scene.remove(lineObj); lineObj.geometry.dispose(); lineObj.material.dispose(); lineObj = null; }
    if (landingMarker) { scene.remove(landingMarker); landingMarker = null; }
    if (landingRing) { scene.remove(landingRing); landingRing = null; }
  }

  function render(simResult) {
    clear();
    if (!simResult || !simResult.points.length) return;

    const positions = [];
    for (const p of simResult.points) {
      // physics: x = sideways drift, y = height, z = downrange distance
      positions.push(p.x * SCENE_SCALE, p.y * SCENE_SCALE - 1.2, p.z * SCENE_SCALE);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const mat = new THREE.LineBasicMaterial({ color: 0x4fd1e8, linewidth: 2, transparent: true, opacity: 0.9 });
    lineObj = new THREE.Line(geo, mat);
    scene.add(lineObj);

    // Landing marker: small flag/pin at the final point
    const last = simResult.points[simResult.points.length - 1];
    const lx = last.x * SCENE_SCALE;
    const lz = last.z * SCENE_SCALE;

    const markerGeo = new THREE.ConeGeometry(0.06, 0.22, 16);
    const markerMat = new THREE.MeshStandardMaterial({ color: 0x4fd1e8, emissive: 0x1a4a52, roughness: 0.4 });
    landingMarker = new THREE.Mesh(markerGeo, markerMat);
    landingMarker.position.set(lx, -1.2 + 0.11, lz);
    scene.add(landingMarker);

    const ringGeo = new THREE.RingGeometry(0.1, 0.14, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    landingRing = new THREE.Mesh(ringGeo, ringMat);
    landingRing.rotation.x = -Math.PI / 2;
    landingRing.position.set(lx, -1.19, lz);
    scene.add(landingRing);
  }

  return { render, clear };
}
