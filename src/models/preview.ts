import * as THREE from "three";
import { BACKGROUND } from "../config";
import { GlowLayer, setupStudio, type Quality } from "../look";
import { createModel, MODEL_KINDS, MODEL_LABELS, MODEL_MAIN_COLOR, modelStats, setModelQuality, type ModelKind } from "./halloween";

// 할로윈 모델 6종 비교 화면.
// - 처음에는 6종을 나란히 보여 주고, 누르면 하나를 크게 봅니다.
// - 드래그하면 회전해서 옆면·뒷면을 확인할 수 있고, '기본 방향'으로 되돌릴 수 있습니다.
// - 작품과 같은 재질·조명(setupStudio, getMaterial)을 씁니다.

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
setupStudio(renderer, scene, BACKGROUND);

const quality: Quality = new URLSearchParams(location.search).get("quality") === "light" ? "light" : "high";

// 작품과 같은 직교 카메라 (정면에서 약 15° 내려다봄)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0, 4.8, 18);
camera.lookAt(0, 0, 0);
const VIEW_H = 5;
function fitCamera(): void {
  const aspect = window.innerWidth / window.innerHeight;
  camera.top = VIEW_H / 2;
  camera.bottom = -VIEW_H / 2;
  camera.left = (-VIEW_H / 2) * aspect;
  camera.right = (VIEW_H / 2) * aspect;
  camera.updateProjectionMatrix();
}
fitCamera();

// ---------- 모델 ----------
interface Item {
  kind: ModelKind;
  model: THREE.Group;
  pos: THREE.Vector3; // 현재 표시 위치·크기 (목표값으로 부드럽게 이동)
  size: number;
  targetPos: THREE.Vector3;
  targetSize: number;
  spin: THREE.Vector2; // 드래그 후 남은 회전 속도
  resetting: boolean;
  label: HTMLDivElement;
}

const glow = new GlowLayer(8);
scene.add(glow.mesh);

const items: Item[] = MODEL_KINDS.map((kind) => {
  const model = createModel(kind, quality);
  scene.add(model);
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = MODEL_LABELS[kind];
  document.body.appendChild(label);
  return {
    kind,
    model,
    pos: new THREE.Vector3(),
    size: 1,
    targetPos: new THREE.Vector3(),
    targetSize: 1,
    spin: new THREE.Vector2(),
    resetting: false,
    label,
  };
});

let focused: Item | null = null;

// 6종을 한 줄(넓은 화면) 또는 3×2로 배치
function layout(): void {
  const aspect = window.innerWidth / window.innerHeight;
  const viewW = VIEW_H * aspect;
  const cols = aspect >= 1.45 ? 6 : 3;
  const rows = Math.ceil(items.length / cols);
  const cell = Math.min(viewW / cols, (VIEW_H - 1.0) / rows);
  items.forEach((it, i) => {
    if (focused) {
      const on = it === focused;
      it.targetPos.set(on ? 0 : it.targetPos.x, on ? 0.2 : it.targetPos.y, 0);
      it.targetSize = on ? Math.min(VIEW_H * 0.62, viewW * 0.5) : 0;
    } else {
      const c = i % cols;
      const r = Math.floor(i / cols);
      it.targetPos.set((c - (cols - 1) / 2) * cell, ((rows - 1) / 2 - r) * cell + 0.2, 0);
      it.targetSize = cell * 0.74;
    }
  });
}
layout();
items.forEach((it) => {
  it.pos.copy(it.targetPos);
  it.size = it.targetSize;
});

// ---------- UI ----------
const style = document.createElement("style");
style.textContent = `
.ui { position: fixed; left: 16px; top: 14px; z-index: 5; display: flex; gap: 8px; align-items: center;
  font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #2a2320; }
.ui button, .ui a { font: inherit; color: inherit; text-decoration: none; cursor: pointer; padding: 6px 12px; border-radius: 999px;
  border: 1px solid rgba(42, 35, 32, 0.18); background: rgba(246, 237, 220, 0.9); }
.ui button:hover, .ui a:hover { background: #fbf4e8; }
.ui button[hidden] { display: none; }
.ui .title { font-weight: 600; margin-right: 6px; }
.ui .hint { opacity: 0.6; }
.label { position: fixed; z-index: 4; transform: translate(-50%, 0); pointer-events: none;
  font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #2a2320; opacity: 0.75;
  transition: opacity 0.2s; white-space: nowrap; }
canvas { cursor: grab; }
canvas.dragging { cursor: grabbing; }
`;
document.head.appendChild(style);
const bar = document.createElement("div");
bar.className = "ui";
const title = document.createElement("span");
title.className = "title";
title.textContent = "할로윈 모델 미리보기";
const backBtn = document.createElement("button");
backBtn.textContent = "전체 보기";
const resetBtn = document.createElement("button");
resetBtn.textContent = "기본 방향";
const artLink = document.createElement("a");
artLink.textContent = "작품으로";
artLink.href = "./";
const hint = document.createElement("span");
hint.className = "hint";
bar.append(title, backBtn, resetBtn, artLink, hint);
document.body.appendChild(bar);

