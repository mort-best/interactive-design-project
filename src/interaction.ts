import * as THREE from "three";
import { PHYSICS } from "./config";
import type { GridObject } from "./gridObject";

// 보이지 않는 충돌 영역 하나. 마우스는 1개, 손은 손바닥 + 손가락 끝 5개를 씁니다.
export interface Collider {
  x: number;
  y: number;
  // 월드 좌표계 속도 (월드/초)
  vx: number;
  vy: number;
  radius: number;
  // 0~1. 손이 나타나거나 사라질 때 서서히 켜고 끄는 데 씁니다.
  weight: number;
}

const tmpDir = new THREE.Vector3();
const tmpSpin = new THREE.Vector3();

// 각 오브젝트마다 가장 강하게 닿은 충돌 영역 하나의 힘만 적용합니다.
// (손가락 여러 개가 한 오브젝트에 겹쳐도 힘이 몇 배로 커지지 않아,
//  마우스와 같은 흩어짐 느낌이 유지됩니다.)
export function applyColliders(objects: GridObject[], colliders: Collider[], dt: number): void {
  if (colliders.length === 0) return;

  for (const obj of objects) {
    const p = obj.position;
    let best: Collider | null = null;
    let bestSoft = 0;
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = 0;

    for (const c of colliders) {
      if (c.weight <= 0) continue;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > c.radius * c.radius) continue; // 영향 범위 밖 -> 움직이지 않음
      const dist = Math.sqrt(distSq) || 0.0001;
      // 가까울수록 강하게 (부드러운 감쇠)
      const falloff = 1 - dist / c.radius;
      const soft = falloff * falloff * c.weight;
      if (soft > bestSoft) {
        best = c;
        bestSoft = soft;
        bestDx = dx;
        bestDy = dy;
        bestDist = dist;
      }
    }
    if (!best) continue;

    const speed = Math.hypot(best.vx, best.vy);

    // 기본은 충돌 영역 중심에서 바깥으로 밀어냄
    tmpDir.set(bestDx / bestDist, bestDy / bestDist, 0);

    // 빠르게 움직이면 이동 방향 성분을 더해 더 강하게 밀고 회전을 줌.
    // gentleSpeed 이하의 느린 움직임은 기본 힘만으로 부드럽게 밀고, 그보다 빠른 만큼만 힘을 더합니다.
    const velContribution = Math.max(0, speed - PHYSICS.gentleSpeed) * PHYSICS.velocityStrength;
    tmpDir.x += (best.vx / (speed || 1)) * (velContribution / PHYSICS.pushStrength);
    tmpDir.y += (best.vy / (speed || 1)) * (velContribution / PHYSICS.pushStrength);
    tmpDir.normalize();

    const strength = (PHYSICS.pushStrength + velContribution) * bestSoft * dt;

    // 회전 충격: 속도가 빠를수록, 가까울수록 크게. 무작위성으로 흩어지는 느낌.
    const spinMag = PHYSICS.spinStrength * (0.4 + speed) * bestSoft * dt;
    tmpSpin.set(
      (Math.random() - 0.5) * spinMag,
      (Math.random() - 0.5) * spinMag,
      (Math.random() - 0.5) * spinMag * 1.5
    );

    obj.applyImpulse(tmpDir, strength, tmpSpin);
  }
}
