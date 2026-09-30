// 작품 전반의 튜닝 값과 제한된 색상 팔레트를 한 곳에 모아 둡니다.

// 제한된 색상: 아이보리, 먹색, 빨강, 파랑, 노랑
export const PALETTE = {
  ivory: 0xf2ede1,
  ink: 0x2b2b2b,
  red: 0xd6483b,
  blue: 0x2f5aa8,
  yellow: 0xe8b23a,
} as const;

export const BACKGROUND = 0xece7df; // 따뜻한 회백색

// 격자 구성
export const GRID = {
  cols: 6,
  rows: 4,
  spacing: 2.2, // 오브젝트 사이 여백 (넉넉하게)
};

// 물리/인터랙션 튜닝
export const PHYSICS = {
  // 위치 복원 스프링: 클수록 빠르게 원위치로 당겨짐
  positionStiffness: 42,
  // 회전 복원 스프링
  rotationStiffness: 30,
  // 감쇠(1에 가까울수록 오버슈트 큼, 값이 클수록 빨리 멈춤)
  damping: 6.2,
  rotationDamping: 5.0,
  // 마우스 충돌 반경 (월드 단위)
  influenceRadius: 2.6,
  // 밀어내는 힘의 세기
  pushStrength: 34,
  // 마우스 속도에 곱해지는 힘 (빠르게 움직이면 더 강함)
  velocityStrength: 3.4,
  // 회전 충격의 세기
  spinStrength: 9,
  // 입력이 멀어진 뒤 복귀까지의 지연(초)
  returnDelay: 0.12,
  // 원위치에서 벗어날 수 있는 최대 거리(화면 밖 이탈 방지)
  maxDisplacement: 3.2,
  // 시뮬레이션 안정화를 위한 프레임당 최대 dt(초)
  maxDelta: 1 / 30,
};
