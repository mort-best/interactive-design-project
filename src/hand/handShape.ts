import { HAND } from "../config";
import type { GridObject } from "../gridObject";

// 손이 차지하는 영역(오브젝트가 들어올 수 없는 곳).
// 손바닥 = 손목·손가락 뿌리를 잇는 다각형, 손가락 = 마디를 잇는 캡슐(둥근 막대).
// 모든 좌표는 z=0 평면의 월드 좌표입니다.
//
// 밀어낼 방향은 손 주변의 작은 격자(거리 지도)로 구합니다.
// 1) 오브젝트 중심이 놓이면 손과 겹치는 칸을 '막힘'으로 표시하고
// 2) 막힌 칸마다 가장 가까운 '빈 칸'을 기록해 두면
// 손가락이 겹친 곳이나 오브젝트가 못 들어갈 만큼 좁은 손가락 사이에서도
// 항상 손 전체의 바깥으로 빠져나가는 방향이 나옵니다.

export interface HandPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// 손바닥 외곽: 손목 → 엄지 뿌리 → 검지·중지·약지·새끼 뿌리
const PALM_OUTLINE = [0, 1, 5, 9, 13, 17];
// 손가락 마디 (MediaPipe 랜드마크 번호)
const BONES: [number, number][] = [
  [1, 2], [2, 3], [3, 4], // 엄지
  [5, 6], [6, 7], [7, 8], // 검지
  [9, 10], [10, 11], [11, 12], // 중지
  [13, 14], [14, 15], [15, 16], // 약지
  [17, 18], [18, 19], [19, 20], // 새끼
];
const MAX_CELLS = 24000;

export interface Push {
  nx: number;
  ny: number;
  depth: number;
  vx: number;
  vy: number;
}

