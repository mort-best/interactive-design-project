import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PALETTE } from "../config";
import { getMaterial, type Quality } from "../look";

// 할로윈 디자이너 토이 6종. 모두 코드로 만든 실제 3D 형태입니다(이미지·스프라이트 아님).
// - 부품은 하나의 그룹으로 묶여 함께 움직이고 회전합니다.
// - 같은 재질의 부품은 하나의 지오메트리로 합쳐서, 모델 하나당 그리기 횟수를 2~3번으로 줄입니다.
// - 지오메트리·재질은 종류마다 한 번만 만들고 모든 복제본이 공유합니다.
// - 크기는 약 1(기존 구·큐브·링과 같음), 중심은 원점, 기본 방향은 특징이 잘 보이게 맞춥니다.

export type ModelKind = "pumpkin" | "ghost" | "candy" | "bat" | "hat" | "skull";
export const MODEL_KINDS: ModelKind[] = ["pumpkin", "ghost", "candy", "bat", "hat", "skull"];
export const MODEL_LABELS: Record<ModelKind, string> = {
  pumpkin: "호박",
  ghost: "유령",
  candy: "포장 사탕",
  bat: "박쥐",
  hat: "마녀 모자",
  skull: "해골",
};
// 아래 그림자 색에 쓰는 대표 색
export const MODEL_MAIN_COLOR: Record<ModelKind, number> = {
  pumpkin: PALETTE.pumpkin,
  ghost: PALETTE.cream,
  candy: PALETTE.pumpkin,
  bat: PALETTE.ink,
  hat: PALETTE.ink,
  skull: PALETTE.cream,
};

const { pumpkin: ORANGE, cream: IVORY, ink: INK, mustard: MUSTARD } = PALETTE;

// ---------------------------------------------------------------- 지오메트리 도구

// 법선을 매끄럽게: 같은 위치의 점을 하나로 합친 뒤 다시 계산 (구의 이음새·극점이 보이지 않게)
function smooth(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo : geo;
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

function deform(geo: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  return geo;
}

function ellipsoid(rx: number, ry: number, rz: number, ws = 40, hs = 28): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
}

