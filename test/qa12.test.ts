// QA 12바퀴(2026-10-26): 자주 쓰는 사람의 반복 — HWP 형식 기억, 만들기 단추를 화면 아래에, 결과의 내려받기까지 보이게
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { initialFormat, mergeGoLabel, mergeBadNote } from "../src/lib.js";
import { resultScroll } from "../src/ui.js";
import { PREF } from "../src/prefs.js";

const read = (f: string) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const ORDER = ["pdf", "docx", "png", "txt"] as const;
type F = (typeof ORDER)[number];
const all = () => true;

describe("HWP 내보내기 형식 기억", () => {
  it("지난번 형식이 되면 그 형식으로 열어요", () => {
    expect(initialFormat<F>("docx", all, ORDER)).toBe("docx");
    expect(initialFormat<F>("txt", all, ORDER)).toBe("txt");
  });
  it("기억이 없거나 이상한 값이면 되는 것 중 첫 번째", () => {
    expect(initialFormat<F>(null, all, ORDER)).toBe("pdf");
    expect(initialFormat<F>("hwp", all, ORDER)).toBe("pdf");
    expect(initialFormat<F>("", all, ORDER)).toBe("pdf");
  });
  it("배포용 문서처럼 그 형식이 막히면 되는 것 중 첫 번째로 돌아가요", () => {
    const noDocx = (f: F) => f !== "docx";
    expect(initialFormat<F>("docx", noDocx, ORDER)).toBe("pdf");
    const onlyPng = (f: F) => f === "png"; // 인쇄 막힌 배포용: 쪽 그림만
    expect(initialFormat<F>("docx", onlyPng, ORDER)).toBe("png");
  });
  it("고를 때 기억하고, 문서를 열 때 기억한 값으로 골라요(막힌 문서에서 돌아간 형식은 기억을 덮지 않아요)", () => {
    const s = read("src/tools-hwp.ts");
    expect(PREF.hwpFmt).toBe("jms.hwp.fmt");
    const choose = s.slice(s.indexOf("function choose(f: ExportFormat)"), s.indexOf("/** 고른 쪽(0부터)"));
    expect(choose).toMatch(/writePref\(PREF\.hwpFmt, f\)/);
    expect(s).toMatch(/initialFormat<ExportFormat>\(readPref\(PREF\.hwpFmt\), \(f\) => d\.rules\[f\]\.ok, EXPORT_FORMATS\)/);
    const pick = s.slice(s.indexOf("function pickInitialFormat"), s.indexOf("function toggleExport"));
    expect(pick).not.toMatch(/writePref/);
  });
  it("처리방침·README 에 적었어요", () => {
    expect(read("public/privacy.html")).toMatch(/HWP 보기의 <b>화질<\/b>·<b>굵은 글꼴 켜기<\/b>·<b>마지막에 고른 저장 형식<\/b>/);
    expect(read("README.md")).toMatch(/jms\.hwp\.fmt/);
  });
});

describe("만들기 단추를 화면 아래에", () => {
  it("HWP 내보내기 칸의 만들기 단추는 칸 안에서 붙어요", () => {
    const s = read("src/tools-hwp.ts");
    expect(s).toMatch(/fmtGroup, optsBox, stickyActions\(makeBtn\)\)/);
    // 설정 칸 안에 붙지 않는 줄로 두 번 넣지 않아요
    expect(s).not.toMatch(/h\("div", \{ class: "actions" \}, makeBtn\)/);
  });
  it("신분증 가리기 '사본 만들기'는 워터마크 칸부터만 붙어요(칠하는 그림 칸 밖)", () => {
    const s = read("src/tools-mask.ts");
    const fin = s.slice(s.indexOf('h("div", { class: "mask-finish" }'));
    expect(fin).toMatch(/"2\. 워터마크"/);
    expect(fin).toMatch(/stickyActions\(go2\)/);
    expect(fin).not.toMatch(/stage,/);
    expect(s).not.toMatch(/h\("div", \{ class: "actions" \}, go2\)/);
  });
  it("키보드 초점 가림은 보이는 붙는 줄마다 재요(HWP 보기는 둘)", () => {
    const s = read("src/ui.ts");
    expect(s).toMatch(/\.filter\(\(b\) => !b\.closest\("\[hidden\]"\)\)/);
    expect(s).toMatch(/Math\.max\(0, \.\.\.bars\.map/);
  });
});