function refreshUI(): void {
  backBtn.hidden = !focused;
  title.textContent = focused ? `할로윈 모델 미리보기 · ${MODEL_LABELS[focused.kind]}` : "할로윈 모델 미리보기";
  hint.textContent = focused ? "드래그해서 돌려 보세요" : "모델을 누르면 크게 보기 · 드래그해서 회전";
}
refreshUI();

function focus(it: Item | null): void {
  focused = it;
  layout();
  refreshUI();
}
backBtn.addEventListener("click", () => focus(null));
resetBtn.addEventListener("click", () => {
  for (const it of focused ? [focused] : items) {
    it.resetting = true;
    it.spin.set(0, 0);
  }
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") focus(null);
});

// ---------- 드래그 회전 / 선택 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(e: PointerEvent): Item | null {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const candidates = focused ? [focused] : items;
  const hits = raycaster.intersectObjects(candidates.map((it) => it.model), true);
  if (!hits.length) return null;
  let o: THREE.Object3D | null = hits[0].object;
  while (o && !candidates.some((it) => it.model === o)) o = o.parent;
  return candidates.find((it) => it.model === o) ?? null;
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const qTmp = new THREE.Quaternion();
function rotate(it: Item, dx: number, dy: number): void {
  // 화면 가로 드래그 = 세로축 회전, 세로 드래그 = 가로축 회전
  it.model.quaternion.premultiply(qTmp.setFromAxisAngle(Y, dx));
  it.model.quaternion.premultiply(qTmp.setFromAxisAngle(X, dy));
}

let drag: { it: Item | null; x: number; y: number; sx: number; sy: number; t: number; moved: boolean } | null = null;
const canvas = renderer.domElement;
canvas.addEventListener("pointerdown", (e) => {
  const it = pick(e) ?? focused;
  drag = { it, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  if (it) {
    it.resetting = false;
    it.spin.set(0, 0);
  }
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
  if (drag.it && drag.moved) {
    const k = 0.011;
    rotate(drag.it, dx * k, dy * k);
    drag.it.spin.set(dx * k * 60, dy * k * 60); // 놓았을 때 조금 더 돌도록
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!drag) return;
  canvas.classList.remove("dragging");
  if (!drag.moved && performance.now() - drag.t < 450) {
    const it = pick(e);
    if (!focused && it) focus(it);
  }
  drag = null;
});

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitCamera();
  layout();
});

// ---------- 애니메이션 ----------
const clock = new THREE.Clock();
const identity = new THREE.Quaternion();
const v = new THREE.Vector3();
function tick(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const a = 1 - Math.exp(-dt * 9);
  const positions: THREE.Vector3[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  for (const it of items) {
    it.pos.lerp(it.targetPos, a);
    it.size += (it.targetSize - it.size) * a;
    it.model.position.copy(it.pos);
    it.model.scale.setScalar(Math.max(1e-4, it.size));
    it.model.visible = it.size > 0.02;
    if (it.resetting) {
      it.model.quaternion.slerp(identity, 1 - Math.exp(-dt * 7));
      if (it.model.quaternion.angleTo(identity) < 1e-3) {
        it.model.quaternion.identity();
        it.resetting = false;
      }
    } else if (!drag || drag.it !== it) {
      if (it.spin.lengthSq() > 1e-6) {
        rotate(it, it.spin.x * dt, it.spin.y * dt);
        it.spin.multiplyScalar(Math.exp(-dt * 4));
      }
    }
    if (it.model.visible) {
      positions.push(it.pos);
      colors.push(MODEL_MAIN_COLOR[it.kind]);
      sizes.push(it.size);
    }
    // 이름표: 모델 아래
    v.set(it.pos.x, it.pos.y - it.size * 0.62, 0).project(camera);
    it.label.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    it.label.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    it.label.style.opacity = focused ? "0" : "0.75";
  }
  glow.setColors(colors, sizes);
  glow.update(positions);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// 확인용
(window as unknown as Record<string, unknown>).__models = {
  stats: () => Object.fromEntries(MODEL_KINDS.map((k) => [k, modelStats(k)])),
  focus: (kind: ModelKind | null) => focus(kind ? items.find((it) => it.kind === kind)! : null),
  rotate: (kind: ModelKind, yaw: number, pitch: number) => {
    const it = items.find((i) => i.kind === kind)!;
    it.resetting = false;
    rotate(it, yaw, pitch);
  },
  reset: () => resetBtn.click(),
  quality: () => quality,
  setQuality: (q: Quality) => items.forEach((it) => setModelQuality(it.model, q)),
  bounds: () =>
    Object.fromEntries(
      items.map((it) => {
        const b = new THREE.Box3().setFromObject(it.model);
        const s = b.getSize(new THREE.Vector3()).divideScalar(it.size);
        const c = b.getCenter(new THREE.Vector3()).sub(it.pos).divideScalar(it.size);
        return [it.kind, { w: +s.x.toFixed(2), h: +s.y.toFixed(2), d: +s.z.toFixed(2), cx: +c.x.toFixed(2), cy: +c.y.toFixed(2) }];
      })
    ),
};
