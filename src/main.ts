import * as THREE from "three";
import { BACKGROUND, COLLIDE, GRID, HAND, PHYSICS } from "./config";
import { getGeometry, styleForCell, type CellStyle } from "./shapes";
import { createStudioEnvironment, getMaterial, GlowLayer, type Quality } from "./look";
import { GridObject } from "./gridObject";
import { Pointer } from "./pointer";
import { applyColliders, type Collider } from "./interaction";
import { HandTracker } from "./hand/handTracker";
import { HandInput } from "./hand/handInput";
import { applyHandExclusion } from "./hand/handShape";
import { resolveCollisions } from "./collisions";
import { HandUI } from "./hand/ui";

const app = document.getElementById("app")!;

// ---------- 렌더러 ----------
// 딱딱한 그림자는 쓰지 않고, 오브젝트 아래에 색이 번지는 부드러운 그림자만 둡니다.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BACKGROUND, 1);
// 색을 과하게 바꾸지 않는 톤 매핑: 호박색·노랑이 탁해지지 않고 하이라이트만 부드럽게 눌러 줌
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// ---------- 씬 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND);
// 넓은 스튜디오 조명이 비친 듯한 환경 반사
scene.environment = createStudioEnvironment(renderer);

// ---------- 재질 품질 ----------
// 기본은 반투명(high). 처음 몇 초 동안 프레임이 느리면 가벼운 재질(light)로 자동 전환.
// 주소에 ?quality=high 또는 ?quality=light 를 붙이면 고정.
const qualityParam = new URLSearchParams(location.search).get("quality");
let quality: Quality = qualityParam === "light" ? "light" : "high";
const autoQuality = qualityParam !== "high" && qualityParam !== "light";

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

// ---------- 조명: 대부분 환경 반사로 밝히고, 직사광은 약하게 ----------
scene.add(new THREE.HemisphereLight(0xfff4e6, 0xf2d6b8, 0.55));
const key = new THREE.DirectionalLight(0xfff2e2, 0.55);
key.position.set(-5, 9, 12);
scene.add(key);

// ---------- 색이 번지는 접촉 그림자 ----------
const glow = new GlowLayer(GRID.maxObjects + 64);
scene.add(glow.mesh);

// ---------- 격자 배치 ----------
const objects: GridObject[] = [];

const objectColors: number[] = [];

function buildGrid(): void {
  for (const o of objects) scene.remove(o.mesh); // 지오메트리·소재는 공유라 그대로 둠
  objects.length = 0;
  objectColors.length = 0;

  const { cols, rows } = layout;
  const startX = (-(cols - 1) * GRID.spacing) / 2;
  const startY = ((rows - 1) * GRID.spacing) / 2;
  const styles: CellStyle[][] = [];

  for (let r = 0; r < rows; r++) {
    styles[r] = [];
    for (let c = 0; c < cols; c++) {
      const style = styleForCell(r, c, styles[r][c - 1], styles[r - 1]?.[c]);
      styles[r][c] = style;
      const mesh = new THREE.Mesh(getGeometry(style.kind), getMaterial(style.color, quality));
      objectColors.push(style.color);
      // 링은 정면을 향하도록 살짝 세워 둡니다.
      if (style.kind === "ring") mesh.rotation.x = Math.PI / 2;

      const home = new THREE.Vector3(startX + c * GRID.spacing, startY - r * GRID.spacing, 0);
      objects.push(new GridObject(mesh, home));
      scene.add(mesh);
    }
  }
  glow.setColors(objectColors);
}
buildGrid();

function applyPixelRatio(): void {
  // 가벼운 모드에서는 고해상도 화면의 픽셀 수를 조금 줄임 (윤곽은 여전히 선명한 수준)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "light" ? 1.5 : 2));
}
applyPixelRatio();

function setQuality(q: Quality): void {
  if (q === quality) return;
  quality = q;
  objects.forEach((o, i) => (o.mesh.material = getMaterial(objectColors[i], q)));
  applyPixelRatio();
}

// 반투명 재질이 이 기기에서 무거운지 확인: 시작 직후 잠깐 기다린 뒤 약 1.5초간 프레임 간격을 봄
const perf = { start: performance.now(), samples: [] as number[], decided: !autoQuality, medianMs: 0 };
function checkQuality(rawDtMs: number, now: number): void {
  if (perf.decided || document.hidden) return;
  if (now - perf.start < 1000) return;
  perf.samples.push(rawDtMs);
  // 90프레임을 모으거나(빠른 기기), 2초가 지나면(느린 기기) 판단
  if (perf.samples.length < 90 && !(now - perf.start > 3000 && perf.samples.length >= 5)) return;
  const sorted = [...perf.samples].sort((a, b) => a - b);
  perf.medianMs = sorted[sorted.length >> 1];
  perf.decided = true;
  // 약 40fps보다 느리면 가벼운 재질로
  if (perf.medianMs > 25) setQuality("light");
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
  const rawDt = clock.getDelta();
  const frameDt = Math.min(rawDt, PHYSICS.maxDelta);
  const steps = Math.max(1, Math.ceil(frameDt / PHYSICS.stepSize));
  const h = frameDt / steps;
  const now = performance.now();
  checkQuality(rawDt * 1000, now);

  pointer.update(frameDt);
  hand.update(now, frameDt);
  ui.setHandSeen(tracker.status === "running" && now - hand.lastSeen < 300);
  const colliders = currentColliders(now);
  const handBlocks = tracker.status === "running" && hand.shape.strength > 0;
  for (let s = 0; s < steps; s++) {
    applyColliders(objects, colliders, h, inputSource === "hand");
    for (const obj of objects) obj.update(h);
    // 손이 있는 자리에는 들어오지 못하게 밀어냄 (스프링이 끌어당겨도 손 밖에 머묾)
    if (handBlocks && HAND.exclusion) applyHandExclusion(objects, hand.shape, h);
    // 손에 밀린 오브젝트가 다른 오브젝트와 부딪히면 서로 살짝 밀어냄
    resolveCollisions(objects, h);
  }

  glow.update(objects.map((o) => o.position));
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
  quality: () => ({ quality, auto: autoQuality, decided: perf.decided, medianFrameMs: +perf.medianMs.toFixed(1) }),
  setCollisions: (on: boolean) => {
    COLLIDE.enabled = on;
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
