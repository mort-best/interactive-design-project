import * as THREE from "three";
import { PALETTE } from "./config";

// 젤리 / 반투명 소프트 레진 느낌의 재질, 스튜디오 환경 반사, 색이 번지는 접촉 그림자.

// high: 실제 투과(transmission)로 속에 색이 머금어진 깊이를 냄
// light: 투과 없이 비슷한 인상을 내는 가벼운 재질 (느린 기기에서 자동 전환)
export type Quality = "high" | "light";

interface JellySpec {
  color: number; // 겉에서 보이는 색
  deep: number; // 속으로 들어갈수록 머금어지는 색 (투과 시 흡수 색)
  rim: number; // 밝게 빛나는 가장자리 색
  rimStrength: number;
  glow: number; // 아래로 번지는 그림자 색
  glowOpacity: number;
  transmission: number; // 0이면 불투명
  thickness: number;
  attenuationDistance: number; // 클수록 속 색이 옅고 밝음
  roughness: number; // 넓고 부드러운 하이라이트를 위해 너무 낮지 않게
  clearcoat: number;
  clearcoatRoughness: number;
}

const SPECS: Record<number, JellySpec> = {
  [PALETTE.pumpkin]: {
    color: 0xf5923a,
    deep: 0xe9661c,
    rim: 0xffd7ad,
    rimStrength: 0.55,
    glow: 0xe0783a,
    glowOpacity: 0.22,
    transmission: 0.72,
    thickness: 1.0,
    attenuationDistance: 1.6,
    roughness: 0.36,
    clearcoat: 0.8,
    clearcoatRoughness: 0.35,
  },
  [PALETTE.yellow]: {
    color: 0xfad35c,
    deep: 0xf1ae1c,
    rim: 0xfff4cc,
    rimStrength: 0.55,
    glow: 0xd9a63a,
    glowOpacity: 0.2,
    transmission: 0.72,
    thickness: 1.0,
    attenuationDistance: 1.8,
    roughness: 0.36,
    clearcoat: 0.8,
    clearcoatRoughness: 0.35,
  },
  // 크림색은 배경과 비슷해서, 투과를 줄여 우윳빛 레진처럼 형태가 보이게 함
  [PALETTE.cream]: {
    color: 0xfbf2e2,
    deep: 0xe4cba4,
    rim: 0xffffff,
    rimStrength: 0.45,
    glow: 0xc8a57a,
    glowOpacity: 0.18,
    transmission: 0.38,
    thickness: 1.0,
    attenuationDistance: 2.2,
    roughness: 0.38,
    clearcoat: 0.8,
    clearcoatRoughness: 0.35,
  },
  // 탁한 노랑: 포장 사탕 끝 등
  [PALETTE.mustard]: {
    color: 0xe0b24c,
    deep: 0xc08a24,
    rim: 0xfff0c8,
    rimStrength: 0.5,
    glow: 0xc99a3a,
    glowOpacity: 0.18,
    transmission: 0.6,
    thickness: 1.0,
    attenuationDistance: 1.6,
    roughness: 0.38,
    clearcoat: 0.8,
    clearcoatRoughness: 0.35,
  },
  // 먹색은 투명함 대신 부드러운 광택과 형태: 불투명, 넓게 번진 윤기, 은은하게 밝은 테두리
  [PALETTE.ink]: {
    color: PALETTE.ink,
    deep: PALETTE.ink,
    rim: 0xa8927f,
    rimStrength: 0.55,
    glow: 0x5a4c44,
    glowOpacity: 0.18,
    transmission: 0,
    thickness: 0,
    attenuationDistance: Infinity,
    roughness: 0.42,
    clearcoat: 1.0,
    clearcoatRoughness: 0.42,
  },
};