function lathe(points: [number, number][], segments = 48): THREE.BufferGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// 곡선을 따라 굵기가 변하는 관 (마녀 모자 원뿔)
function sweep(center: (t: number) => THREE.Vector3, radius: (t: number) => number, rings: number, sides: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = center(t);
    const tan = center(Math.min(1, t + 1e-3)).sub(center(Math.max(0, t - 1e-3))).normalize();
    const n = new THREE.Vector3().crossVectors(tan, up).normalize();
    const b = new THREE.Vector3().crossVectors(n, tan).normalize();
    const r = radius(t);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const p = c.clone().addScaledVector(n, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j;
      const b2 = a + sides + 1;
      idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// 격자형 매개변수 곡면 (유령 몸통): (t, v) → 점
function parametric(fn: (t: number, v: number) => THREE.Vector3, rows: number, cols: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const p = fn(i / rows, (j / cols) * Math.PI * 2);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// 몸체 표면에 붙이는 부품의 위치·방향: 정면(+z)에서 광선을 쏴서 표면 점과 법선을 찾음
const ray = new THREE.Raycaster();
function onSurface(body: THREE.BufferGeometry, x: number, y: number, embed: number, spin = 0, scale = new THREE.Vector3(1, 1, 1)): THREE.Matrix4 {
  const mesh = new THREE.Mesh(body);
  ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(mesh, false)[0];
  const p = hit ? hit.point : new THREE.Vector3(x, y, 0);
  const n = hit?.face ? hit.face.normal.clone().normalize() : new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
  return new THREE.Matrix4().compose(p.addScaledVector(n, -embed), q, scale);
}

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  shade?: boolean; // 정점 색 음영 사용
  matrix?: THREE.Matrix4;
}

// 합치기 전에 모든 부품이 같은 속성을 갖도록 정리 (위치·법선·uv·색, 인덱스 없음)
function prepare(p: Part): THREE.BufferGeometry {
  let g = p.geo.clone();
  if (p.matrix) g.applyMatrix4(p.matrix);
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const name of Object.keys(g.attributes)) {
    if (!["position", "normal", "uv", "color"].includes(name)) g.deleteAttribute(name);
  }
  return g;
}

// ---------------------------------------------------------------- 모델별 형태

function pumpkinParts(): Part[] {
  // 통통하고 살짝 납작한 몸체, 부드러운 세로 골 8개, 꼭지 자리가 살짝 들어감
  const body = smooth(
    deform(new THREE.SphereGeometry(0.5, 80, 48), (v) => {
      const r = v.length();
      const cosT = v.y / r;
      const phi = Math.atan2(v.z, v.x);
      const g = 0.5 - 0.5 * Math.cos(8 * phi); // 0 = 볼록한 면, 1 = 골
      const k = 1 - 0.075 * g * g * (1 - Math.pow(Math.abs(cosT), 6));
      v.x *= k;
      v.z *= k;
      v.y *= 0.8;
      const rh2 = v.x * v.x + v.z * v.z;
      if (v.y > 0) v.y -= 0.085 * Math.exp(-rh2 / 0.012);
      else v.y += 0.05 * Math.exp(-rh2 / 0.02);
    })
  );
  // 짧고 살짝 휘어진 꼭지
  const stem = smooth(
    deform(
      lathe([[0.075, 0], [0.072, 0.06], [0.062, 0.12], [0.05, 0.165], [0.036, 0.19], [0.016, 0.202], [0, 0.204]], 24),
      (v) => {
        v.x += 1.1 * v.y * v.y;
      }
    )
  );
  const stemM = new THREE.Matrix4().makeTranslation(0, 0.27, 0);
  // 작은 눈과 웃는 입
  const eye = ellipsoid(0.042, 0.058, 0.028, 20, 14);
  const mouth = new THREE.TorusGeometry(0.075, 0.019, 10, 28, Math.PI * 0.72).rotateZ(-Math.PI / 2 - Math.PI * 0.36);
  return [
    { geo: body, color: ORANGE },
    { geo: stem, color: INK, matrix: stemM },
    { geo: eye, color: INK, matrix: onSurface(body, -0.13, 0.06, 0.012) },
    { geo: eye, color: INK, matrix: onSurface(body, 0.13, 0.06, 0.012) },
    { geo: mouth, color: INK, matrix: onSurface(body, 0, -0.07, 0.012) },
  ];
}

function ghostParts(): Part[] {
  // 둥근 머리에서 몸통, 물결 밑단까지 하나로 이어진 매끈한 형태
  const profile = (t: number): [number, number] => {
    if (t < 0.4) {
      const a = (t / 0.4) * (Math.PI / 2);
      return [0.34 * Math.sin(a), 0.16 + 0.34 * Math.cos(a)];
    }
    if (t < 0.8) {
      const s = (t - 0.4) / 0.4;
      return [0.34 + 0.08 * Math.pow(s, 1.5), 0.16 - 0.44 * s];
    }
    const s = (t - 0.8) / 0.2;
    if (s < 0.5) {
      const b = (s / 0.5) * (Math.PI / 2);
      return [0.37 + 0.05 * Math.cos(b), -0.28 - 0.05 * Math.sin(b)];
    }
    const u = (s - 0.5) / 0.5;
    return [0.37 * (1 - u), -0.33 + 0.06 * u];
  };
  const body = smooth(
    parametric(
      (t, v) => {
        const [r0, y0] = profile(t);
        // 밑단 물결: 아래쪽으로 갈수록 커지고, 바닥 안쪽으로 가면 다시 작아짐
        const amp = 0.05 * smoothstep(0.6, 0.86, t) * (t > 0.9 ? r0 / 0.37 : 1);
        const w = Math.sin(5 * v);
        const r = r0 * (1 + 0.025 * w * (amp / 0.05));
        return new THREE.Vector3(r * Math.cos(v), y0 + amp * w, r * Math.sin(v));
      },
      64,
      80
    )
  );
  // 짧은 팔
  const arm = ellipsoid(0.1, 0.062, 0.075, 24, 16);
  const armL = new THREE.Matrix4().compose(new THREE.Vector3(-0.39, -0.02, 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, 0.55)), new THREE.Vector3(1, 1, 1));
  const armR = new THREE.Matrix4().compose(new THREE.Vector3(0.39, -0.02, 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.3, -0.55)), new THREE.Vector3(1, 1, 1));
  // 작은 먹색 눈 두 개
  const eye = ellipsoid(0.038, 0.056, 0.026, 20, 14);
  return [
    { geo: body, color: IVORY },
    { geo: arm, color: IVORY, matrix: armL },
    { geo: arm, color: IVORY, matrix: armR },
    { geo: eye, color: INK, matrix: onSurface(body, -0.1, 0.25, 0.01) },
    { geo: eye, color: INK, matrix: onSurface(body, 0.1, 0.25, 0.01) },
  ];
}

