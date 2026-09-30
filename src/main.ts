import * as THREE from "three";
import { BACKGROUND, GRID, PHYSICS } from "./config";
import { colorForIndex, createMaterial, getGeometry, shapeForIndex } from "./shapes";
import { GridObject } from "./gridObject";
import { Pointer } from "./pointer";

const app = document.getElementById("app")!;

// ---------- 렌더러 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(BACKGROUND, 1);
app.appendChild(renderer.domElement);

// ---------- 씬 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);

// ---------- 직교 카메라 (정면에서 약간 내려다보는 시점) ----------
// 격자 전체를 담을 수 있는 뷰 크기 계산
const gridWidth = (GRID.cols - 1) * GRID.spacing;
const gridHeight = (GRID.rows - 1) * GRID.spacing;
const frustumHeight = Math.max(gridHeight, gridWidth * 0.6) + 4;

let camera: THREE.OrthographicCamera;
function makeCamera(): THREE.OrthographicCamera {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = frustumHeight / 2;
  const halfW = halfH * aspect;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
  // 정면에서 약간 위에 두고 살짝 내려다봅니다.
  cam.position.set(0, 4.5, 18);
  cam.lookAt(0, -0.3, 0);
  return cam;
}
camera = makeCamera();

// ---------- 조명 (넓고 부드럽게) ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));

const hemi = new THREE.HemisphereLight(0xfff6e8, 0xcfc7ba, 0.6);
scene.add(hemi);

// 주 조명: 그림자를 만들어 부드러운 접촉 그림자 생성
const key = new THREE.DirectionalLight(0xfff4e2, 1.15);
key.position.set(6, 14, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.radius = 8; // 부드러운 가장자리
key.shadow.bias = -0.0005;
const shadowCam = key.shadow.camera;
shadowCam.left = -gridWidth / 2 - 4;
shadowCam.right = gridWidth / 2 + 4;
shadowCam.top = gridHeight / 2 + 6;
shadowCam.bottom = -gridHeight / 2 - 6;
shadowCam.near = 1;
shadowCam.far = 40;
scene.add(key);

// 채움광(약하게, 그림자 없음)
const fill = new THREE.DirectionalLight(0xe8ecff, 0.35);
fill.position.set(-8, 4, 6);
scene.add(fill);

// ---------- 바닥 (그림자를 받는 면) ----------
// ShadowMaterial을 써서 바닥 색은 배경과 동일하게 두고 그림자만 얹습니다.
const floorY = -gridHeight / 2 - 1.4;
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(gridWidth + 20, gridHeight + 20),
  new THREE.ShadowMaterial({ opacity: 0.18 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, floorY, 0);
floor.receiveShadow = true;
scene.add(floor);

// ---------- 격자 배치 (6 × 4) ----------
const objects: GridObject[] = [];
const startX = -gridWidth / 2;
const startY = gridHeight / 2;

let index = 0;
for (let r = 0; r < GRID.rows; r++) {
  for (let c = 0; c < GRID.cols; c++) {
    const kind = shapeForIndex(index);
    const color = colorForIndex(index);
    const mesh = new THREE.Mesh(getGeometry(kind), createMaterial(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // 링은 정면을 향하도록 살짝 세워 둡니다.
    if (kind === "ring") {
      mesh.rotation.x = Math.PI / 2;
    }

    const home = new THREE.Vector3(
      startX + c * GRID.spacing,
      startY - r * GRID.spacing,
      0
    );
    const obj = new GridObject(mesh, home);
    scene.add(mesh);
    objects.push(obj);
    index++;
  }
}

// ---------- 포인터 ----------
const pointer = new Pointer(camera, renderer.domElement);

// ---------- 인터랙션: 마우스 주변 오브젝트에 충격 적용 ----------
const tmpDir = new THREE.Vector3();
const tmpSpin = new THREE.Vector3();

function applyInteraction(dt: number): void {
  if (!pointer.active) return;

  const speed = pointer.velocity.length(); // 월드/초
  const px = pointer.world.x;
  const py = pointer.world.y;
  const radius = PHYSICS.influenceRadius;
  const radiusSq = radius * radius;

  for (const obj of objects) {
    const p = obj.position;
    const dx = p.x - px;
    const dy = p.y - py;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) continue; // 영향 범위 밖 -> 움직이지 않음

    const dist = Math.sqrt(distSq) || 0.0001;
    // 가까울수록 강하게 (부드러운 감쇠)
    const falloff = 1 - dist / radius;
    const soft = falloff * falloff;

    // 기본은 포인터에서 바깥으로 밀어냄
    tmpDir.set(dx / dist, dy / dist, 0);

    // 빠르게 움직이면 이동 방향 성분을 더해 더 강하게 밀고 회전을 줌
    const velContribution = speed * PHYSICS.velocityStrength;
    tmpDir.x += (pointer.velocity.x / (speed || 1)) * (velContribution / PHYSICS.pushStrength);
    tmpDir.y += (pointer.velocity.y / (speed || 1)) * (velContribution / PHYSICS.pushStrength);
    tmpDir.normalize();

    const strength = (PHYSICS.pushStrength + velContribution) * soft * dt;

    // 회전 충격: 속도가 빠를수록, 가까울수록 크게. 무작위성으로 흩어지는 느낌.
    const spinMag = (PHYSICS.spinStrength * (0.4 + speed) * soft) * dt;
    tmpSpin.set(
      (Math.random() - 0.5) * spinMag,
      (Math.random() - 0.5) * spinMag,
      (Math.random() - 0.5) * spinMag * 1.5
    );

    obj.applyImpulse(tmpDir, strength, tmpSpin);
  }
}

// ---------- 애니메이션 루프 (프레임레이트 독립) ----------
const clock = new THREE.Clock();

function tick(): void {
  // dt를 상한으로 클램프해서 탭 전환 후 큰 점프를 방지 (안정적인 시뮬레이션)
  let dt = clock.getDelta();
  dt = Math.min(dt, PHYSICS.maxDelta);

  pointer.update(dt);
  applyInteraction(dt);
  for (const obj of objects) obj.update(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- 개발용 훅 (자동화 검증에 사용, 프로덕션 동작에는 영향 없음) ----------
// 각 오브젝트의 홈으로부터의 변위를 조회하거나, 임의 오브젝트에 충격을 줄 수 있습니다.
(window as unknown as Record<string, unknown>).__grid = {
  displacements: () =>
    objects.map((o) => o.position.distanceTo(o.worldHome)),
  poke: (i: number, fx: number, fy: number) =>
    objects[i]?.applyImpulse(new THREE.Vector3(fx, fy, 0).normalize(), Math.hypot(fx, fy), new THREE.Vector3(0.5, 0.5, 1)),
};

// ---------- 리사이즈 ----------
window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = frustumHeight / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
