import { COLLIDE } from "./config";
import type { GridObject } from "./gridObject";

// 손에 밀려난 오브젝트가 다른 오브젝트와 부딪히면 서로 살짝 밀어냅니다.
// - 오브젝트는 반지름 COLLIDE.radius인 원으로 봅니다.
// - 손에 밀린 오브젝트끼리는 같은 무게로, 가만히 있던 오브젝트는 더 무겁게(hitMass) 취급해서
//   부딪힌 쪽은 조금만 움직였다가 스프링으로 제자리에 돌아갑니다.
// - 부딪힌 오브젝트가 다시 다른 오브젝트를 미는 연쇄는 만들지 않습니다(손 주변만 반응).

const grid = new Map<number, number[]>();
const pool: number[][] = [];
const keyOf = (ix: number, iy: number) => (ix + 32768) * 65536 + (iy + 32768);

export function resolveCollisions(objects: GridObject[], dt: number): void {
  if (!COLLIDE.enabled) return;
  const r2 = COLLIDE.radius * 2;
  const cell = r2;

  // 공간을 칸으로 나눠 가까운 오브젝트끼리만 검사
  for (const list of grid.values()) {
    list.length = 0;
    pool.push(list);
  }
  grid.clear();
  let anyDriven = false;
  for (let i = 0; i < objects.length; i++) {
    const p = objects[i].position;
    const k = keyOf(Math.floor(p.x / cell), Math.floor(p.y / cell));
    let list = grid.get(k);
    if (!list) {
      list = pool.pop() ?? [];
      grid.set(k, list);
    }
    list.push(i);
    if (objects[i].handDriven) anyDriven = true;
  }
  if (!anyDriven) return;

  const invHit = 1 / COLLIDE.hitMass;
  // 한 번에 튕기지 않고 몇 단계에 걸쳐 부드럽게 떨어지도록 (손 밀어내기와 같은 방식)
  const blend = 1 - Math.exp(-COLLIDE.response * dt);
  for (let i = 0; i < objects.length; i++) {
    const A = objects[i];
    if (!A.handDriven) continue;
    const pa = A.position;
    const ix = Math.floor(pa.x / cell);
    const iy = Math.floor(pa.y / cell);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const list = grid.get(keyOf(ix + ox, iy + oy));
        if (!list) continue;
        for (const j of list) {
          if (j === i) continue;
          const B = objects[j];
          // 둘 다 손에 밀린 경우는 한 번만 처리
          if (B.handDriven && j < i) continue;
          const pb = B.position;
          let dx = pb.x - pa.x;
          let dy = pb.y - pa.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r2 * r2) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-6) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const nx = dx / d;
          const ny = dy / d;
          const pen = r2 - d;
          const invA = 1;
          const invB = B.handDriven ? 1 : invHit;

          const va = A.vel;
          const vb = B.vel;
          const vrel = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
          // 겹친 만큼 떨어지는 속도(부드럽게) 또는 부딪힌 속도의 일부만큼 튕김
          const target = Math.max(COLLIDE.push * pen, -COLLIDE.restitution * vrel);
          if (vrel >= target) continue;
          const jn = ((target - vrel) * blend) / (invA + invB);
          // 비껴 부딪히면 살짝 굴러가듯 회전
          const vt = (vb.x - va.x) * -ny + (vb.y - va.y) * nx;
          const spin = vt * COLLIDE.spin * Math.min(1, jn);
          A.nudge(-nx * jn * invA, -ny * jn * invA, -spin * invA);
          B.nudge(nx * jn * invB, ny * jn * invB, spin * invB);
        }
      }
    }
  }
}
