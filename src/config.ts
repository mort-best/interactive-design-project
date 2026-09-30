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
// 격자 구성: 창 크기에 맞춰 화면을 가득 채우도록 행·열 수를 계산합니다.
export const GRID = {
  spacing: 1.25, // 오브젝트 중심 사이 거리 (오브젝트 크기 약 1 → 간격 약 0.25)
  // 한 칸의 화면 크기(px) = 창의 짧은 쪽 / shortSideCells, 단 minCellPx~maxCellPx 사이
  shortSideCells: 8,
  minCellPx: 44,
  maxCellPx: 76,
  // 아주 큰 화면에서도 부드럽게 돌도록 전체 개수 상한
  maxObjects: 420,
};

// 물리/인터랙션 튜닝
export const PHYSICS = {
  // 위치 복원 스프링: 작을수록 천천히 원위치로 돌아옴
  positionStiffness: 5,
  // 회전 복원 스프링
  rotationStiffness: 4,
  // 감쇠: 값이 작을수록 오버슈트가 크고 오래 흔들림.
  // 스프링 세기에 맞춰 '작은 오버슈트 한 번' 정도가 되도록 맞춘 값입니다.
  damping: 2.45,
  rotationDamping: 2.2,
  // 마우스 충돌 반경 (월드 단위) — 클수록 더 넓은 범위가 흩어짐
  influenceRadius: 3.4,
  // 밀어내는 기본 힘 (천천히 움직일 때의 부드러운 밀림)
  pushStrength: 15,
  // 마우스 속도에 곱해지는 힘 (빠르게 움직이면 더 강함)
  velocityStrength: 11,
  // 이 속도(월드/초) 이하는 '천천히'로 보고 속도 힘을 더하지 않음
  gentleSpeed: 3,
  // 회전 충격의 세기
  spinStrength: 26,
  // 입력이 멀어진 뒤 복귀까지의 지연(초)
  returnDelay: 0.5,
  // 밀리는 동안(지연 시간 안) 복원력을 얼마나 남길지. 작을수록 더 멀리 밀려남.
  holdStiffnessRatio: 0.85,
  // 원위치에서 벗어날 수 있는 최대 거리(화면 밖 이탈 방지)
  maxDisplacement: 3.2,
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
  minCutoff: 1.6,
  beta: 0.8,
  // 손 속도 스무딩(Hz). 높을수록 휘두름이 즉각 반영
  velocityCutoff: 20,
  // 한 번의 오검출로 과도하게 튕기지 않도록 손 속도 상한 (월드/초)
  maxSpeed: 80,
  // 한 프레임 사이에 이보다 멀리 뛰면 순간이동으로 보고 속도를 0에서 다시 시작
  teleportDistance: 4,

  // 손이 잠깐(이 시간 이하) 안 보여도 계속 있는 것으로 봄 (ms)
  lostGraceMs: 180,
  // 이보다 오래 끊겼다 돌아오면 새로 나타난 손으로 처리 (ms)
  reacquireGapMs: 350,
  // 손 입력을 켜고 끄는 데 걸리는 시간 (초) — 갑자기 튀지 않게
  fadeIn: 0.12,
  fadeOut: 0.25,
  // 카메라가 프레임을 찍은 시점부터 지금까지(검출 처리 시간 포함)를
  // 손 속도로 앞질러 예측하는 최대 시간 (ms). 검출 지연만큼 손이 뒤처져 보이지 않게 함
  extrapolateMs: 40,

  // 손이 있는 자리에는 오브젝트가 들어오지 못하게 함
  exclusion: true,
  // 손가락 굵기(반지름) = 손 크기(손목~중지 뿌리 길이) × 이 비율
  fingerWidthRatio: 0.14,
  // 오브젝트를 원으로 볼 때의 반지름 (오브젝트 크기 약 1)
  objectRadius: 0.5,
  // 밀어낼 방향을 구하는 거리 지도의 칸 크기 (월드 단위). 작을수록 손 모양이 정확함
  mapCell: 0.1,
  // 손 영역 밖으로 밀어내는 최대 속도 (월드/초). 순간이동처럼 보이지 않게 하는 상한
  exclusionSpeed: 60,

  // 검출 빈도 (Hz). 검출이 무거운 기기에서는 자동으로 minDetectHz까지 낮춤
  maxDetectHz: 30,
  minDetectHz: 15,
};
