import * as THREE from "three";
import { PALETTE } from "./config";

// 세 가지 형태: 구, 둥근 큐브, 링
export type ShapeKind = "sphere" | "roundedCube" | "ring";

const SHAPE_ORDER: ShapeKind[] = ["sphere", "roundedCube", "ring"];

// 형태별로 순환해서 배열의 각 셀에 어떤 형태를 놓을지 결정
export function shapeForIndex(index: number): ShapeKind {
  return SHAPE_ORDER[index % SHAPE_ORDER.length];
}

// 색상도 순환해서 사용 (제한된 팔레트, 배경과 대비되는 색만 사용)
const COLOR_CYCLE = [
  PALETTE.ink,
  PALETTE.red,
  PALETTE.blue,
  PALETTE.yellow,
  PALETTE.ivory,
];

export function colorForIndex(index: number): number {
  return COLOR_CYCLE[index % COLOR_CYCLE.length];
}

// 지오메트리는 형태별로 한 번만 만들어 공유합니다(성능).
const geometryCache = new Map<ShapeKind, THREE.BufferGeometry>();

// 둥근 큐브: 세그먼트가 많은 박스를 구면으로 살짝 부풀려 모서리를 둥글게 만듭니다.
function createRoundedCubeGeometry(size: number, radius: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size, size, size, 12, 12, 12);
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
    case "sphere":
      geo = new THREE.SphereGeometry(0.5, 48, 32);
      break;
    case "roundedCube":
      geo = createRoundedCubeGeometry(0.95, 0.22);
      break;
    case "ring":
      // 도넛(토러스)을 링으로 사용
      geo = new THREE.TorusGeometry(0.42, 0.16, 24, 64);
      break;
  }
  geometryCache.set(kind, geo);
  return geo;
}

// 무광(러프니스 높은) 소재
export function createMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.0,
    flatShading: false,
  });
}
