import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const canvas = document.querySelector<HTMLCanvasElement>("#app") ?? (() => {
  const c = document.createElement("canvas");
  c.id = "app";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.appendChild(c);
  return c;
})();

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Scene / Camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 0, 6);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 3.0;
controls.maxDistance = 20.0;

// Lights
// 太陽っぽい強い光 + ほんのり環境光
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(5, 2, 5);
scene.add(sun);

const ambient = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambient);

// ====== Textures ======
const loader = new THREE.TextureLoader();
const dayMap = loader.load("/textures/earth_day.jpg");
dayMap.colorSpace = THREE.SRGBColorSpace;

const normalMap = tryLoad("/textures/earth_normal.jpg", loader);
const specMap = tryLoad("/textures/earth_specular.jpg", loader);
const nightMap = tryLoad("/textures/earth_night.jpg", loader);
if (nightMap) nightMap.colorSpace = THREE.SRGBColorSpace;

const cloudsMap = tryLoad("/textures/earth_clouds.png", loader);
if (cloudsMap) cloudsMap.colorSpace = THREE.SRGBColorSpace;

// ====== Earth (Phongで“それっぽい”反射) ======
const earthGeo = new THREE.SphereGeometry(1, 128, 128);
const earthMat = new THREE.MeshPhongMaterial({
  map: dayMap,
  normalMap: normalMap ?? undefined,
  specularMap: specMap ?? undefined,
  specular: new THREE.Color(0x333333),
  shininess: 18,
});
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// ====== Night lights (夜側にだけ加算) ======
// 「夜景が昼側にも見える」問題を避けるため、簡易的にライト方向でマスクする
let nightMesh: THREE.Mesh | null = null;
if (nightMap) {
  const nightMat = new THREE.MeshBasicMaterial({
    map: nightMap,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  nightMesh = new THREE.Mesh(earthGeo, nightMat);
  nightMesh.renderOrder = 1;
  scene.add(nightMesh);
}

// ====== Clouds ======
let clouds: THREE.Mesh | null = null;
if (cloudsMap) {
  const cloudsGeo = new THREE.SphereGeometry(1.008, 128, 128);
  const cloudsMat = new THREE.MeshLambertMaterial({
    map: cloudsMap,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
  clouds.renderOrder = 2;
  scene.add(clouds);
}

// ====== Atmosphere (外側の淡い発光：簡易版) ======
const atmoGeo = new THREE.SphereGeometry(1.03, 128, 128);
const atmoMat = new THREE.MeshBasicMaterial({
  color: 0x66aaff,
  transparent: true,
  opacity: 0.08,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
});
const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
atmosphere.renderOrder = 3;
scene.add(atmosphere);

// ====== Stars (Pointsで“星屑”) ======
const stars = makeStarField({
  count: 8000,
  radius: 900,
  depth: 600,
});
scene.add(stars);

// ====== Animation ======
const clock = new THREE.Clock();

function tick() {
  const t = clock.getElapsedTime();

  // 地球の自転
  earth.rotation.y = t * 0.08;

  // 雲は少し速く
  if (clouds) clouds.rotation.y = t * 0.11;

  // 夜景マスク（ライト方向に応じて透明度をいじる簡易版）
  if (nightMesh) {
    const lightDir = new THREE.Vector3().copy(sun.position).normalize();
    // 地球中心から見た「ライトが当たる面」の基準をシェーダでやるのが理想だけど、
    // まずは“夜景が強すぎる”を抑えるために全体強度を控えめにしておく
    (nightMesh.material as THREE.MeshBasicMaterial).opacity = 0.6;
    // ここは後でカスタムシェーダにする余地あり（本格的にやるならここが伸びしろ）
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ====== Resize ======
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ====== helpers ======
function tryLoad(path: string, l: THREE.TextureLoader) {
  try {
    return l.load(path);
  } catch {
    return null;
  }
}

function makeStarField(opts: { count: number; radius: number; depth: number }) {
  const { count, radius, depth } = opts;
  const positions = new Float32Array(count * 3);

  // カメラの周りに「広く」「奥行き」あるようにばら撒く
  for (let i = 0; i < count; i++) {
    const r = radius + Math.random() * depth;
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);

    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}