function candyParts(): Part[] {
  // 통통한 몸체 (가로로 긴 타원체) + 아이보리 줄무늬 두 줄
  const bodyRx = 0.3;
  const bodyR = 0.26;
  const body = ellipsoid(bodyRx, bodyR, bodyR, 48, 32);
  const stripe = (x: number) => {
    const R = bodyR * Math.sqrt(1 - (x / bodyRx) ** 2) - 0.004;
    return new THREE.TorusGeometry(R, 0.03, 12, 56).rotateY(Math.PI / 2).translate(x, 0, 0);
  };
  // 양쪽 비틀린 포장 끝: 두께와 둥근 테두리가 있는 나팔 모양 + 비틀린 주름
  const end = smooth(
    deform(
      lathe(
        [[0, 0], [0.06, 0], [0.074, 0.05], [0.108, 0.12], [0.158, 0.19], [0.194, 0.235], [0.206, 0.256], [0.198, 0.273], [0.162, 0.28], [0.08, 0.272], [0, 0.265]],
        64
      ),
      (v) => {
        const phi = Math.atan2(v.z, v.x);
        const k = smoothstep(0.03, 0.2, v.y);
        const twist = 2.4 * v.y;
        const r = Math.hypot(v.x, v.z) * (1 + 0.12 * Math.sin(8 * phi + 3 * v.y) * k);
        const a = phi + twist;
        v.x = r * Math.cos(a);
        v.z = r * Math.sin(a);
      }
    )
  );
  const endR = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0.25, 0, 0));
  const endL = new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(-0.25, 0, 0));
  return [
    { geo: body, color: ORANGE },
    { geo: stripe(-0.12), color: IVORY },
    { geo: stripe(0.12), color: IVORY },
    { geo: end, color: MUSTARD, matrix: endR },
    { geo: end, color: MUSTARD, matrix: endL },
  ];
}

function batParts(): Part[] {
  const body = smooth(
    deform(ellipsoid(0.24, 0.29, 0.23, 44, 32), (v) => {
      // 아래쪽이 조금 더 통통하게
      if (v.y < 0) {
        const k = 1 + 0.12 * (-v.y / 0.29);
        v.x *= k;
        v.z *= k;
      }
    })
  );
  // 작은 귀
  const ear = smooth(lathe([[0.07, 0], [0.066, 0.04], [0.048, 0.095], [0.026, 0.14], [0.01, 0.162], [0, 0.165]], 20));
  const earM = (s: number) => new THREE.Matrix4().compose(new THREE.Vector3(0.11 * s, 0.2, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.35 * s)), new THREE.Vector3(1, 1, 0.75));
  // 두껍고 둥근 날개: 윗선은 부드러운 호, 아랫선은 세 번 부드럽게 오목한 물결
  const wingShape = (s: number) => {
    const P = (x: number, y: number) => new THREE.Vector2(x * s, y);
    const sh = new THREE.Shape();
    sh.moveTo(P(0.14, 0.13).x, P(0.14, 0.13).y);
    const c1 = P(0.36, 0.34), p1 = P(0.64, 0.2);
    sh.quadraticCurveTo(c1.x, c1.y, p1.x, p1.y);
    const c2 = P(0.7, 0.12), p2 = P(0.66, 0.03);
    sh.quadraticCurveTo(c2.x, c2.y, p2.x, p2.y);
    const tips: [number, number][] = [[0.66, 0.03], [0.5, -0.04], [0.33, -0.08], [0.15, -0.13]];
    for (let i = 1; i < tips.length; i++) {
      const [ax, ay] = tips[i - 1];
      const [bx, by] = tips[i];
      const c = P((ax + bx) / 2, (ay + by) / 2 + 0.07);
      const e = P(bx, by);
      sh.quadraticCurveTo(c.x, c.y, e.x, e.y);
    }
    const back = P(0.14, 0.13);
    sh.lineTo(back.x, back.y);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 5, curveSegments: 28 });
    g.translate(0, 0, -0.02);
    return smooth(g);
  };
  const wingM = (s: number) => new THREE.Matrix4().compose(new THREE.Vector3(0, 0.02, -0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3 * s, 0.06 * s)), new THREE.Vector3(1, 1, 1));
  // 작은 아이보리 눈 두 개
  const eye = ellipsoid(0.034, 0.04, 0.022, 18, 12);
  return [
    { geo: body, color: INK },
    { geo: ear, color: INK, matrix: earM(-1) },
    { geo: ear, color: INK, matrix: earM(1) },
    { geo: wingShape(-1), color: INK, matrix: wingM(-1) },
    { geo: wingShape(1), color: INK, matrix: wingM(1) },
    { geo: eye, color: IVORY, matrix: onSurface(body, -0.075, 0.08, 0.008) },
    { geo: eye, color: IVORY, matrix: onSurface(body, 0.075, 0.08, 0.008) },
  ];
}