export class HandShape {
  // 0이면 영역 없음, 1이면 손 크기 그대로 (손이 나타나거나 사라질 때 서서히 커지고 작아짐)
  strength = 0;
  readonly pts: HandPoint[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, vx: 0, vy: 0 }));
  private fingerR = 0;

  // 거리 지도
  private cell = HAND.mapCell;
  private gx0 = 0;
  private gy0 = 0;
  private cols = 0;
  private rows = 0;
  private blocked = new Uint8Array(0);
  private nearX = new Float32Array(0); // 가장 가까운 빈 칸 중심
  private nearY = new Float32Array(0);

  // strength만큼 손바닥 중심 기준으로 크기를 조절한 손 모양을 만들고 거리 지도를 갱신합니다.
  set(points: HandPoint[], strength: number): void {
    this.strength = strength;
    if (strength <= 0) return;
    let cx = 0;
    let cy = 0;
    for (const i of [0, 5, 9, 13, 17]) {
      cx += points[i].x / 5;
      cy += points[i].y / 5;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 21; i++) {
      const p = points[i];
      const q = this.pts[i];
      q.x = cx + (p.x - cx) * strength;
      q.y = cy + (p.y - cy) * strength;
      q.vx = p.vx;
      q.vy = p.vy;
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
    // 손가락 굵기는 손 크기(손목 ~ 중지 뿌리 길이)에 비례
    const palmLen = Math.hypot(this.pts[9].x - this.pts[0].x, this.pts[9].y - this.pts[0].y);
    this.fingerR = palmLen * HAND.fingerWidthRatio;
    this.buildMap(minX, minY, maxX, maxY);
  }

  // 손까지의 부호 있는 거리 (밖이면 +, 손 안이면 −)
  distance(px: number, py: number): number {
    let d = this.palmDistance(px, py);
    for (const [a, b] of BONES) {
      const A = this.pts[a];
      const B = this.pts[b];
      const abx = B.x - A.x;
      const aby = B.y - A.y;
      const len2 = abx * abx + aby * aby || 1e-9;
      const t = Math.max(0, Math.min(1, ((px - A.x) * abx + (py - A.y) * aby) / len2));
      d = Math.min(d, Math.hypot(px - (A.x + abx * t), py - (A.y + aby * t)) - this.fingerR);
    }
    return d;
  }

  private palmDistance(px: number, py: number): number {
    let inside = false;
    let best = Infinity;
    const n = PALM_OUTLINE.length;
    for (let k = 0, j = n - 1; k < n; j = k++) {
      const A = this.pts[PALM_OUTLINE[j]];
      const B = this.pts[PALM_OUTLINE[k]];
      if (A.y > py !== B.y > py && px < ((B.x - A.x) * (py - A.y)) / (B.y - A.y) + A.x) inside = !inside;
      const abx = B.x - A.x;
      const aby = B.y - A.y;
      const len2 = abx * abx + aby * aby || 1e-9;
      const t = Math.max(0, Math.min(1, ((px - A.x) * abx + (py - A.y) * aby) / len2));
      best = Math.min(best, Math.hypot(px - (A.x + abx * t), py - (A.y + aby * t)));
    }
    return inside ? -best : best;
  }

  private buildMap(minX: number, minY: number, maxX: number, maxY: number): void {
    const r = HAND.objectRadius;
    const pad = this.fingerR + r + 2 * HAND.mapCell;
    const w = maxX - minX + 2 * pad;
    const h = maxY - minY + 2 * pad;
    // 아주 큰 손(카메라에 가까이)에서도 계산량이 일정하도록 칸 크기를 키움
    this.cell = Math.max(HAND.mapCell, Math.sqrt((w * h) / MAX_CELLS));
    const cs = this.cell;
    this.gx0 = minX - pad;
    this.gy0 = minY - pad;
    this.cols = Math.ceil(w / cs);
    this.rows = Math.ceil(h / cs);
    const n = this.cols * this.rows;
    if (this.blocked.length < n) {
      this.blocked = new Uint8Array(n);
      this.nearX = new Float32Array(n);
      this.nearY = new Float32Array(n);
    }
    const { cols, rows, blocked, nearX, nearY } = this;

    // 1) 막힌 칸: 오브젝트 중심이 여기 오면 손과 겹침 (손에서 objectRadius 이내)
    for (let j = 0; j < rows; j++) {
      const y = this.gy0 + (j + 0.5) * cs;
      for (let i = 0; i < cols; i++) {
        const x = this.gx0 + (i + 0.5) * cs;
        const k = j * cols + i;
        const b = this.distance(x, y) < r ? 1 : 0;
        blocked[k] = b;
        nearX[k] = b ? Infinity : x;
        nearY[k] = b ? Infinity : y;
      }
    }

    // 2) 막힌 칸마다 가장 가까운 빈 칸 찾기 (앞·뒤 두 번 훑는 거리 변환)
    const relax = (k: number, i: number, j: number, ni: number, nj: number) => {
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) return;
      const m = nj * cols + ni;
      const tx = nearX[m];
      if (tx === Infinity) return;
      const x = this.gx0 + (i + 0.5) * cs;
      const y = this.gy0 + (j + 0.5) * cs;
      const cur = nearX[k] === Infinity ? Infinity : (nearX[k] - x) ** 2 + (nearY[k] - y) ** 2;
      const cand = (tx - x) ** 2 + (nearY[m] - y) ** 2;
      if (cand < cur) {
        nearX[k] = tx;
        nearY[k] = nearY[m];
      }
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (!blocked[k]) continue;
        relax(k, i, j, i - 1, j);
        relax(k, i, j, i, j - 1);
        relax(k, i, j, i - 1, j - 1);
        relax(k, i, j, i + 1, j - 1);
      }
      for (let i = cols - 1; i >= 0; i--) {
        const k = j * cols + i;
        if (blocked[k]) relax(k, i, j, i + 1, j);
      }
    }
    for (let j = rows - 1; j >= 0; j--) {
      for (let i = cols - 1; i >= 0; i--) {
        const k = j * cols + i;
        if (!blocked[k]) continue;
        relax(k, i, j, i + 1, j);
        relax(k, i, j, i, j + 1);
        relax(k, i, j, i + 1, j + 1);
        relax(k, i, j, i - 1, j + 1);
      }
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (blocked[k]) relax(k, i, j, i - 1, j);
      }
    }
  }

  // 오브젝트 중심 (px, py)가 막힌 곳이면 true. out에 빠져나갈 방향·거리와 그 자리의 손 속도를 채웁니다.
  resolve(px: number, py: number, out: Push): boolean {
    if (this.strength <= 0) return false;
    const i = Math.floor((px - this.gx0) / this.cell);
    const j = Math.floor((py - this.gy0) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return false;
    const k = j * this.cols + i;
    if (!this.blocked[k]) return false;
    const tx = this.nearX[k];
    if (tx === Infinity) return false;
    const dx = tx - px;
    const dy = this.nearY[k] - py;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return false;
    out.nx = dx / d;
    out.ny = dy / d;
    out.depth = d;
    // 손이 미는 속도: 가까운 마디일수록 크게 반영한 평균
    let wsum = 0;
    let vx = 0;
    let vy = 0;
    for (let n = 0; n < 21; n++) {
      const q = this.pts[n];
      const w = 1 / (0.05 + (px - q.x) ** 2 + (py - q.y) ** 2);
      wsum += w;
      vx += q.vx * w;
      vy += q.vy * w;
    }
    out.vx = vx / wsum;
    out.vy = vy / wsum;
    return true;
  }
}

const push: Push = { nx: 0, ny: 0, depth: 0, vx: 0, vy: 0 };

// 손 영역과 겹친 오브젝트를 영역 밖으로 밀어냅니다. (물리 계산 한 단계마다 호출)
export function applyHandExclusion(objects: GridObject[], shape: HandShape, dt: number): void {
  if (shape.strength <= 0) return;
  const maxMove = HAND.exclusionSpeed * dt;
  for (const obj of objects) {
    const p = obj.position;
    if (shape.resolve(p.x, p.y, push)) {
      obj.pushOut(push.nx, push.ny, push.depth, maxMove, push.vx, push.vy);
    }
  }
}
