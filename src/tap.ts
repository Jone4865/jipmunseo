// 손가락·마우스 누름 거르기 — 화면이 바뀐 바로 뒤, 같은 자리의 두 번째 누름이 바뀐 화면의 다른 단추에 닿지 않게 해요(QA 4바퀴, 2026-10-20).
// 예전에는 목록의 '빼기'를 두 번 톡톡 누르면 그 자리로 올라온 다음 파일까지 빠지고, '모두 지우기'·'다른 PDF'를 두 번 누르면 다시 커진
// 파일 넣는 곳에 닿아 파일 고르기 창이 열리고, '다른 형식으로 저장'을 두 번 누르면 밑에서 올라온 '텍스트' 카드가 골라졌어요.
// 자판(Enter·Space)으로 누른 것과 스크립트가 만든 누름은 그대로 둬요. 갓생 js/tap.ts 와 같은 방식이에요.

/** 누름 이벤트에서 보는 것만 — 사람이 누른 것(isTrusted)인지, 손가락·마우스(detail 1 이상)인지 자판(detail 0)인지 */
export interface TapLike { isTrusted: boolean; detail: number }

export interface TapGuard {
  /** 지금부터 ms 동안 손가락·마우스 누름을 받지 않아요(이미 더 길게 잡혀 있으면 그대로) */
  hold(ms?: number): void;
  /** 받지 않는 동안인지 */
  active(): boolean;
  /** 이 누름을 거를지 */
  blocks(e: TapLike): boolean;
}

/**
 * 거르는 시간(ms) — 두 번 톡톡의 두 번째 누름은 0.4초 간격도 0.8초 간격도 걸러요(0.6초로 해 보니 0.8초 간격의 두 번째 누름이
 * 다음 파일을 빼고 파일 고르기 창을 열었어요). 바뀐 자리를 보고 누르는 다음 동작은 거의 늦지 않아요
 */
export const TAP_HOLD_MS = 900;

export function makeTapGuard(now: () => number = Date.now): TapGuard {
  let until = 0;
  return {
    hold(ms = TAP_HOLD_MS) { until = Math.max(until, now() + ms); },
    active() { return now() < until; },
    blocks(e) { return e.isTrusted && e.detail !== 0 && now() < until; },
  };
}

/** 이 페이지의 거르개 하나 */
export const taps = makeTapGuard();
/** 화면이 바뀌는 동작 뒤에 불러요 */
export const holdTaps = (ms?: number): void => taps.hold(ms);

/** 문서에 한 번 걸어요(app.ts). 누르는 순간(pointerdown)도 막아 포커스가 밑의 칸으로 옮겨 가거나 칠하기가 시작되지 않게 */
export function installTapGuard(doc: Document): void {
  doc.addEventListener("click", (e) => {
    if (!taps.blocks(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  doc.addEventListener("pointerdown", (e) => {
    if (!e.isTrusted || !taps.active()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}
