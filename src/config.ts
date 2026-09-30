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
  // 위치 복원 스프링: 작을수록 천천히 원위치로 돌아옴
  positionStiffness: 9,
  // 회전 복원 스프링
  rotationStiffness: 7,
  // 감쇠: 값이 작을수록 오버슈트가 크고 오래 흔들림.
  // 스프링 세기에 맞춰 '작은 오버슈트 한 번' 정도가 되도록 맞춘 값입니다.
  damping: 3.3,
  rotationDamping: 2.9,
  // 마우스 충돌 반경 (월드 단위) — 클수록 더 넓은 범위가 흩어짐
  influenceRadius: 3.2,
  // 밀어내는 기본 힘 (천천히 움직일 때의 부드러운 밀림)
  pushStrength: 20,
  // 마우스 속도에 곱해지는 힘 (빠르게 움직이면 더 강함)
  velocityStrength: 8,
  // 이 속도(월드/초) 이하는 '천천히'로 보고 속도 힘을 더하지 않음
  gentleSpeed: 3,
  // 회전 충격의 세기
  spinStrength: 12,
  // 입력이 멀어진 뒤 복귀까지의 지연(초)
  returnDelay: 0.35,
  // 밀리는 동안(지연 시간 안) 복원력을 얼마나 남길지. 작을수록 더 멀리 밀려남.
  holdStiffnessRatio: 0.85,
  // 원위치에서 벗어날 수 있는 최대 거리(화면 밖 이탈 방지)
  maxDisplacement: 2.8,
  // 한 프레임에서 계산할 최대 시간(초). 탭 전환 후 복귀 시 큰 점프만 막습니다.
  maxDelta: 0.1,
  // 계산 단위 시간(초). 프레임이 느려도 이 간격으로 나눠 계산해 움직임 속도가 같게 유지됩니다.
  stepSize: 1 / 120,
};

// 웹캠 손 추적 튜닝
export const HAND = {
  // 손바닥 중심 / 손가락 끝 충돌 영역 반경 (월드 단위, 마우스는 influenceRadius)
  palmRadius: 2.2,
  tipRadius: 1.2,

  // 떨림 제거(One Euro 필터): minCutoff를 낮추면 더 매끈하지만 느려지고,
  // beta를 높이면 빠르게 휘두를 때 더 즉각적으로 따라옵니다.
  minCutoff: 1.2,
  beta: 0.25,
  // 손 속도 스무딩(Hz). 높을수록 휘두름이 즉각 반영
  velocityCutoff: 8,
  // 한 번의 오검출로 과도하게 튕기지 않도록 손 속도 상한 (월드/초)
  maxSpeed: 80,
  // 한 프레임 사이에 이보다 멀리 뛰면 순간이동으로 보고 속도를 0에서 다시 시작
  teleportDistance: 4,

  // 손이 잠깐(이 시간 이하) 안 보여도 계속 있는 것으로 봄 (ms)
  lostGraceMs: 180,
  // 이보다 오래 끊겼다 돌아오면 새로 나타난 손으로 처리 (ms)
  reacquireGapMs: 350,
  // 손 입력을 켜고 끄는 데 걸리는 시간 (초) — 갑자기 튀지 않게
  fadeIn: 0.2,
  fadeOut: 0.25,
  // 검출 사이의 짧은 공백을 속도로 이어 그리는 최대 시간 (ms)
  extrapolateMs: 40,

  // 검출 빈도 (Hz). 검출이 무거운 기기에서는 자동으로 minDetectHz까지 낮춤
  maxDetectHz: 30,
  minDetectHz: 15,
};
