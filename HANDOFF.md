# 인수인계 (HANDOFF)

작성: 2026-09-30, Kiro. 다음 작업자(Codex, Claude Code, Kiro 등)가 이 문서만 보고 이어서 작업할 수 있도록 정리했습니다.

## 1. 한눈에 보기

| 항목 | 값 |
|---|---|
| 저장소 | https://github.com/mort-best/interactive-design-project |
| **이어받기용 브랜치** | **`handoff/latest`** |
| 코드 기준 커밋 | `ddd6fee118384a07575a311397561cfe89e8a08e` (이 문서를 더한 커밋은 `git log -1 handoff/latest`로 확인) |
| main | `81f7118` (PR #1 + PR #3까지, 마우스 버전) |
| 작품 미리보기 | https://mort-best.github.io/interactive-design-project/preview/pr-4/ |
| 모델 미리보기 | https://mort-best.github.io/interactive-design-project/preview/pr-4/models.html |
| main 작품 | https://mort-best.github.io/interactive-design-project/ |

`handoff/latest`의 구성:
- PR #4(`webcam-hand-tracking` @ `cde6262`) 전체
- PR #2(`fix-blank-screen-message` @ `6f421ce`) 병합
- `pages-preview` 브랜치에만 있던 `.github/workflows/preview.yml` 복사본
- `.nvmrc`
- `tools/make_fake_webcam.py`

**main에는 아무것도 머지하지 않았고, 기존 브랜치는 하나도 삭제하지 않았습니다.**

## 2. 프로젝트 목적과 디자인 방향

브라우저에서 체험하는 3D 인터랙티브 작품입니다(Vite + TypeScript + Three.js, 서버·DB 없음, GitHub Pages 배포).

- **화면:** 화면을 가득 채운 촘촘한 격자에 작은 3D 오브젝트가 놓여 있습니다.
- **인터랙션:** 마우스나 웹캠 손으로 헤치면 오브젝트가 튕기고 회전하며 흩어졌다가, 천천히 원래 자리와 방향으로 탄성 있게 돌아옵니다.
- **현재 디자인 방향:**
  - 말랑한 젤리·반투명 소프트 레진 재질에, 넓고 부드러운 하이라이트와 속에 머금어진 색을 둡니다.
  - 가장자리는 밝게 빛나고, 오브젝트 바로 아래에 은은한 색 그림자가 있습니다.
  - 배경은 따뜻한 크림색(`#f6eddc`)이고, 윤곽은 선명하게 유지합니다. 화면 전체를 흐리게 하거나 bloom 효과는 쓰지 않습니다.
  - 할로윈 팔레트만 씁니다: 호박색, 아이보리(크림), 짙은 먹색, 노랑·탁한 노랑. 보라색, 네온, 피, 과한 공포 표현은 제외합니다.
  - 먹색은 투명하게 하지 않고, 부드러운 광택으로 형태가 보이게 합니다.
- **현재 단계:** 할로윈 모델 6종을 **별도 미리보기 화면에서만** 확인하고 있습니다. 작품 격자의 도형은 아직 구·둥근 큐브·링입니다.
  - 사용자는 모델별로 고치고 싶은 점이 있다고 했지만, 구체적인 내용은 아직 전달되지 않았습니다.

## 3. 브랜치와 PR 상태

| PR | 브랜치 @ 커밋 | 상태 | 내용 |
|---|---|---|---|
| [#1](https://github.com/mort-best/interactive-design-project/pull/1) | `add-interactive-grid` @ `3446c22` | **머지됨** | 첫 버전 (6×4, 마우스) |
| [#3](https://github.com/mort-best/interactive-design-project/pull/3) | `tune-motion-range` @ `18b79b2` | **머지됨** | 흩어짐 확대, 느린 복귀, 프레임 속도와 무관하게 같은 속도로 움직이도록 수정 |
| [#2](https://github.com/mort-best/interactive-design-project/pull/2) | `fix-blank-screen-message` @ `6f421ce` | 열림, 머지 안 됨 | 3D를 띄우지 못할 때 빈 화면 대신 안내 문구 표시 (`index.html`만 수정) |
| [#4](https://github.com/mort-best/interactive-design-project/pull/4) | `webcam-hand-tracking` @ `cde6262` | 열림, 머지 안 됨 | 손 추적, 촘촘한 전체 화면 격자, 손 영역 막기, 부딪힘, 젤리 재질, 할로윈 모델 미리보기 |
| — | `pages-preview` @ `5c85991` | PR 아님 | 미리보기 배포 전용 브랜치 (`preview.yml`, `PREVIEW_PRS: "4"`) |
| — | **`handoff/latest`** | PR 아님 | #4 + #2 + preview.yml 복사본 + 이 문서 |

**main과 `handoff/latest`의 차이:**
- **main:** 6×4 = 24개 격자, 무광 재질, 그림자, 마우스만 지원합니다.
- **`handoff/latest`:** 위 PR #4의 모든 기능에 PR #2의 안내 문구가 더해졌습니다.
- **커밋 목록 확인:** `git log --oneline origin/main..origin/handoff/latest`

## 4. 기능 현황

**완료 (코드 있음, 헤드리스 브라우저로 확인함)**
- **격자:** 화면을 채우는 촘촘한 격자입니다.
  - 창 크기에 따라 행·열 수가 바뀝니다. 954×495 → 15×8 = 120개, 2560×1440 → 405개(상한 420)입니다.
  - 창 크기를 바꾸면 격자를 다시 만듭니다.
- **흩어짐과 복귀:** 스프링과 감쇠로 복귀하고, 입력 속도에 따라 충격이 커집니다.
  - 짧게 멈췄다가 천천히 돌아오고, 작은 오버슈트가 있습니다.
  - 1/120초 단위로 나눠 계산해서, 프레임 속도가 달라도 움직임 속도가 같습니다.
- **웹캠 손 추적:** MediaPipe Hand Landmarker, 한 손만 지원합니다.
  - 손바닥 중심과 손가락 끝 5개 주변에 보이지 않는 충돌 영역이 있습니다.
  - 좌우 반전, 떨림 필터(One Euro), 지연 보정 예측이 들어 있습니다.
  - 손이 나타나거나 사라질 때 힘을 서서히 켜고 끕니다.
  - 인식은 Web Worker에서 돌고, 기기가 느리면 인식 빈도를 30Hz에서 15Hz로 낮춥니다.
- **손과 마우스 선택:** 손이 보이면 손만 쓰고, 안 보이면 마우스를 씁니다. 손이 사라진 뒤에는 마우스를 다시 움직여야 마우스가 켜집니다.
- **카메라 UI:** 카메라 시작·종료와 작은 프리뷰 버튼이 있습니다.
  - 권한을 거부하거나 카메라가 없어도 마우스로 체험할 수 있습니다.
  - 카메라를 끄면 영상 트랙을 정지합니다.
- **손 영역 막기:** 손 모양 영역 안으로 오브젝트가 들어오지 못합니다.
  - 손 모양은 손바닥 다각형과 손가락 캡슐로 만듭니다.
  - 거리 지도를 만들고, 속도를 바꾸는 힘으로 부드럽게 밀어냅니다.
- **부딪힘:** 손에 밀린 오브젝트가 다른 오브젝트에 닿으면, 부딪힌 쪽도 살짝 밀립니다.
  - 물리 엔진 없이 간단한 원형 충돌로 계산합니다.
  - 부딪힌 쪽은 8배 무겁게 계산하고, 연쇄 충돌은 없습니다.
- **재질과 조명:**
  - `MeshPhysicalMaterial`로 투과, 두께, 흡수 색, ior 1.36, clearcoat를 조정했고, 가장자리 빛을 셰이더로 더했습니다.
  - 크림색 스튜디오 환경 반사를 쓰고, 직사광은 약하게 했습니다.
  - 색 접촉 그림자는 한 번의 그리기로 모두 처리하고, 오브젝트 위치를 따라갑니다.
- **품질 자동 전환:** 처음 몇 초 동안 프레임 간격의 중간값이 25ms를 넘으면 가벼운 재질로 바꿉니다. `?quality=high|light`로 고정할 수 있습니다.
- **배경 누렇게 보이던 문제:** 원인은 색 그림자 층이었습니다(bloom은 원래 없음). 그림자를 작게 줄여서, 오브젝트 사이 빈 곳의 배경이 원래 크림색과 같아진 것을 측정으로 확인했습니다.
- **할로윈 모델 6종:** 호박, 유령, 포장 사탕, 박쥐, 마녀 모자, 해골입니다.
  - 모두 코드로 만든 실제 3D 형태이고, 비교 화면 `models.html`에서 볼 수 있습니다.
  - 선택하면 확대되고, 드래그로 회전하며, "기본 방향" 버튼과 "전체 보기" 버튼이 있습니다.
- **빈 화면 안내 (PR #2):** WebGL이 꺼져 있거나 스크립트를 불러오지 못하면 빈 화면 대신 안내 문구를 보여줍니다.

**미완성 / 다음 작업**
- **모델별 수정:** 사용자가 고칠 내용을 알려주기로 했고, 아직 받지 못했습니다.
- **격자 교체:** 작품 격자의 구·큐브·링을 할로윈 모델로 바꾸는 작업은 하지 않았습니다(아래 10절).
- **성능:** 모델을 격자에 넣었을 때의 성능은 확인하지 않았습니다. 모델당 삼각형이 8천~1만 3천 개라, 420개면 약 450만 개가 됩니다.
- **머지 결정:** PR #2와 PR #4(또는 `handoff/latest`)의 머지는 사용자가 결정해야 합니다.
- **확인용 코드:** `window.__grid`, `window.__models` 같은 확인용 훅이 실제 배포에도 남아 있습니다(동작에는 영향 없음). 최종 공개 전에 지우거나 개발 모드에서만 켜지게 할지 정해야 합니다.

## 5. 설치·실행·빌드

**Node 20을 권장합니다.** GitHub Actions가 Node 20을 쓰고, `.nvmrc`도 20입니다. Vite 5는 Node 18 이상이 필요합니다.

```bash
git clone https://github.com/mort-best/interactive-design-project.git
cd interactive-design-project
git checkout handoff/latest
nvm use            # .nvmrc = 20 (nvm이 있을 때)
npm ci             # package-lock.json 그대로 설치
npm run dev        # http://localhost:5173/  (모델 미리보기: http://localhost:5173/models.html)
npm run build      # tsc 타입 검사 + vite build → dist/ (index.html, models.html)
npm run preview    # 빌드 결과를 로컬에서 확인
```

- **WASM 복사:** `npm run dev`와 `npm run build`를 하면 먼저 `scripts/copy-mediapipe-wasm.mjs`가 실행됩니다(`predev`, `prebuild`). 이 스크립트가 `node_modules/@mediapipe/tasks-vision/wasm`의 WASM 4개를 `public/mediapipe/wasm/`으로 복사합니다. 이 폴더는 `.gitignore`에 들어 있습니다.
- **카메라:** 카메라는 `https` 또는 `localhost`에서만 켜집니다.
- **알려진 취약점:** `npm audit`에 개발 도구인 vite(high)와 esbuild(moderate) 알림이 있습니다. 아직 올리지 않았습니다.

## 6. 에셋과 외부 의존성

| 대상 | 위치 | 비고 |
|---|---|---|
| 손 인식 모델 | `public/models/hand_landmarker.task` (7.8MB, **저장소에 커밋됨**) | 원본: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` (sha256 앞자리 `fbc2a30080c3c557`) |
| MediaPipe WASM | `node_modules/@mediapipe/tasks-vision/wasm` → 빌드 때 `public/mediapipe/wasm/`으로 복사 | 패키지 버전 `1.0.1`로 고정. CDN을 쓰지 않음 |
| MediaPipe JS | `@mediapipe/tasks-vision` (npm) | 카메라를 켤 때만 Worker에서 불러옴 |
| 폰트 | 없음 | 시스템 글꼴 사용 |
| 텍스처·이미지 | 없음 | 그림자 그라데이션과 환경 반사는 실행 중에 코드로 만듦 |
| 3D 모델 파일 | 없음 | 할로윈 모델은 전부 `src/models/halloween.ts`에서 코드로 만듦 (glTF 등 사용 안 함) |

- **실행 중 외부 요청:** 없습니다. 배포된 페이지는 같은 사이트의 파일만 불러옵니다.
- **MediaPipe 사용 통계:** MediaPipe 자체 README는 성능·사용량 통계를 Google에 보낼 수 있다고 안내합니다(영상은 보내지 않음). 앱 코드로 끌 수 있는 부분이 아닙니다.
- **개인정보:** 영상은 브라우저 안에서만 처리하고 전송·저장하지 않습니다.

## 7. 주요 파일과 설정 위치

```
index.html                 작품 페이지 (+ PR #2 빈 화면 안내 스크립트)
models.html                할로윈 모델 미리보기 페이지
vite.config.ts             base './' (Pages 하위 경로 대응), 두 페이지 빌드
src/config.ts              ★ 모든 튜닝 값: PALETTE, BACKGROUND, GRID, PHYSICS, COLLIDE, HAND
src/main.ts                작품: 렌더러, 카메라(직교, 위에서 약 15° 내려다봄), 격자 생성, 입력 선택, 루프, 품질 자동 전환, window.__grid
src/gridObject.ts          오브젝트 하나의 스프링·감쇠 복귀, 충격, 손 밀어내기(pressOut), 부딪힘(nudge)
src/interaction.ts         충돌 영역(마우스·손) → 힘 적용 (마우스와 손이 같은 공식)
src/collisions.ts          손에 밀린 오브젝트와 다른 오브젝트의 부딪힘 (칸 나누기, 원형 충돌)
src/pointer.ts             마우스 → 월드 좌표·속도
src/shapes.ts              격자용 구·둥근 큐브·링 형태, 칸마다 형태·색 배치(이웃과 겹치지 않게)
src/look.ts                ★ 재질 SPECS(색마다 투과·거칠기·clearcoat·가장자리 빛·그림자 색), getMaterial, setupStudio(조명·톤매핑·환경 반사), GlowLayer·CONTACT(접촉 그림자 크기·위치)
src/hand/handTracker.ts    카메라, Worker 관리, 인식 빈도 조절, 상태
src/hand/handWorker.ts     MediaPipe 인식 (GPU, 안 되면 CPU)
src/hand/handInput.ts      랜드마크 → 월드 좌표, 떨림 필터, 예측, 손 영역 강도·스무딩
src/hand/handShape.ts      손 모양 거리 지도, 밀어내기
src/hand/oneEuro.ts        One Euro 필터
src/hand/ui.ts             카메라 버튼·프리뷰·상태 문구
src/models/halloween.ts    ★ 할로윈 모델 6종 형태, 기본 방향(DEFAULT_ROTATION), 크기 맞춤, createModel(kind, quality)
src/models/preview.ts      모델 비교 화면 (배치, 확대, 드래그 회전, 기본 방향, window.__models)
scripts/copy-mediapipe-wasm.mjs  WASM 복사
tools/make_fake_webcam.py  웹캠 없이 손 추적을 시험하는 가짜 카메라 영상 생성
.github/workflows/deploy.yml   main 푸시 → Pages 배포
.github/workflows/preview.yml  (원본은 pages-preview 브랜치) PR 미리보기 배포
```

**설정을 바꿀 때 보는 곳**
- **물리 (흩어짐·복귀):** `config.ts`의 `PHYSICS`
  - 스프링 세기: `positionStiffness` 5, `rotationStiffness` 4
  - 감쇠: `damping` 2.45
  - 복귀 전 지연: `returnDelay` 0.5
  - 밀어내는 힘: `pushStrength` 15, `velocityStrength` 11
  - 회전: `spinStrength` 26
  - 최대 이동 거리: `maxDisplacement` 3.2
  - 계산 단위 시간: `stepSize` 1/120
- **부딪힘:** `config.ts`의 `COLLIDE`
  - 부딪힌 쪽 무게: `hitMass` 8
  - 떨어지는 속도: `push` 3
  - 풀어 주는 빠르기: `response` 15
- **손:** `config.ts`의 `HAND`
  - 충돌 영역 반지름: `palmRadius`, `tipRadius`
  - 떨림 필터: `minCutoff`, `beta`
  - 손가락 굵기: `fingerWidthRatio` 0.14
  - 손 영역 스무딩: `shapeSmoothMs` 70
  - 손 영역이 커지는 시간: `shapeFadeIn` 0.5
  - 밀어내는 방식: `pressBand`, `pressRate`, `maxPressSpeed` 3, `pressResponse`
- **격자 밀도:** `config.ts`의 `GRID`
  - 간격: `spacing` 1.25
  - 한 칸 크기: `shortSideCells` 8, `minCellPx`, `maxCellPx`
  - 최대 개수: `maxObjects` 420
- **재질:** `look.ts`의 `SPECS`
  - 색마다 `transmission`, `thickness`, `attenuationDistance`, `roughness`, `clearcoat`, 가장자리 빛(`rim`, `rimStrength`), 그림자 색(`glow`, `glowOpacity`)을 정합니다.
  - 가벼운 버전의 차이는 `getMaterial`에 있습니다: 투과 대신 emissive, clearcoat 0.
- **조명:** `look.ts`의 `setupStudio`(반구광 0.55, 약한 직사광 0.55, NeutralToneMapping)와 `createStudioEnvironment`(소프트박스 배치)
- **접촉 그림자:** `look.ts`의 `CONTACT` = `{ width: 1.1, height: 0.5, down: 0.48, back: 0.35 }`
- **품질 전환 기준:** `main.ts`의 `checkQuality`(`perf.medianMs > 25`)

**확인·조정용 주소 옵션:**
- `?quality=high` 또는 `?quality=light`: 재질 품질 고정
- `?delegate=cpu`: 손 인식을 CPU로 강제

**확인용 훅:**
- `window.__grid`: `displacements`, `spins`, `layout`, `hand`, `handOverlap`, `quality`, `setGlow`, `gapPoints`, `setCollisions`, `setHandExclusion`
- `window.__models`: `stats`, `bounds`, `focus`, `rotate`, `reset`

## 8. 확인된 문제와 아직 직접 검증하지 못한 사항

**여기 적은 것은 완료로 보면 안 됩니다.**
- **실제 웹캠 미검증:** 실제 웹캠과 실제 카메라 권한 창으로는 확인하지 못했습니다.
  - 헤드리스 Chrome에 가짜 카메라 영상(`tools/make_fake_webcam.py`)을 넣어 확인했습니다.
  - 확인한 항목: 권한 요청, 추적, 거울 반전, 손 영역 막기, 부딪힘, 카메라 종료 시 트랙 정지(`live` → `ended`), 권한 거부 시 마우스로 전환.
- **실제 GPU 성능 미검증:** 실제 GPU(Mac 등)에서의 프레임 속도는 측정하지 못했습니다.
  - 테스트 환경은 그래픽 가속이 없는 소프트웨어 렌더링이었습니다. 이전 무광 재질이 15.5fps, 새 가벼운 재질이 4.3fps, 반투명 재질이 1.8fps였습니다.
  - 그래서 실제 기기에서 반투명(high) 재질이 유지되는지는 모릅니다.
- **GPU 손 인식 속도 미검증:** 테스트 환경의 GPU 경로가 매우 느려서 기능 확인은 CPU(`?delegate=cpu`)로 했습니다.
- **Safari·모바일 미검증:** Safari, iOS, 모바일 브라우저는 확인하지 않았습니다.
- **모델 디자인 감수 전:** 사용자가 모델별 수정을 예고했습니다. 스크린샷으로 확인한 알려진 점:
  - 해골의 파인 눈구멍이 밝은 조명에서 옅어 보입니다.
  - 사탕 포장 끝의 주름이 꽃잎처럼 보일 수 있습니다.
- **격자에 모델 미적용:** 모델을 격자에 넣었을 때의 성능과 손 영역 반지름(`HAND.objectRadius`, `COLLIDE.radius` = 0.5)의 적합성은 확인하지 않았습니다.
- **먹색 설정 변경:** 먹색 재질의 가장자리 빛과 반사를 조금 올렸고, 이 변경은 격자의 먹색 도형에도 적용됐습니다.
- **떨림 증가:** 부딪힘 기능을 켜면 손을 멈췄을 때 손 옆 오브젝트의 떨림이 조금 늘었습니다(가짜 영상 기준 0.073 → 0.107 / 0.1초).
- **PR #2가 미리보기에 없음:** 미리보기 배포는 PR #4를 빌드하므로, PR #2의 빈 화면 안내 문구는 미리보기에 없습니다. `handoff/latest`에만 들어 있습니다.
- **개발 도구 알림:** 개발 도구 보안 알림(`npm audit`: vite, esbuild)이 남아 있습니다.

## 9. 미리보기 배포 방식 (중요)

GitHub Pages는 **사이트를 하나만** 게시합니다. 그래서 두 워크플로가 번갈아 사이트 전체를 교체합니다.

- **`deploy.yml`:** `main`에 푸시하면 실행되고, main 빌드만 사이트 루트에 올립니다.
- **`preview.yml`:** 원본은 `pages-preview` 브랜치에 있고, 그 브랜치에 푸시하거나 수동으로 실행하면 돌아갑니다.
  - main을 사이트 루트에 다시 빌드합니다.
  - `PREVIEW_PRS`에 적힌 PR(현재 `"4"`)의 `pull/<번호>/head`를 빌드해 `/preview/pr-<번호>/`에 올립니다.
  - 미리보기 페이지의 탭 제목에는 `[PR #N 미리보기]`가 붙습니다.
- **배포 허용 규칙:** Settings → Environments → `github-pages`에서 `main`과 `pages-preview` 두 브랜치만 배포할 수 있게 설정되어 있습니다.
  - 다른 브랜치에서 배포하면 거부됩니다.

**다시 배포하는 방법 (PR #4를 수정한 뒤)**
```bash
gh workflow run preview.yml --ref pages-preview
# 또는 REST:
gh api -X POST repos/mort-best/interactive-design-project/actions/workflows/preview.yml/dispatches -f ref=pages-preview
```
- **다른 PR을 보려면:** `pages-preview` 브랜치의 `preview.yml`에서 `PREVIEW_PRS`를 바꿔 푸시합니다(예: `"4 5"`).
- **`handoff/latest`를 보려면:** 이 브랜치로 PR을 열고, 그 번호를 `PREVIEW_PRS`에 넣습니다.
  - `handoff/latest`의 `preview.yml`은 참고용 복사본입니다. `pages-preview`에서만 실행됩니다.

**미리보기 경로가 사라지는 조건과 주의사항**
- **main에 푸시하면 사라집니다:** main에 푸시(머지 포함)하면 `deploy.yml`이 main만 다시 올려서 `/preview/...`가 **사라집니다**.
  - 다시 만들려면 위 명령으로 `preview.yml`을 다시 실행하세요.
- **미리보기에 반영되지 않는 경우:** PR 브랜치에 새 커밋을 올려도 미리보기는 자동으로 바뀌지 않습니다. 워크플로를 다시 실행해야 합니다.
- **main 작품도 바뀝니다:** 미리보기 배포는 main 작품도 그 시점의 main 코드로 다시 빌드합니다. main에 반영되지 않은 변경은 루트에 나타나지 않습니다.
- **동시에 실행하지 마세요:** 두 워크플로는 같은 `pages` 그룹을 씁니다. 동시에 돌리면 나중에 끝난 쪽이 사이트를 덮어씁니다.
- **첫 방문 시:** 새로 배포한 뒤에는 이전 파일이 보일 수 있습니다. 강력 새로고침(Cmd/Ctrl + Shift + R)을 해 주세요.

## 10. 다음 작업 권장 단계

1. **모델 수정 받기:** 사용자에게 모델별 수정 사항을 받아 `src/models/halloween.ts`에서 고칩니다.
   - 부품 모양은 `pumpkinParts()`~`skullParts()`, 기본 방향은 `DEFAULT_ROTATION`, 크기 맞춤 규칙은 `build()`에 있습니다.
   - 확인은 `npm run dev` → `/models.html`에서 합니다.
2. **미리보기로 사용자 확인:** 수정을 PR #4(또는 새 PR)에 올리고 `preview.yml`을 다시 실행해, 사용자가 미리보기 URL로 확인하게 합니다.
3. **격자에 연결할 준비:** 확인이 끝나면 격자에 모델을 연결합니다.
   - `GridObject`는 지금 `THREE.Mesh`를 받습니다. `THREE.Object3D`(Group)를 받도록 바꿉니다. 회전과 위치만 쓰므로 변경은 작습니다.
   - `main.ts`의 `buildGrid()`에서 `getGeometry(style.kind)` 대신 `createModel(kind, quality)`를 씁니다.
   - `setQuality`는 `setModelQuality`로 바꿉니다.
   - 그림자 색은 `MODEL_MAIN_COLOR`로 정합니다.
   - `shapes.ts`의 `styleForCell`을 6종용으로 확장합니다.
4. **성능 확인:** 120~420개에서 성능을 확인합니다.
   - 무거우면 격자용으로 면 수가 적은 버전을 만들거나(세그먼트 줄이기), 종류·재질별 `InstancedMesh`를 쓰세요.
   - 품질 자동 전환 기준(25ms)도 함께 다시 봅니다.
5. **실제 기기 확인:** 실제 Mac과 웹캠으로 손 추적 반응·떨림·막기·부딪힘의 느낌과 fps를 확인합니다(8절의 미검증 항목).
6. **머지 순서 합의:** 사용자와 머지 순서를 합의합니다. 권장 순서는 PR #2 → PR #4이고, `handoff/latest`로 대신해도 됩니다.
   - main에 머지하면 미리보기 경로가 사라집니다(9절).
7. **공개 전 정리:** 공개 전에 `window.__grid`, `window.__models` 확인용 훅을 정리하고, `npm audit`을 해결합니다.