// 밝은 가장자리: 비스듬히 보이는 곳일수록 rim 색을 더함 (모든 재질이 같은 셰이더를 공유)
function addRim(m: THREE.MeshPhysicalMaterial, color: number, strength: number): void {
  const rimColor = { value: new THREE.Color(color) };
  const rimStrength = { value: strength };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = rimColor;
    shader.uniforms.rimStrength = rimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;")
      .replace(
        "#include <opaque_fragment>",
        "float rimF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 2.6 );\n" +
          "outgoingLight += rimColor * rimF * rimStrength;\n#include <opaque_fragment>"
      );
  };
  m.customProgramCacheKey = () => "jelly-rim";
}

const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();

export interface MaterialOptions {
  // 정점 색으로 음영을 곱함 (해골의 눈구멍·치아 홈을 살짝 어둡게)
  vertexColors?: boolean;
}

export function getMaterial(color: number, quality: Quality, opts: MaterialOptions = {}): THREE.MeshPhysicalMaterial {
  const key = `${color}-${quality}-${opts.vertexColors ? "vc" : ""}`;
  let m = materialCache.get(key);
  if (m) return m;
  const s = SPECS[color];
  m = new THREE.MeshPhysicalMaterial({
    color: s.color,
    roughness: s.roughness,
    metalness: 0,
    ior: 1.36, // 물·젤리에 가까운 낮은 굴절률 → 배경이 유리처럼 또렷하게 휘어 보이지 않음
    clearcoat: s.clearcoat,
    clearcoatRoughness: s.clearcoatRoughness,
    // 먹색은 형태가 묻히지 않도록 환경 반사를 조금 더 받음
    envMapIntensity: s.transmission > 0 ? 1.0 : 1.35,
    vertexColors: !!opts.vertexColors,
  });
  if (s.transmission > 0) {
    if (quality === "high") {
      // 실제 투과: 거칠기 때문에 비치는 배경이 흐려져 유리가 아닌 젤리처럼 보이고,
      // 두께·흡수 색 덕분에 속에 색이 머금어진 깊이가 생김
      // 정점 색으로 파인 곳을 표현하는 재질(해골)은 속이 덜 비치게 해서 윤곽이 흐려지지 않게
      m.transmission = opts.vertexColors ? s.transmission * 0.45 : s.transmission;
      m.thickness = s.thickness;
      m.attenuationColor = new THREE.Color(s.deep);
      m.attenuationDistance = s.attenuationDistance;
    } else {
      // 가벼운 재질: 투과 없이, 속에서 은은하게 빛나는 색으로 깊이감을 흉내 냄
      m.emissive = new THREE.Color(s.deep).lerp(new THREE.Color(s.color), 0.4);
      m.emissiveIntensity = 0.18;
    }
  }
  if (quality === "light") {
    // 코팅층 계산을 빼고, 대신 표면을 조금 더 매끈하게 해서 윤기를 유지
    m.clearcoat = 0;
    m.roughness = Math.max(0.28, s.roughness - 0.06);
  }
  addRim(m, s.rim, s.rimStrength);
  materialCache.set(key, m);
  return m;
}

export function glowFor(color: number): { color: number; opacity: number } {
  const s = SPECS[color];
  return { color: s.glow, opacity: s.glowOpacity };
}

// 작품과 모델 미리보기가 같은 조명 조건을 쓰도록 한 곳에 모아 둡니다.
// 대부분 환경 반사로 밝히고, 직사광은 약하게 (딱딱한 그림자 없음)
export function setupStudio(renderer: THREE.WebGLRenderer, scene: THREE.Scene, background: number): void {
  renderer.setClearColor(background, 1);
  // 색을 과하게 바꾸지 않는 톤 매핑: 호박색·노랑이 탁해지지 않고 하이라이트만 부드럽게 눌러 줌
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  scene.background = new THREE.Color(background);
  scene.environment = createStudioEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0xf2d6b8, 0.55));
  const key = new THREE.DirectionalLight(0xfff2e2, 0.55);
  key.position.set(-5, 9, 12);
  scene.add(key);
}

