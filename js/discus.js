// discus.js
// Builds a stylized 3D discus mesh: a lathed rim profile (the metal/rubber
// edge) plus flat top/bottom faces (the painted disc faces) and a small
// raised hub in the center, matching a real discus's silhouette.
//
// All units are arbitrary "scene units" — roughly 1 unit = 10cm, so a
// regulation men's discus (22cm diameter) ends up about 2.2 units wide.
//
// THREE is passed in rather than imported statically — see scene.js for
// why (a static import of an unreachable CDN module can't be caught).

export function buildDiscus(THREE) {
  const group = new THREE.Group();

  // --- Rim profile (revolved around the Y axis to form the disc body) ---
  // Points trace the cross-section from center-out to the edge and back,
  // giving the characteristic lens/biconvex shape of a discus.
  const profile = [
    [0.0, 0.10],
    [0.55, 0.155],
    [0.92, 0.17],
    [1.05, 0.155],
    [1.12, 0.10],
    [1.12, -0.10],
    [1.05, -0.155],
    [0.92, -0.17],
    [0.55, -0.155],
    [0.0, -0.10],
  ];
  const points = profile.map(p => new THREE.Vector2(p[0], p[1]));
  const rimGeo = new THREE.LatheGeometry(points, 64);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a76,
    roughness: 0.55,
    metalness: 0.2,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.castShadow = true;
  rim.receiveShadow = true;

  // --- Top / bottom painted faces ---
  const faceGeo = new THREE.CircleGeometry(0.92, 64);
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0xd99a1e,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const topFace = new THREE.Mesh(faceGeo, faceMat);
  topFace.rotation.x = -Math.PI / 2;
  topFace.position.y = 0.171;
  topFace.receiveShadow = true;

  const faceMatBottom = faceMat.clone();
  faceMatBottom.color = new THREE.Color(0xb5800e);
  const botFace = new THREE.Mesh(faceGeo, faceMatBottom);
  botFace.rotation.x = Math.PI / 2;
  botFace.position.y = -0.171;
  botFace.receiveShadow = true;

  // --- Center hub (the raised disc around the finger grip) ---
  const hubGeo = new THREE.CircleGeometry(0.32, 48);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e4,
    roughness: 0.5,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const hubTop = new THREE.Mesh(hubGeo, hubMat);
  hubTop.rotation.x = -Math.PI / 2;
  hubTop.position.y = 0.172;
  const hubBot = new THREE.Mesh(hubGeo, hubMat);
  hubBot.rotation.x = Math.PI / 2;
  hubBot.position.y = -0.172;

  // --- Center dot ---
  const dotGeo = new THREE.CircleGeometry(0.07, 32);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.6 });
  const dotTop = new THREE.Mesh(dotGeo, dotMat);
  dotTop.rotation.x = -Math.PI / 2;
  dotTop.position.y = 0.173;
  const dotBot = new THREE.Mesh(dotGeo, dotMat);
  dotBot.rotation.x = Math.PI / 2;
  dotBot.position.y = -0.173;

  // --- Front-edge marker (small fin) so rotation/orientation is always legible ---
  // This points toward the throw direction (+Z in the discus's local space)
  // and is what makes the "front edge" camera lock meaningful.
  const markerGeo = new THREE.ConeGeometry(0.09, 0.2, 12);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0x4fd1e8, roughness: 0.4 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(0, 0.18, 1.12);
  marker.rotation.x = Math.PI / 2;

  group.add(rim, topFace, botFace, hubTop, hubBot, dotTop, dotBot, marker);

  // The lathe revolves around Y, but we want the discus to lie flat with
  // its face normal along Y (i.e. resting on the XZ "ground" plane) —
  // it already does, so no extra rotation needed here. Tilt is applied
  // by the caller via group.rotation.
  return group;
}
