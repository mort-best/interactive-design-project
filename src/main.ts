import * as THREE from "three";
import { BACKGROUND, GRID, PHYSICS } from "./config";
import { colorForIndex, createMaterial, getGeometry, shapeForIndex } from "./shapes";
import { GridObject } from "./gridObject";
import { Pointer } from "./pointer";
import { applyColliders, type Collider } from "./interaction";
import { HandTracker } from "./hand/handTracker";
import { HandInput } from "./hand/handInput";
import { HandUI } from "./hand/ui";

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
// 화면 비율에 맞춰 격자(+그림자, 흩어질 여유)가 항상 다 보이도록 뷰 높이를 정합니다.
// 가로가 넓은 화면에서는 높이 기준, 좁은 창에서는 폭 기준으로 맞춥니다.
function viewHeight(aspect: number): number {
  return Math.max(gridHeight + 5, (gridWidth + 3) / aspect);
}

function fitCamera(cam: THREE.OrthographicCamera): void {
  const aspect = window.innerWidth / window.innerHeight;
  const halfH = viewHeight(aspect) / 2;
  const halfW = halfH * aspect;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.updateProjectionMatrix();
}

let camera: THREE.OrthographicCamera;
function makeCamera(): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  fitCamera(cam);
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

// ---------- 손 추적 (웹캠) ----------
const tracker = new HandTracker();
const hand = new HandInput(camera);
const ui = new HandUI(
  tracker.video,
  () => void tracker.start(),
  () => tracker.stop()
);
tracker.onStatus = (s) => {
  ui.setStatus(s);
  if (s !== "running") hand.reset();
};
tracker.onFrame = (f) => {
  hand.onFrame(f, tracker.video.videoWidth, tracker.video.videoHeight);
  ui.drawLandmarks(f.landmarks);
};
// 페이지를 떠날 때도 카메라를 확실히 끔
window.addEventListener("pagehide", () => tracker.stop());

// ---------- 입력 선택: 손이 보이면 손, 아니면 마우스 (힘이 겹치지 않게) ----------
const mouseCollider: Collider = { x: 0, y: 0, vx: 0, vy: 0, radius: PHYSICS.influenceRadius, weight: 1 };
let handLastActive = -Infinity;
let inputSource: "none" | "mouse" | "hand" = "none";

function currentColliders(now: number): Collider[] {
  if (hand.active) {
    handLastActive = now;
    inputSource = "hand";
    return hand.colliders;
  }
  // 손 입력이 끝난 뒤에는 마우스를 새로 움직였을 때만 다시 마우스를 사용
  // (가만히 있던 커서가 손이 사라지는 순간 갑자기 밀지 않도록)
  if (pointer.active && pointer.lastMoveTime > handLastActive) {
    mouseCollider.x = pointer.world.x;
    mouseCollider.y = pointer.world.y;
    mouseCollider.vx = pointer.velocity.x;
    mouseCollider.vy = pointer.velocity.y;
    inputSource = "mouse";
    return [mouseCollider];
  }
  inputSource = "none";
  return [];
}

// ---------- 애니메이션 루프 (프레임레이트 독립) ----------
const clock = new THREE.Clock();
let frameCount = 0;

function tick(): void {
  // 실제 경과 시간만큼 시뮬레이션을 진행합니다. 느린 기기에서도 움직임 속도가 같도록
  // 한 프레임을 작은 단계(stepSize)로 나눠 계산하고, 탭 전환 후의 큰 점프만 maxDelta로 막습니다.
  const frameDt = Math.min(clock.getDelta(), PHYSICS.maxDelta);
  const steps = Math.max(1, Math.ceil(frameDt / PHYSICS.stepSize));
  const h = frameDt / steps;
  const now = performance.now();

  pointer.update(frameDt);
  hand.update(now, frameDt);
  ui.setHandSeen(tracker.status === "running" && now - hand.lastSeen < 300);
  const colliders = currentColliders(now);
  for (let s = 0; s < steps; s++) {
    applyColliders(objects, colliders, h);
    for (const obj of objects) obj.update(h);
  }

  renderer.render(scene, camera);
  frameCount++;
  // 렌더링을 먼저 끝낸 뒤 손 검출 (새 카메라 프레임이 있고 검출 간격이 지났을 때만)
  tracker.maybeDetect(performance.now());
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
  hand: () => ({
    status: tracker.status,
    delegate: tracker.delegate,
    detectCostMs: +tracker.detectCostMs.toFixed(1),
    detectHz: +(1000 / tracker.detectIntervalMs).toFixed(0),
    liveTracks: tracker.liveTrackCount,
    presence: +hand.presence.toFixed(2),
    input: inputSource,
    palm: { x: +hand.colliders[0].x.toFixed(2), y: +hand.colliders[0].y.toFixed(2) },
    palmSpeed: +Math.hypot(hand.colliders[0].vx, hand.colliders[0].vy).toFixed(1),
    frames: frameCount,
  }),
};

// ---------- 리사이즈 ----------
window.addEventListener("resize", () => {
  fitCamera(camera);
  renderer.setSize(window.innerWidth, window.innerHeight);
});
