// scene.js
// Sets up the Three.js renderer, camera, lights, and the ground grid.
// Keeping this separate from physics/controls/UI makes it easy to swap
// rendering details (lighting, grid style, post-processing) later without
// touching simulation logic.

import * as THREE from 'three';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = null; // transparent — CSS handles the page background

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  camera.position.set(0, 1.4, 6.5);
  camera.lookAt(0, 0.3, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // --- Lighting: soft key + fill + rim, tuned for a "product shot" look ---
  const hemi = new THREE.HemisphereLight(0x8899aa, 0x14161a, 0.7);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff4e0, 1.4);
  key.position.set(4, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x4fd1e8, 0.25);
  fill.position.set(-5, 2, -3);
  scene.add(fill);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
  rimLight.position.set(0, 3, -6);
  scene.add(rimLight);

  // --- Ground grid (visual reference plane so tilt reads clearly) ---
  const gridGroup = new THREE.Group();

  const gridHelper = new THREE.GridHelper(14, 28, 0x3a3d44, 0x22242a);
  gridHelper.position.y = -1.2;
  gridGroup.add(gridHelper);

  // Faint circular "throwing ring" to anchor the scene visually
  const ringGeo = new THREE.RingGeometry(2.45, 2.5, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fd1e8, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.19;
  gridGroup.add(ring);

  // Soft shadow-catcher plane
  const shadowGeo = new THREE.PlaneGeometry(14, 14);
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.199;
  shadowPlane.receiveShadow = true;
  gridGroup.add(shadowPlane);

  scene.add(gridGroup);

  function resize(container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, renderer, gridGroup, resize };
}
