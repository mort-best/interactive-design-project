// One Euro 필터: 느리게 움직일 때는 떨림을 강하게 줄이고,
// 빠르게 움직일 때는 필터를 약하게 해 반응이 늦어지지 않게 합니다.
// (Casiez et al., "1€ Filter", CHI 2012)

function alpha(cutoffHz: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dt);
}

export class OneEuro {
  private x: number | null = null;
  private dx = 0;

  constructor(
    // 멈춰 있을 때의 기본 차단 주파수(Hz). 낮을수록 떨림이 줄지만 느려짐
    private readonly minCutoff: number,
    // 속도에 따라 차단 주파수를 높이는 정도. 클수록 빠른 움직임에 민감
    private readonly beta: number,
    // 속도 추정용 차단 주파수(Hz)
    private readonly dCutoff = 1.0
  ) {}

  reset(value: number): void {
    this.x = value;
    this.dx = 0;
  }

  // dt: 이전 값 이후 경과 시간(초)
  filter(value: number, dt: number): number {
    if (this.x === null || dt <= 0) {
      this.reset(value);
      return value;
    }
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  // 필터링된 속도(단위/초)
  get velocity(): number {
    return this.dx;
  }
}
