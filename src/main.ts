import * as THREE from "three";
import { BACKGROUND, GRID, HAND, PHYSICS } from "./config";
import { getGeometry, getMaterial, styleForCell, type CellStyle } from "./shapes";
import { GridObject } from "./gridObject";
import { Pointer } from "./pointer";
import { applyColliders, type Collider } from "./interaction";
import { HandTracker } from "./hand/handTracker";
import { HandInput } from "./hand/handInput";
import { applyHandExclusion } from "./hand/handShape";
import { HandUI } from "./hand/ui";

const app = document.getElementById("app")!;

// ---------- 렌더러 ----------
// 그림자는 쓰지 않습니다(오브젝트가 화면을 채우므로 움직임 자체가 잘 보이도록).
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BACKGROUND, 1);
app.appendChild(renderer.domElement);

// ---------- 씬 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);

// ---------- 격자 크기: 창을 가득 채우는 행·열 수 ----------
interface Layout {
  cols: number;
  rows: number;
}

function computeLayout(): Layout {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let cell = THREE.MathUtils.clamp(Math.min(w, h) / GRID.shortSideCells, GRID.minCellPx, GRID.maxCellPx);
  // 아주 큰 화면에서는 칸을 키워 전체 개수를 상한 이하로 유지
  cell = Math.max(cell, Math.sqrt((w * h) / GRID.maxObjects));
  return { cols: Math.max(3, Math.round(w / cell)), rows: Math.max(3, Math.round(h / cell)) };
}

let layout = computeLayout();

// ---------- 직교 카메라 (정면에서 약간 내려다보는 시점) ----------
const CAMERA_POS = new THREE.Vector3(0, 4.8, 18);
// 살짝 내려다보기 때문에 화면에서 격자의 세로 길이가 이 비율만큼 짧아 보입니다.
const TILT_COS = CAMERA_POS.z / Math.hypot(CAMERA_POS.y, CAMERA_POS.z);

// 격자가 창을 꽉 채우도록(가장자리에 반 칸 여백) 뷰 크기를 맞춥니다.
function fitCamera(cam: THREE.OrthographicCamera): void {
  const aspect = window.innerWidth / window.innerHeight;
  const needW = layout.cols * GRID.spacing;
  const needH = layout.rows * GRID.spacing * TILT_COS;
  const halfH = Math.max(needH, needW / aspect) / 2;
  const halfW = halfH * aspect;
  cam.left = -halfW;
  cam.right = halfW;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.updateProjectionMatrix();
}

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.copy(CAMERA_POS);
camera.lookAt(0, 0, 0);
fitCamera(camera);

// ---------- 조명 (넓고 부드럽게) ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xfff6e8, 0xcfc7ba, 0.6));

const key = new THREE.DirectionalLight(0xfff4e2, 1.15);
key.position.set(6, 14, 10);
scene.add(key);

// 채움광(약하게)
const fill = new THREE.DirectionalLight(0xe8ecff, 0.35);
fill.position.set(-8, 4, 6);
scene.add(fill);

// ---------- 격자 배치 ----------
const objects: GridObject[] = [];

function buildGrid(): void {
  for (const o of objects) scene.remove(o.mesh); // 지오메트리·소재는 공유라 그대로 둠
  objects.length = 0;

  const { cols, rows } = layout;
  const startX = (-(cols - 1) * GRID.spacing) / 2;
  const startY = ((rows - 1) * GRID.spacing) / 2;
  const styles: CellStyle[][] = [];

  for (let r = 0; r < rows; r++) {
    styles[r] = [];
    for (let c = 0; c < cols; c++) {
      const style = styleForCell(r, c, styles[r][c - 1], styles[r - 1]?.[c]);
      styles[r][c] = style;
      const mesh = new THREE.Mesh(getGeometry(style.kind), getMaterial(style.color));
      // 링은 정면을 향하도록 살짝 세워 둡니다.
      if (style.kind === "ring") mesh.rotation.x = Math.PI / 2;

      const home = new THREE.Vector3(startX + c * GRID.spacing, startY - r * GRID.spacing, 0);
      objects.push(new GridObject(mesh, home));
      scene.add(mesh);
    }
  }
}
buildGrid();

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
  const handBlocks = tracker.status === "running" && hand.shape.strength > 0;
  for (let s = 0; s < steps; s++) {
    applyColliders(objects, colliders, h);
    for (const obj of objects) obj.update(h);
    // 손이 있는 자리에는 들어오지 못하게 밀어냄 (스프링이 끌어당겨도 손 밖에 머묾)
    if (handBlocks && HAND.exclusion) applyHandExclusion(objects, hand.shape, h);
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
  spins: () => objects.map((o) => o.spinAmount),
  layout: () => ({ ...layout, count: objects.length }),
  // 손 영역과 겹친 정도: 중심이 손 안에 있는 개수, 오브젝트(반지름 objectRadius)가 가장 깊이 겹친 거리
  handOverlap: () => {
    let centersInside = 0;
    let maxOverlap = 0;
    let touching = 0;
    if (hand.shape.strength > 0) {
      for (const o of objects) {
        const d = hand.shape.distance(o.position.x, o.position.y);
        if (d < 0) centersInside++;
        const overlap = HAND.objectRadius - d;
        if (overlap > 0) {
          touching++;
          maxOverlap = Math.max(maxOverlap, overlap);
        }
      }
    }
    return { strength: +hand.shape.strength.toFixed(2), centersInside, touching, maxOverlap: +maxOverlap.toFixed(3) };
  },
  setHandExclusion: (on: boolean) => {
    HAND.exclusion = on;
  },

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
// 창 크기가 바뀌면 바로 화면을 맞추고, 행·열 수가 달라졌으면 크기 조절이 끝난 뒤 격자를 다시 만듭니다.
let rebuildTimer = 0;
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitCamera(camera);
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    const next = computeLayout();
    if (next.cols !== layout.cols || next.rows !== layout.rows) {
      layout = next;
      buildGrid();
      fitCamera(camera);
    }
  }, 150);
});
