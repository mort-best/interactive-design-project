import { HAND } from "../config";
import type { GridObject } from "../gridObject";

// 손이 차지하는 영역(오브젝트가 들어오지 못하는 곳).
// 손바닥 = 손목·손가락 뿌리를 잇는 다각형, 손가락 = 마디를 잇는 캡슐(둥근 막대).
// 모든 좌표는 z=0 평면의 월드 좌표입니다.
//
// 손 주변에 작은 격자로 '손까지의 거리 지도'를 만들고 살짝 흐리게 해서 매끈하게 한 뒤,
// 오브젝트는 그 지도의 경사를 따라 힘으로 밀려납니다(위치를 강제로 옮기지 않음).
// - 손 밖: 가장 가까운 손 부분까지의 실제 거리
// - 손 안: 손 밖(빈 곳)까지의 거리 — 손가락이 겹친 곳에서도 항상 손 전체의 바깥을 가리킴
// - 오브젝트가 들어갈 수 없는 좁은 손가락 사이도 손 안으로 취급

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
const BLUR_RADIUS = 2; // 칸 단위, 두 번 적용

export interface Sample {
  // 손 가장자리(오브젝트 반지름만큼 넓힌)까지의 거리. 밖이면 +, 안이면 −
  f: number;
  // 바깥쪽 방향
  nx: number;
  ny: number;
  // 그 자리에서 손이 움직이는 속도
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
  private field = new Float32Array(0);
  private tmp = new Float32Array(0);
  private nearX = new Float32Array(0);
  private nearY = new Float32Array(0);

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
      // 나타날 때는 손바닥 중심에서부터 서서히 커짐
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

  // 손까지의 부호 있는 거리 (밖이면 +, 손 안이면 −). 손 밖에서는 정확한 거리입니다.
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
    const pad = this.fingerR + r + HAND.pressBand + 0.6;
    const w = maxX - minX + 2 * pad;
    const h = maxY - minY + 2 * pad;
    // 아주 큰 손(카메라에 가까이)에서도 계산량이 일정하도록 칸 크기를 키움
    this.cell = Math.max(HAND.mapCell, Math.sqrt((w * h) / MAX_CELLS));
    const cs = this.cell;
    this.gx0 = minX - pad;
    this.gy0 = minY - pad;
    const cols = (this.cols = Math.ceil(w / cs));
    const rows = (this.rows = Math.ceil(h / cs));
    const n = cols * rows;
    if (this.field.length < n) {
      this.field = new Float32Array(n);
      this.tmp = new Float32Array(n);
      this.nearX = new Float32Array(n);
      this.nearY = new Float32Array(n);
    }
    const { field, nearX, nearY } = this;

    // 1) 손 밖 칸: 넓힌 가장자리까지의 실제 거리. 손 안 칸: 일단 표시만.
    for (let j = 0; j < rows; j++) {
      const y = this.gy0 + (j + 0.5) * cs;
      for (let i = 0; i < cols; i++) {
        const x = this.gx0 + (i + 0.5) * cs;
        const k = j * cols + i;
        const f = this.distance(x, y) - r;
        field[k] = f;
        const inside = f < 0;
        nearX[k] = inside ? Infinity : x;
        nearY[k] = inside ? Infinity : y;
      }
    }

