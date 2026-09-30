import * as THREE from "three";

// 마우스를 추적하고, z=0 평면 위의 월드 좌표와 속도를 계산합니다.
export class Pointer {
  // z=0 평면상의 현재 월드 좌표
  readonly world = new THREE.Vector3();
  // 월드 좌표계에서의 속도 (단위: 월드/초)
  readonly velocity = new THREE.Vector3();
  // 포인터가 화면 위에 있는지
  active = false;

  private readonly ndc = new THREE.Vector2();
  private hasNdc = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly prevWorld = new THREE.Vector3();
  private hasPrev = false;

  constructor(private readonly camera: THREE.Camera, dom: HTMLElement) {
    const onMove = (e: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.hasNdc = true;
      this.active = true;
    };
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", () => {
      this.active = false;
      this.hasPrev = false;
      this.velocity.set(0, 0, 0);
    });
  }

  // 매 프레임: 평면 교차점을 갱신하고 속도를 계산
  update(dt: number): void {
    if (!this.hasNdc || !this.active) {
      this.velocity.multiplyScalar(0.8); // 서서히 감쇠
      this.hasPrev = false;
      return;
    }

    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.plane, hit);
    if (!ok) return;

    this.world.copy(hit);

    if (this.hasPrev && dt > 0) {
      // 프레임레이트 독립: 월드 이동량 / dt = 초당 속도
      this.velocity.subVectors(this.world, this.prevWorld).multiplyScalar(1 / dt);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this.prevWorld.copy(this.world);
    this.hasPrev = true;
  }
}