// 넓은 스튜디오 조명을 비춘 듯한 환경 반사.
// 크림색 방 안에 커다란 소프트박스 몇 개를 두고, 흐리게 만든 반사 지도로 씁니다.
// (반사가 날카롭지 않도록 조명은 넓게, 방은 따뜻한 색으로)
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, intensity: number, side: THREE.Side = THREE.DoubleSide) => {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side });
    const mesh = new THREE.Mesh(geo, mat);
    disposables.push(geo, mat);
    env.add(mesh);
    return mesh;
  };
  // 따뜻한 크림색 방
  add(new THREE.SphereGeometry(30, 32, 16), 0xf3e2c8, 0.55, THREE.BackSide);
  // 앞쪽 왼쪽 위의 큰 소프트박스: 오브젝트 윗부분에 넓고 부드러운 하이라이트
  const key = add(new THREE.PlaneGeometry(16, 10), 0xfff7ec, 2.6);
  key.position.set(-5, 9, 14);
  key.lookAt(0, 0, 0);
  // 옆에서 가장자리를 밝혀 주는 세로 소프트박스 두 개
  const left = add(new THREE.PlaneGeometry(6, 14), 0xfff1e2, 1.3);
  left.position.set(-15, 1, 4);
  left.lookAt(0, 0, 0);
  const right = add(new THREE.PlaneGeometry(6, 14), 0xffe8cf, 0.9);
  right.position.set(15, 0, 3);
  right.lookAt(0, 0, 0);
  // 아래에서 올라오는 따뜻한 반사광 (색이 번지는 느낌)
  const floor = add(new THREE.PlaneGeometry(40, 14), 0xf3b07a, 0.45);
  floor.position.set(0, -12, 6);
  floor.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.06).texture;
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return tex;
}

// 오브젝트 아래(뒤)로 은은하게 번지는 색 그림자. 한 번의 그리기로 모든 오브젝트를 처리하고,
// 매 프레임 오브젝트 위치를 따라갑니다.
export interface GlowPlacement {
  // 오브젝트 크기(약 1) 기준 그림자 폭·높이, 오브젝트 중심에서 아래·뒤로 떨어진 거리
  width: number;
  height: number;
  down: number;
  back: number;
}

// 오브젝트 바로 아래에만 작고 납작하게: 번짐이 배경 전체로 퍼지지 않게
export const CONTACT: GlowPlacement = { width: 1.1, height: 0.5, down: 0.48, back: 0.35 };

export class GlowLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private count = 0;
  private sizes: number[] = [];

  constructor(max: number, private readonly place: GlowPlacement = CONTACT) {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.6)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.15)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    // 색마다 불투명도가 달라서, 불투명도는 인스턴스 색의 밝기로 흉내 내지 않고 알파 텍스처 × 색 × opacity로 처리
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float glowAlpha;\nvarying float vGlowAlpha;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlowAlpha = glowAlpha;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlowAlpha;")
        .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= vGlowAlpha;");
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute("glowAlpha", new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  // sizes: 오브젝트마다 크기 배율 (없으면 1)
  setColors(colors: number[], sizes: number[] = []): void {
    this.sizes = sizes;
    this.count = Math.min(colors.length, this.mesh.instanceMatrix.count);
    const alpha = this.mesh.geometry.getAttribute("glowAlpha") as THREE.InstancedBufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const glow = glowFor(colors[i]);
      this.mesh.setColorAt(i, c.set(glow.color));
      alpha.setX(i, glow.opacity);
    }
    alpha.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.count;
  }

  // 오브젝트 조금 아래·뒤쪽에 넓게 깔리도록 배치
  update(positions: THREE.Vector3[]): void {
    const d = this.dummy;
    for (let i = 0; i < this.count; i++) {
      const p = positions[i];
      const k = this.sizes[i] ?? 1;
      const pl = this.place;
      d.position.set(p.x, p.y - pl.down * k, p.z - pl.back * k);
      d.scale.set(pl.width * k, pl.height * k, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
