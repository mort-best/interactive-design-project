import * as THREE from "three";
import { PALETTE } from "./config";

// 세 가지 형태: 구, 둥근 큐브, 링
export type ShapeKind = "sphere" | "roundedCube" | "ring";

const SHAPE_ORDER: ShapeKind[] = ["sphere", "roundedCube", "ring"];

// 할로윈 팔레트
const COLOR_CYCLE = [PALETTE.pumpkin, PALETTE.cream, PALETTE.ink, PALETTE.yellow];

export interface CellStyle {
  kind: ShapeKind;
  color: number;
}

// 칸 (행, 열)마다 고정된 값을 내는 간단한 해시
function hash(r: number, c: number, salt: number): number {
  let h = Math.imul(r + 1, 73856093) ^ Math.imul(c + 1, 19349663) ^ Math.imul(salt, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// 각 칸의 형태와 색을 정합니다. 섞여 보이도록 해시로 고르되,
// 왼쪽·위쪽 이웃과는 형태도 색도 겹치지 않게 합니다.
// 칸 번호로만 정해지므로 창 크기가 바뀌어도 같은 칸에는 같은 오브젝트가 옵니다.
export function styleForCell(r: number, c: number, left?: CellStyle, top?: CellStyle): CellStyle {
  const s0 = hash(r, c, 1) % SHAPE_ORDER.length;
  let kind = SHAPE_ORDER[s0];
  for (let k = 0; k < SHAPE_ORDER.length; k++) {
    kind = SHAPE_ORDER[(s0 + k) % SHAPE_ORDER.length];
    if (kind !== left?.kind && kind !== top?.kind) break;
  }
  const c0 = hash(r, c, 2) % COLOR_CYCLE.length;
  let color: number = COLOR_CYCLE[c0];
  for (let k = 0; k < COLOR_CYCLE.length; k++) {
    color = COLOR_CYCLE[(c0 + k) % COLOR_CYCLE.length];
    if (color !== left?.color && color !== top?.color) break;
  }
  return { kind, color };
}

// 지오메트리는 형태별로 한 번만 만들어 공유합니다(성능).
const geometryCache = new Map<ShapeKind, THREE.BufferGeometry>();

// 둥근 큐브: 박스의 각 점을 안쪽 작은 상자에서 radius만큼 떨어진 곳으로 옮겨 모서리를 둥글게 합니다.
// 법선도 같은 방향으로 직접 넣어서, 광택이 있어도 면 사이에 이음새가 보이지 않습니다.
function createRoundedCubeGeometry(size: number, radius: number, segments: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const inner = size / 2 - radius;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const cx = THREE.MathUtils.clamp(v.x, -inner, inner);
    const cy = THREE.MathUtils.clamp(v.y, -inner, inner);
    const cz = THREE.MathUtils.clamp(v.z, -inner, inner);
    let dx = v.x - cx;
    let dy = v.y - cy;
    let dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    pos.setXYZ(i, cx + dx * radius, cy + dy * radius, cz + dz * radius);
    nor.setXYZ(i, dx, dy, dz);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  return geo;
}

// 말랑하고 볼륨감 있게: 큐브는 더 둥글게, 링은 더 도톰하게. 전체 크기는 이전과 같게(약 1).
// 넓은 하이라이트가 매끈하게 흐르도록 면 수는 충분히 둡니다.
export function getGeometry(kind: ShapeKind): THREE.BufferGeometry {
  const cached = geometryCache.get(kind);
  if (cached) return cached;

  let geo: THREE.BufferGeometry;
  switch (kind) {
    case "sphere":
      geo = new THREE.SphereGeometry(0.5, 40, 28);
      break;
    case "roundedCube":
      geo = createRoundedCubeGeometry(0.94, 0.3, 10);
      break;
    case "ring":
      geo = new THREE.TorusGeometry(0.36, 0.2, 20, 48);
      break;
  }
  geometryCache.set(kind, geo);
  return geo;
}
