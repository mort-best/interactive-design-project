import * as THREE from "three";
import { PALETTE } from "./config";

// 세 가지 형태: 구, 둥근 큐브, 링
export type ShapeKind = "sphere" | "roundedCube" | "ring";

const SHAPE_ORDER: ShapeKind[] = ["sphere", "roundedCube", "ring"];

// 제한된 팔레트 (배경과 대비되는 색만 사용)
const COLOR_CYCLE = [
  PALETTE.ink,
  PALETTE.red,
  PALETTE.blue,
  PALETTE.yellow,
  PALETTE.ivory,
];

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
  let color = COLOR_CYCLE[c0];
  for (let k = 0; k < COLOR_CYCLE.length; k++) {
    color = COLOR_CYCLE[(c0 + k) % COLOR_CYCLE.length];
    if (color !== left?.color && color !== top?.color) break;
  }
  return { kind, color };
}

// 지오메트리는 형태별로 한 번만 만들어 공유합니다(성능).
const geometryCache = new Map<ShapeKind, THREE.BufferGeometry>();

// 둥근 큐브: 세그먼트가 많은 박스를 구면으로 살짝 부풀려 모서리를 둥글게 만듭니다.
function createRoundedCubeGeometry(size: number, radius: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size, size, size, 8, 8, 8);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const half = size / 2;
  const inner = half - radius;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // 각 축을 안쪽 코어 영역으로 클램프한 지점을 중심으로 반지름만큼 밀어냅니다.
    const cx = THREE.MathUtils.clamp(v.x, -inner, inner);
    const cy = THREE.MathUtils.clamp(v.y, -inner, inner);
    const cz = THREE.MathUtils.clamp(v.z, -inner, inner);
    const dx = v.x - cx;
    const dy = v.y - cy;
    const dz = v.z - cz;
    const len = Math.hypot(dx, dy, dz) || 1;
    v.set(
      cx + (dx / len) * radius,
      cy + (dy / len) * radius,
      cz + (dz / len) * radius
    );
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function getGeometry(kind: ShapeKind): THREE.BufferGeometry {
  const cached = geometryCache.get(kind);
  if (cached) return cached;

  let geo: THREE.BufferGeometry;
  switch (kind) {
    // 오브젝트가 많고 화면에서 작게 보이므로, 모양은 같게 두고 면 수만 줄였습니다(성능).
    case "sphere":
      geo = new THREE.SphereGeometry(0.5, 32, 20);
      break;
    case "roundedCube":
      geo = createRoundedCubeGeometry(0.95, 0.22);
      break;
    case "ring":
      // 도넛(토러스)을 링으로 사용
      geo = new THREE.TorusGeometry(0.42, 0.16, 16, 40);
      break;
  }
  geometryCache.set(kind, geo);
  return geo;
}

// 무광(러프니스 높은) 소재. 색마다 하나씩 만들어 모든 오브젝트가 공유합니다.
const materialCache = new Map<number, THREE.MeshStandardMaterial>();

export function getMaterial(color: number): THREE.MeshStandardMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0 });
    materialCache.set(color, m);
  }
  return m;
}