describe("결과의 내려받기까지 보이게", () => {
  it("단추가 화면 아래에 반쯤 걸치면 단추 아래까지 올려요", () => {
    // 390×844: 결과 제목 740, 내려받기 아래 860 → 32px 올려서 단추가 다 보여요
    expect(resultScroll(740, 860, 844)).toBe(32);
  });
  it("이미 다 보이면 움직이지 않아요", () => {
    expect(resultScroll(300, 500, 844)).toBe(0);
    expect(resultScroll(300, 828, 844)).toBe(0);
  });
  it("결과 제목은 화면 위로 넘기지 않아요", () => {
    expect(resultScroll(100, 2000, 844)).toBe(84);
  });
  it("결과가 화면 위에 있으면 움직이지 않아요", () => {
    expect(resultScroll(-200, 900, 844)).toBe(0);
  });
  it("단추가 없으면 예전처럼 제목이 화면 안에 들어오게만", () => {
    expect(resultScroll(900, null, 844)).toBe(104);
    expect(resultScroll(500, null, 844)).toBe(0);
  });
  it("결과가 생기면 revealResult 로 보여요", () => {
    expect(read("src/app.ts")).toMatch(/revealResult\(res as HTMLElement\);/);
  });
});

describe("합치기에 못 읽은 PDF 가 섞였을 때", () => {
  it("열린 PDF 가 2개 미만이면 무엇이 모자란지 말해요(목록 2개인데 '2개 이상 넣어 주세요'가 아니게)", () => {
    expect(mergeGoLabel(1, 1, 3)).toBe("열리는 PDF를 2개 이상 넣어 주세요");
    expect(mergeGoLabel(0, 2, 0)).toBe("열리는 PDF를 2개 이상 넣어 주세요");
    expect(mergeGoLabel(1, 0, 3)).toBe("PDF를 2개 이상 넣어 주세요");
    expect(mergeGoLabel(3, 1, 15)).toBe("3개 합치기 (15쪽)");
  });
  it("목록 아래에 빼고 합친다고 알려요", () => {
    expect(mergeBadNote(1, 3)).toBe("못 읽은 PDF 1개는 빼고 합쳐요.");
    expect(mergeBadNote(1, 1)).toBe("못 읽은 PDF 1개는 합칠 수 없어요.");
  });
  it("결과 줄에도 뺀 개수를 적어요", () => {
    const s = read("src/tools-pdf.ts");
    expect(s).toMatch(/go\.textContent = mergeGoLabel\(good\.length, bad, sumPages\(good\)\)/);
    expect(s).toMatch(/개 파일 합침\$\{bad \? ` · 못 읽은 \$\{bad\}개 제외` : ""\}/);
    expect(s).toMatch(/listEl, badNote\)/);
  });
});

describe("캐시 헤더(최적화)", () => {
  const headers = read("public/_headers");
  it("이름에 해시가 붙은 화면 JS·CSS 는 1년 캐시", () => {
    expect(headers).toMatch(/\n\/js\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
    expect(headers).toMatch(/\n\/css\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  });
  it("아이콘은 이름에 해시가 없어서 하루만(immutable 아님)", () => {
    expect(headers).toMatch(/\n\/assets\/\*\n {2}Cache-Control: public, max-age=86400\n/);
  });
  it("CSS 는 빌드 때 이름에 해시가 붙어요(1년 캐시의 전제)", () => {
    expect(read("config/sw-plugin.ts")).toMatch(/style\.\$\{createHash\("sha256"\)/);
  });
});
