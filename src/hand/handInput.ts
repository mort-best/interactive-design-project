import * as THREE from "three";
import { HAND } from "../config";
import type { Collider } from "../interaction";
import type { HandFrame } from "./handTracker";
import { OneEuro } from "./oneEuro";

// MediaPipe 랜드마크 번호
const WRIST = 0;
const PALM_POINTS = [WRIST, 5, 9, 13, 17]; // 손목 + 손가락 뿌리 4개의 평균 = 손바닥 중심
const TIPS = [4, 8, 12, 16, 20]; // 엄지 ~ 새끼 손가락 끝

const smoothAlpha = (cutoffHz: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dt);

interface Track {
  fx: OneEuro;
  fy: OneEuro;
  x: number; // 필터링된 월드 좌표
  y: number;
  vx: number; // 필터링된 월드 속도 (월드/초)
  vy: number;
}

// 손 랜드마크 → 월드 좌표의 충돌 영역(손바닥 1 + 손가락 끝 5)으로 바꿉니다.
// 떨림 제거, 손이 사라지거나 다시 나타날 때 부드럽게 켜고 끄기를 담당합니다.
export class HandInput {
  readonly colliders: Collider[];
  // 0~1. 손 입력이 켜진 정도 (1이면 손으로만 조작)
  presence = 0;
  // 마지막으로 손을 본 시각 (ms)
  lastSeen = -Infinity;

  private readonly tracks: Track[];
  private needsReset = true;
  private lastFrameTime = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly ndc = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  constructor(private readonly camera: THREE.Camera) {
    const make = (radius: number): Collider => ({ x: 0, y: 0, vx: 0, vy: 0, radius, weight: 0 });
    this.colliders = [make(HAND.palmRadius), ...TIPS.map(() => make(HAND.tipRadius))];
    this.tracks = this.colliders.map(() => ({
      fx: new OneEuro(HAND.minCutoff, HAND.beta),
      fy: new OneEuro(HAND.minCutoff, HAND.beta),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    }));
  }

  get active(): boolean {
    return this.presence > 0;
  }

  // 카메라 프레임의 정규화 좌표 → 화면 → z=0 평면의 월드 좌표.
  // 좌우를 거울처럼 뒤집고, 카메라 화면을 브라우저 창에 'cover' 방식으로 맞춰
  // 가로/세로 움직임의 비율이 실제 손 움직임과 같게 합니다.
  private toWorld(nx: number, ny: number, videoW: number, videoH: number, out: { x: number; y: number }): boolean {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.max(vw / videoW, vh / videoH);
    const dw = videoW * scale;
    const dh = videoH * scale;
    const sx = (1 - nx) * dw - (dw - vw) / 2; // 거울 반전
    const sy = ny * dh - (dh - vh) / 2;
    this.ndc.set((sx / vw) * 2 - 1, -(sy / vh) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.hit)) return false;
    out.x = this.hit.x;
    out.y = this.hit.y;
    return true;
  }

  onFrame(frame: HandFrame, videoW: number, videoH: number): void {
    const lm = frame.landmarks;
    if (!lm || lm.length < 21 || !videoW || !videoH) return; // 손 없음 → update()에서 서서히 끔

    // 이번 프레임의 원래(필터 전) 좌표 6개
    const raw: { x: number; y: number }[] = [];
    let px = 0;
    let py = 0;
    for (const i of PALM_POINTS) {
      px += lm[i].x;
      py += lm[i].y;
    }
    const palm = { x: 0, y: 0 };
    if (!this.toWorld(px / PALM_POINTS.length, py / PALM_POINTS.length, videoW, videoH, palm)) return;
    raw.push(palm);
    for (const i of TIPS) {
      const p = { x: 0, y: 0 };
      if (!this.toWorld(lm[i].x, lm[i].y, videoW, videoH, p)) return;
      raw.push(p);
    }

    // dt는 카메라 프레임 사이 간격, '마지막으로 본 시각'은 결과가 도착한 시각 기준
    // (검출이 느린 기기에서도 손이 보이는 동안은 계속 '보임'으로 판단)
    const arrived = performance.now();
    const dt = (frame.time - this.lastFrameTime) / 1000;
    const gap = arrived - this.lastSeen;
    const palmTrack = this.tracks[0];
    const jumped = Math.hypot(palm.x - palmTrack.x, palm.y - palmTrack.y) > HAND.teleportDistance;

    // 손이 새로 나타났거나, 오래 끊겼다가 돌아왔거나, 순간이동처럼 튄 경우:
    // 이전 위치에서 새 위치까지의 이동을 '속도'로 착각하지 않도록 필터를 새 위치로 초기화합니다.
    if (this.needsReset || gap > HAND.reacquireGapMs || jumped || dt <= 0) {
      this.tracks.forEach((t, k) => {
        t.fx.reset(raw[k].x);
        t.fy.reset(raw[k].y);
        t.x = raw[k].x;
        t.y = raw[k].y;
        t.vx = 0;
        t.vy = 0;
      });
      this.needsReset = false;
    } else {
      const a = smoothAlpha(HAND.velocityCutoff, dt);
      this.tracks.forEach((t, k) => {
        const nx = t.fx.filter(raw[k].x, dt);
        const ny = t.fy.filter(raw[k].y, dt);
        let vx = (nx - t.x) / dt;
        let vy = (ny - t.y) / dt;
        const s = Math.hypot(vx, vy);
        if (s > HAND.maxSpeed) {
          vx *= HAND.maxSpeed / s;
          vy *= HAND.maxSpeed / s;
        }
        t.vx += a * (vx - t.vx);
        t.vy += a * (vy - t.vy);
        t.x = nx;
        t.y = ny;
      });
    }

    this.lastFrameTime = frame.time;
    this.lastSeen = arrived;
  }

  // 매 렌더 프레임 호출. 손이 보이는지에 따라 presence를 서서히 올리고 내립니다.
  update(now: number, dt: number): void {
    const seen = now - this.lastSeen < HAND.lostGraceMs;
    if (seen) {
      this.presence = Math.min(1, this.presence + dt / HAND.fadeIn);
    } else {
      this.presence = Math.max(0, this.presence - dt / HAND.fadeOut);
      // 사라지는 동안 속도도 빠르게 줄여, 마지막 순간의 휘두름이 계속 밀지 않게 함
      const decay = Math.exp(-dt * 10);
      for (const t of this.tracks) {
        t.vx *= decay;
        t.vy *= decay;
      }
    }
    if (this.presence === 0) this.needsReset = true;

    // 검출 사이(약 33ms)에도 손이 멈춰 보이지 않도록 아주 짧게 앞으로 이어 그립니다.
    const ahead = seen ? Math.min(now - this.lastSeen, HAND.extrapolateMs) / 1000 : 0;
    this.tracks.forEach((t, k) => {
      const c = this.colliders[k];
      c.x = t.x + t.vx * ahead;
      c.y = t.y + t.vy * ahead;
      c.vx = t.vx;
      c.vy = t.vy;
      c.weight = this.presence;
    });
  }

  reset(): void {
    this.presence = 0;
    this.lastSeen = -Infinity;
    this.needsReset = true;
    for (const c of this.colliders) c.weight = 0;
  }
}