    // 2) 손 안 칸: 가장 가까운 빈 칸까지의 거리 (앞·뒤 두 번 훑는 거리 변환)
    const relax = (k: number, x: number, y: number, m: number) => {
      const tx = nearX[m];
      if (tx === Infinity) return;
      const cur = nearX[k] === Infinity ? Infinity : (nearX[k] - x) ** 2 + (nearY[k] - y) ** 2;
      const cand = (tx - x) ** 2 + (nearY[m] - y) ** 2;
      if (cand < cur) {
        nearX[k] = tx;
        nearY[k] = nearY[m];
      }
    };
    const pass = (down: boolean) => {
      for (let jj = 0; jj < rows; jj++) {
        const j = down ? jj : rows - 1 - jj;
        const y = this.gy0 + (j + 0.5) * cs;
        const pj = down ? j - 1 : j + 1;
        for (let ii = 0; ii < cols; ii++) {
          const i = down ? ii : cols - 1 - ii;
          const k = j * cols + i;
          if (field[k] >= 0) continue;
          const x = this.gx0 + (i + 0.5) * cs;
          const pi = down ? i - 1 : i + 1;
          if (pi >= 0 && pi < cols) relax(k, x, y, j * cols + pi);
          if (pj >= 0 && pj < rows) {
            relax(k, x, y, pj * cols + i);
            if (i > 0) relax(k, x, y, pj * cols + i - 1);
            if (i < cols - 1) relax(k, x, y, pj * cols + i + 1);
          }
        }
        for (let ii = 0; ii < cols; ii++) {
          const i = down ? cols - 1 - ii : ii;
          const k = j * cols + i;
          if (field[k] >= 0) continue;
          const x = this.gx0 + (i + 0.5) * cs;
          const qi = down ? i + 1 : i - 1;
          if (qi >= 0 && qi < cols) relax(k, x, y, j * cols + qi);
        }
      }
    };
    pass(true);
    pass(false);
    for (let j = 0; j < rows; j++) {
      const y = this.gy0 + (j + 0.5) * cs;
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (field[k] >= 0) continue;
        const x = this.gx0 + (i + 0.5) * cs;
        // 빈 칸 중심까지 거리에서 반 칸을 빼서 경계에서 값이 이어지게 함
        field[k] = nearX[k] === Infinity ? -1e3 : -Math.max(0, Math.hypot(nearX[k] - x, nearY[k] - y) - cs * 0.5);
      }
    }

    // 3) 살짝 흐리게: 손 인식의 작은 떨림과 칸의 계단 모양이 힘에 그대로 드러나지 않게
    for (let p = 0; p < 2; p++) {
      this.boxBlur(field, this.tmp, cols, rows, 1, cols); // 가로
      this.boxBlur(this.tmp, field, rows, cols, cols, 1); // 세로
    }
  }

  // 1차원 상자 흐림 (반지름 BLUR_RADIUS)를 모든 줄에 적용
  private boxBlur(src: Float32Array, dst: Float32Array, len: number, lines: number, step: number, lineStep: number): void {
    const R = BLUR_RADIUS;
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      for (let t = 0; t < len; t++) {
        let sum = 0;
        for (let o = -R; o <= R; o++) {
          const u = Math.max(0, Math.min(len - 1, t + o));
          sum += src[base + u * step];
        }
        dst[base + t * step] = sum / (2 * R + 1);
      }
    }
  }

  private at(i: number, j: number): number {
    i = Math.max(0, Math.min(this.cols - 1, i));
    j = Math.max(0, Math.min(this.rows - 1, j));
    return this.field[j * this.cols + i];
  }

  // 부드럽게 보간한 거리 값
  private fieldAt(px: number, py: number): number {
    const u = (px - this.gx0) / this.cell - 0.5;
    const v = (py - this.gy0) / this.cell - 0.5;
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const a = this.at(i, j) + (this.at(i + 1, j) - this.at(i, j)) * fu;
    const b = this.at(i, j + 1) + (this.at(i + 1, j + 1) - this.at(i, j + 1)) * fu;
    return a + (b - a) * fv;
  }

  // (px, py)에 있는 오브젝트에 대한 거리·방향·손 속도. 지도 밖이면 false (손과 멂).
  sample(px: number, py: number, out: Sample): boolean {
    if (this.strength <= 0) return false;
    const m = this.cell;
    if (px < this.gx0 + m || py < this.gy0 + m || px > this.gx0 + (this.cols - 1) * m || py > this.gy0 + (this.rows - 1) * m) return false;
    const f = this.fieldAt(px, py);
    if (f > HAND.pressBand) return false;
    const e = this.cell;
    let gx = this.fieldAt(px + e, py) - this.fieldAt(px - e, py);
    let gy = this.fieldAt(px, py + e) - this.fieldAt(px, py - e);
    let g = Math.hypot(gx, gy);
    if (g < 1e-6) {
      // 손 한가운데처럼 방향이 정해지지 않는 곳: 손바닥 중심 반대쪽으로
      gx = px - this.pts[9].x;
      gy = py - this.pts[9].y;
      g = Math.hypot(gx, gy) || 1;
    }
    out.f = f;
    out.nx = gx / g;
    out.ny = gy / g;
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

const s: Sample = { f: 0, nx: 0, ny: 0, vx: 0, vy: 0 };

// 손 가장자리에 가까워지거나 겹친 오브젝트를 힘으로 밀어냅니다. (물리 계산 한 단계마다 호출)
export function applyHandExclusion(objects: GridObject[], shape: HandShape, dt: number): void {
  if (shape.strength <= 0) return;
  for (const obj of objects) {
    const p = obj.position;
    if (shape.sample(p.x, p.y, s)) obj.pressOut(s.nx, s.ny, HAND.pressBand - s.f, s.vx, s.vy, dt);
  }
}
