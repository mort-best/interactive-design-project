import * as THREE from "three";
import { PHYSICS } from "./config";

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

    // 화면 밖으로 영구히 사라지지 않도록 최대 변위 제한
    const maxD = PHYSICS.maxDisplacement;
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

    // 메시에 반영
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

  get worldHome(): THREE.Vector3 {
    return this.home;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }
}
