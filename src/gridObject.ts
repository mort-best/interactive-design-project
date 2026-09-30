import * as THREE from "three";
import { HAND, PHYSICS } from "./config";

// 격자 위의 한 오브젝트. 원래 위치/회전을 기억하고,
// 스프링 + 감쇠로 그곳으로 탄성 있게 돌아옵니다.
export class GridObject {
  readonly mesh: THREE.Mesh;

  // 홈 상태 (원래 위치/방향)
  private readonly home: THREE.Vector3;
  private readonly homeRotation: THREE.Euler;

  // 위치 시뮬레이션 (홈 기준 상대 오프셋)
  private readonly offset = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  // 회전 시뮬레이션 (홈 기준 상대 회전)
  private readonly rotOffset = new THREE.Vector3(); // euler xyz
  private readonly rotVelocity = new THREE.Vector3();

  // 마지막으로 힘을 받은 이후 경과 시간 (복귀 지연 판단용)
  private timeSincePush = Infinity;

  // 손이 막고 있을 때 최대 변위 한계를 넘어도 되는 거리, 그리고 이번 단계에 손에 막혔는지
  private reachOverride = 0;
  private held = false;

  constructor(mesh: THREE.Mesh, home: THREE.Vector3) {
    this.mesh = mesh;
    this.home = home.clone();
    this.homeRotation = mesh.rotation.clone();
    mesh.position.copy(home);
  }

  // 마우스로부터 충격을 적용합니다.
  // dir: 밀어내는 방향(정규화됨), strength: 힘의 크기, spin: 회전 충격 벡터
  applyImpulse(dir: THREE.Vector3, strength: number, spin: THREE.Vector3): void {
    // 부드러운 한계: 원위치에서 멀어질수록 바깥쪽으로 미는 힘이 약해져
    // 최대 거리에서 벽에 부딪히듯 멈추지 않고 자연스럽게 느려집니다.
    const reach = Math.min(this.offset.length() / PHYSICS.maxDisplacement, 1);
    const outward = this.offset.lengthSq() > 0 && dir.dot(this.offset) > 0;
    const scale = outward ? 1 - reach * reach : 1;
    this.velocity.addScaledVector(dir, strength * scale);
    this.rotVelocity.add(spin);
    this.timeSincePush = 0;
  }

  update(dt: number): void {
    this.timeSincePush += dt;

    // 복귀 지연: 최근에 밀렸다면 잠깐은 스프링 복원력을 약하게 둡니다.
    const returning = this.timeSincePush >= PHYSICS.returnDelay;
    const hold = PHYSICS.holdStiffnessRatio;
    const posK = returning ? PHYSICS.positionStiffness : PHYSICS.positionStiffness * hold;
    const rotK = returning ? PHYSICS.rotationStiffness : PHYSICS.rotationStiffness * hold;

    // --- 위치: 스프링(홈으로 당김) + 감쇠 ---
    // a = -k*offset - c*v
    const ax = -posK * this.offset.x - PHYSICS.damping * this.velocity.x;
    const ay = -posK * this.offset.y - PHYSICS.damping * this.velocity.y;
    const az = -posK * this.offset.z - PHYSICS.damping * this.velocity.z;
    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.velocity.z += az * dt;
    this.offset.x += this.velocity.x * dt;
    this.offset.y += this.velocity.y * dt;
    this.offset.z += this.velocity.z * dt;

    // 화면 밖으로 영구히 사라지지 않도록 최대 변위 제한.
    // 손이 막고 있는 동안에는 손 밖 자리까지 허용하고, 손이 떠나면 한계를 서서히 되돌려
    // 갑자기 끌려 들어가지 않게 합니다.
    if (!this.held) this.reachOverride = Math.max(0, this.reachOverride - PHYSICS.maxDisplacement * dt);
    this.held = false;
    const maxD = Math.max(PHYSICS.maxDisplacement, this.reachOverride);
    const dist = this.offset.length();
    if (dist > maxD) {
      this.offset.multiplyScalar(maxD / dist);
      // 경계에서 바깥 방향 속도 성분 제거
      const n = this.offset.clone().normalize();
      const vn = this.velocity.dot(n);
      if (vn > 0) this.velocity.addScaledVector(n, -vn);
    }

    // --- 회전: 스프링 + 감쇠 ---
    const rax = -rotK * this.rotOffset.x - PHYSICS.rotationDamping * this.rotVelocity.x;
    const ray = -rotK * this.rotOffset.y - PHYSICS.rotationDamping * this.rotVelocity.y;
    const raz = -rotK * this.rotOffset.z - PHYSICS.rotationDamping * this.rotVelocity.z;
    this.rotVelocity.x += rax * dt;
    this.rotVelocity.y += ray * dt;
    this.rotVelocity.z += raz * dt;
    this.rotOffset.x += this.rotVelocity.x * dt;
    this.rotOffset.y += this.rotVelocity.y * dt;
    this.rotOffset.z += this.rotVelocity.z * dt;

    this.syncMesh();
  }

  // 손 가장자리에서 부드럽게 밀어냅니다. 위치를 직접 옮기지 않고 속도만 바꿔서,
  // 손 인식이 조금 떨려도 오브젝트는 매끄럽게 움직입니다.
  // (nx, ny): 바깥 방향, pen: 가장자리 안쪽으로 들어온 깊이
  // (hvx, hvy): 그 자리에서 손이 움직이는 속도 — 손이 다가오면 그만큼 함께 밀려남
  pressOut(nx: number, ny: number, pen: number, hvx: number, hvy: number, dt: number): void {
    const vn = this.velocity.x * nx + this.velocity.y * ny;
    // 깊이 들어올수록 빨리 나가되, 속도에 상한을 둬서 한꺼번에 튀어나가지 않게 함
    const handIn = Math.max(0, hvx * nx + hvy * ny);
    const target = Math.min(pen * HAND.pressRate, HAND.maxPressSpeed) + handIn;
    if (vn < target) {
      const a = 1 - Math.exp(-HAND.pressResponse * dt);
      const dv = (target - vn) * a;
      this.velocity.x += nx * dv;
      this.velocity.y += ny * dv;
    }
    // 가장자리를 따라 미끄러지는 움직임은 살짝 줄여 손을 감싼 채로 자리를 잡게 함
    const vn2 = this.velocity.x * nx + this.velocity.y * ny;
    const tx = this.velocity.x - nx * vn2;
    const ty = this.velocity.y - ny * vn2;
    const keep = Math.exp(-HAND.pressFriction * dt);
    this.velocity.x = nx * vn2 + tx * keep;
    this.velocity.y = ny * vn2 + ty * keep;

    this.reachOverride = Math.max(this.reachOverride, this.offset.length() + 0.2);
    this.held = true;
    this.timeSincePush = 0; // 손이 떠난 뒤 잠깐 멈췄다가 천천히 돌아오도록
  }

  private syncMesh(): void {
    this.mesh.position.set(
      this.home.x + this.offset.x,
      this.home.y + this.offset.y,
      this.home.z + this.offset.z
    );
    this.mesh.rotation.set(
      this.homeRotation.x + this.rotOffset.x,
      this.homeRotation.y + this.rotOffset.y,
      this.homeRotation.z + this.rotOffset.z
    );
  }

  // 원래 방향에서 얼마나 돌아가 있는지 (라디안, 확인용)
  get spinAmount(): number {
    return this.rotOffset.length();
  }

  get worldHome(): THREE.Vector3 {
    return this.home;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }
}
