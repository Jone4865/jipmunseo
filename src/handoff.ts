// 안내 페이지(/hwp)에서 고른 파일을 첫 화면의 도구로 넘기는 곳(QA 8바퀴).
// 예전에는 /hwp 의 'HWP 파일 열기'가 도구 화면으로 넘어가기만 해서 파일 고르기 창까지 한 번 더 눌러야 했어요.
// 페이지가 바뀌면 File 을 그대로 들고 갈 수 없어서, 넘어가는 동안만 이 브라우저의 IndexedDB 에 두고
// 도구 화면이 꺼내자마자 저장소째 지워요. 꺼내지 못하고 남은 것도 다음에 첫 화면을 열 때 지워요(처리방침 '넣은 파일').
export const HANDOFF_DB = "jms-handoff";
/** 넘기는 중이라는 표시(sessionStorage) — 첫 화면이 이 표시를 볼 때만 저장소를 열어요 */
export const HANDOFF_FLAG = "jms.handoff";
/** 이보다 오래된 것은 넘기지 않고 지워요(다른 탭·한참 뒤에 연 첫 화면에 문서가 갑자기 열리지 않게) */
export const HANDOFF_MAX_AGE = 2 * 60 * 1000;

/**
 * 한글 문서 한 개면 HWP 보기로, 그 밖(PDF·사진·여러 개)은 첫 화면에 떨어뜨린 것처럼 쓸 도구를 고르게 해요(app.ts offerTools).
 * 예전처럼 HWP 보기에 넣으면 PDF 에도 'HWP·HWPX 파일이 아니에요'만 나왔어요. 확장자가 바뀐 한글 문서는 첫 화면이 HWP 보기를 권하지 않으니, 그때는 HWP 보기에 직접 넣어 주세요(도구가 내용으로 가려요)
 */
export function handoffTarget(files: { name: string }[]): { tool: string; url: string } {
  return files.length === 1 && /\.hwpx?$/i.test(files[0].name) ? { tool: "hwp-view", url: "/#hwp-view" } : { tool: "", url: "/" };
}

/** 넘기지 못했을 때(저장소가 막힌 브라우저) 갈 주소 — 고른 파일이 말없이 사라지지 않게 도구 화면이 '다시 골라 주세요'를 알리도록
 *  주소에 표시(?handoff=0)를 달아요. 그런 브라우저는 sessionStorage 표시도 못 남겨서 주소로 알려요(버그 찾기 10차) */
export const HANDOFF_FAIL_PARAM = "handoff";
export function handoffFailUrl(url: string): string {
  const i = url.indexOf("#");
  const [path, hash] = i < 0 ? [url, ""] : [url.slice(0, i), url.slice(i)];
  return `${path}?${HANDOFF_FAIL_PARAM}=0${hash}`;
}

interface Saved { at: number; tool: string; files: File[] }

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(HANDOFF_DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("blocked"));
  });
}
function done(t: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
}
function dropDb(): Promise<void> {
  return new Promise((res) => {
    try {
      const r = indexedDB.deleteDatabase(HANDOFF_DB);
      r.onsuccess = r.onerror = r.onblocked = () => res();
    } catch { res(); }
  });
}

/** 파일을 넘길 준비 — 실패하면 false(그때는 도구 화면에서 다시 고르게 해요) */
export async function putHandoff(tool: string, files: File[]): Promise<boolean> {
  try {
    const db = await openDb();
    const t = db.transaction("files", "readwrite");
    t.objectStore("files").put({ at: Date.now(), tool, files } satisfies Saved, "pick");
    await done(t);
    db.close();
    try { sessionStorage.setItem(HANDOFF_FLAG, "1"); } catch {}
    return true;
  } catch {
    await dropDb();
    return false;
  }
}

/** 넘겨받은 파일을 꺼내고 저장소를 지워요. 없거나 오래됐으면 null */
export async function takeHandoff(now = Date.now()): Promise<{ tool: string; files: File[] } | null> {
  try { sessionStorage.removeItem(HANDOFF_FLAG); } catch {}
  let got: Saved | undefined;
  try {
    const db = await openDb();
    const t = db.transaction("files", "readonly");
    const req = t.objectStore("files").get("pick");
    await done(t);
    got = req.result as Saved | undefined;
    db.close();
  } catch {}
  await dropDb();
  if (!got || !Array.isArray(got.files) || !got.files.length) return null;
  if (!(now - got.at >= 0 && now - got.at < HANDOFF_MAX_AGE)) return null;
  return { tool: String(got.tool), files: got.files };
}

export const clearHandoff = dropDb;