function hatParts(): Part[] {
  // 두꺼운 타원형 챙: 둥근 테두리, 가장자리가 살짝 말려 올라감
  const brim = smooth(
    deform(
      lathe(
        [[0, -0.036], [0.44, -0.036], [0.495, -0.031], [0.526, -0.014], [0.535, 0.004], [0.527, 0.022], [0.497, 0.036], [0.44, 0.038], [0, 0.034]],
        72
      ),
      (v) => {
        const r = Math.hypot(v.x, v.z);
        v.y += 0.035 * Math.pow(r / 0.535, 4);
        v.z *= 0.82;
      }
    )
  );
  // 끝이 살짝 휘어진 통통한 원뿔, 둥근 끝
  const H = 0.66;
  const center = (t: number) => new THREE.Vector3(0.17 * t * t * t, 0.02 + H * t, -0.09 * t * t);
  const radius = (t: number) => {
    const t0 = 0.88;
    const base = 0.255 * (1 - t) * (1 + 0.07 * Math.sin(Math.PI * t));
    if (t <= t0) return base;
    const r0 = 0.255 * (1 - t0) * (1 + 0.07 * Math.sin(Math.PI * t0));
    const u = (t - t0) / (1 - t0);
    return r0 * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const cone = smooth(sweep(center, radius, 80, 40));
  // 주황색 띠 (원뿔 아래쪽을 감쌈)
  const band = smooth(lathe([[0.22, 0.04], [0.258, 0.042], [0.272, 0.058], [0.268, 0.13], [0.255, 0.15], [0.22, 0.152]], 64));
  // 작은 아이보리 버클: 둥근 네모 고리
  const buckle = new THREE.TorusGeometry(0.052, 0.017, 10, 4).rotateZ(Math.PI / 4);
  const buckleM = onSurface(band, 0, 0.098, 0.004, 0, new THREE.Vector3(1, 0.9, 1));
  return [
    { geo: brim, color: INK },
    { geo: cone, color: INK },
    { geo: band, color: ORANGE },
    { geo: buckle, color: IVORY, matrix: buckleM },
  ];
}

function skullParts(): Part[] {
  // 두개골: 통통한 구에 눈구멍·코를 실제로 얕게 파고, 파인 곳은 정점 색으로 살짝 어둡게
  const dents: { dir: THREE.Vector3; w: number; wx: number; depth: number }[] = [
    { dir: new THREE.Vector3(-0.35, 0.02, 0.94).normalize(), w: 0.17, wx: 1.12, depth: 0.1 },
    { dir: new THREE.Vector3(0.35, 0.02, 0.94).normalize(), w: 0.17, wx: 1.12, depth: 0.1 },
    { dir: new THREE.Vector3(-0.04, -0.24, 0.97).normalize(), w: 0.055, wx: 1, depth: 0.06 },
    { dir: new THREE.Vector3(0.04, -0.24, 0.97).normalize(), w: 0.055, wx: 1, depth: 0.06 },
  ];
  const shadeColor = new THREE.Color(0.42, 0.33, 0.28);
  const cranium = smooth(
    deform(new THREE.SphereGeometry(0.4, 72, 52), (v) => {
      const d = v.clone().normalize();
      let dent = 0;
      for (const k of dents) {
        // 가로로 조금 긴 타원형으로 파임
        const dx = (d.x - k.dir.x) / k.wx;
        const dy = d.y - k.dir.y;
        const dz = d.z - k.dir.z;
        dent += k.depth * Math.exp(-(dx * dx + dy * dy + dz * dz) / (k.w * k.w));
      }
      v.multiplyScalar(1 - dent / 0.4);
      v.y *= 0.94;
      v.z *= 0.95;
    })
  );
  shadeByDepth(cranium, 0.4 * 0.94, shadeColor, (v) => new THREE.Vector3(v.x, v.y / 0.94, v.z / 0.95).length(), 0.4);
  // 작고 둥근 턱 + 치아 홈 3개
  const jawC = new THREE.Vector3(0, -0.3, 0.12);
  const jaw = smooth(
    deform(ellipsoid(0.21, 0.12, 0.18, 48, 32), (v) => {
      if (v.z > 0.05 && v.y > -0.06) {
        let g = 0;
        for (const gx of [-0.075, 0, 0.075]) g += Math.exp(-(((v.x - gx) / 0.014) ** 2));
        const band = smoothstep(-0.06, 0.02, v.y);
        const s = 1 - (0.026 * g * band) / Math.hypot(v.x, v.y, v.z);
        v.x *= s;
        v.z *= s;
      }
    }).translate(jawC.x, jawC.y, jawC.z)
  );
  shadeGrooves(jaw, jawC, shadeColor);
  return [
    { geo: cranium, color: IVORY, shade: true },
    { geo: jaw, color: IVORY, shade: true },
  ];
}

// 두개골: 원래 반지름보다 안쪽으로 들어간 만큼 정점 색을 어둡게
function shadeByDepth(geo: THREE.BufferGeometry, _r: number, dark: THREE.Color, radiusOf: (v: THREE.Vector3) => number, base: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const depth = Math.max(0, base - radiusOf(v));
    const k = smoothstep(0.006, 0.07, depth);
    col[i * 3] = 1 + (dark.r - 1) * k;
    col[i * 3 + 1] = 1 + (dark.g - 1) * k;
    col[i * 3 + 2] = 1 + (dark.b - 1) * k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

// 턱: 치아 홈 위치를 살짝 어둡게
function shadeGrooves(geo: THREE.BufferGeometry, c: THREE.Vector3, dark: THREE.Color): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c);
    let g = 0;
    if (v.z > 0.05 && v.y > -0.06) {
      for (const gx of [-0.075, 0, 0.075]) g += Math.exp(-(((v.x - gx) / 0.016) ** 2));
      g *= smoothstep(-0.06, 0.02, v.y);
    }
    const k = Math.min(1, g) * 0.85;
    col[i * 3] = 1 + (dark.r - 1) * k;
    col[i * 3 + 1] = 1 + (dark.g - 1) * k;
    col[i * 3 + 2] = 1 + (dark.b - 1) * k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

// 정렬했을 때 특징이 가장 잘 보이는 기본 방향 (카메라는 정면에서 약 15° 내려다봄)
const DEFAULT_ROTATION: Record<ModelKind, THREE.Euler> = {
  pumpkin: new THREE.Euler(-0.12, 0, 0),
  ghost: new THREE.Euler(-0.12, 0, 0),
  candy: new THREE.Euler(-0.2, 0.45, 0.32),
  bat: new THREE.Euler(-0.12, 0, 0),
  hat: new THREE.Euler(0.32, -0.35, 0.06),
  skull: new THREE.Euler(-0.18, 0, 0),
};

const BUILDERS: Record<ModelKind, () => Part[]> = {
  pumpkin: pumpkinParts,
  ghost: ghostParts,
  candy: candyParts,
  bat: batParts,
  hat: hatParts,
  skull: skullParts,
};

// ---------------------------------------------------------------- 조립 (종류마다 한 번)

interface Built {
  groups: { geo: THREE.BufferGeometry; color: number; shade: boolean }[];
  center: THREE.Vector3; // 모델 자체의 중심 (회전 중심)
  scale: number; // 크기 맞춤 배율
  offset: THREE.Vector3; // 기본 방향에서 정면으로 봤을 때 가운데로 오게 하는 이동
}

const built = new Map<ModelKind, Built>();

function build(kind: ModelKind): Built {
  const cached = built.get(kind);
  if (cached) return cached;
  const parts = BUILDERS[kind]();
  // 같은 재질끼리 하나로 합침
  const byKey = new Map<string, { color: number; shade: boolean; geos: THREE.BufferGeometry[] }>();
  for (const p of parts) {
    const key = `${p.color}-${p.shade ? 1 : 0}`;
    if (!byKey.has(key)) byKey.set(key, { color: p.color, shade: !!p.shade, geos: [] });
    byKey.get(key)!.geos.push(prepare(p));
  }
  const groups = [...byKey.values()].map((g) => {
    const geo = mergeGeometries(g.geos, false)!;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return { geo, color: g.color, shade: g.shade };
  });
  // 중심과 크기: 모델의 실제 부피 중심을 원점에, 기본 방향에서 본 크기를 약 1로
  const box = new THREE.Box3();
  for (const g of groups) box.union(g.geo.boundingBox!);
  const center = box.getCenter(new THREE.Vector3());
  const probe = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.copy(DEFAULT_ROTATION[kind]);
  probe.add(inner);
  for (const g of groups) {
    const m = new THREE.Mesh(g.geo);
    m.position.copy(center).negate();
    inner.add(m);
  }
  probe.updateMatrixWorld(true);
  const front = new THREE.Box3().setFromObject(probe);
  const size = front.getSize(new THREE.Vector3());
  // 넓은 모델(박쥐 날개 등)은 면적 기준으로 줄여 다른 모델과 비슷해 보이게, 단 가장 긴 쪽은 1.12 이하
  const scale = Math.min(0.95 / Math.sqrt(size.x * size.y), 1.12 / Math.max(size.x, size.y));
  const offset = front.getCenter(new THREE.Vector3()).multiplyScalar(-scale);
  offset.z = 0;
  const b: Built = { groups, center, scale, offset };
  built.set(kind, b);
  return b;
}

// 모델 하나를 만듭니다. 반환된 그룹을 움직이거나 회전하면 모든 부품이 함께 움직입니다.
// 구조: model(위치·상호작용 회전) → orient(기본 방향·크기) → 부품 메시
export function createModel(kind: ModelKind, quality: Quality): THREE.Group {
  const b = build(kind);
  const model = new THREE.Group();
  model.name = kind;
  const orient = new THREE.Group();
  orient.name = "orient";
  orient.rotation.copy(DEFAULT_ROTATION[kind]);
  orient.scale.setScalar(b.scale);
  orient.position.copy(b.offset);
  model.add(orient);
  for (const g of b.groups) {
    const mesh = new THREE.Mesh(g.geo, getMaterial(g.color, quality, { vertexColors: g.shade }));
    mesh.position.copy(b.center).negate();
    mesh.userData.color = g.color;
    mesh.userData.shade = g.shade;
    orient.add(mesh);
  }
  model.userData.kind = kind;
  return model;
}

// 이미 만든 모델의 재질 품질을 바꿈
export function setModelQuality(model: THREE.Object3D, quality: Quality): void {
  model.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.color !== undefined) {
      o.material = getMaterial(o.userData.color, quality, { vertexColors: o.userData.shade });
    }
  });
}

// 확인용: 종류별 삼각형 수와 그리기 횟수
export function modelStats(kind: ModelKind): { triangles: number; drawCalls: number } {
  const b = build(kind);
  return { triangles: b.groups.reduce((s, g) => s + g.geo.attributes.position.count / 3, 0), drawCalls: b.groups.length };
}
