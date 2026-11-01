import assert from "node:assert/strict";
import { segmentLongform } from "./segmentation";
import { completeLongformSegment, getActiveLongform, loadLongformProgress, longformVersion, pickRandomNextLongform, restartLongform, saveLongformProgress, setActiveLongform, summarizeLongformProgress, toScriptureItem } from "./longform-library";
import { useTypingStore } from "../../stores/use-typing-store";
import { BUILTIN_LONGFORM } from "./content";

assert.equal(BUILTIN_LONGFORM.length, 14);
assert.equal(BUILTIN_LONGFORM.filter((text) => text.language === "kor").length, 9);
assert.equal(BUILTIN_LONGFORM.filter((text) => text.language === "eng").length, 5);
for (const title of ["애국가가 그리는 풍경", "훈민정음 서문을 읽는 밤", "헌법이 약속하는 일상", "난중일기, 기록하는 사람의 힘"]) {
  assert(BUILTIN_LONGFORM.some((text) => text.title === title), `${title} is included`);
}
for (const text of BUILTIN_LONGFORM) {
  const count = Array.from(text.body).length;
  assert(count >= 700 && count <= 3000, `${text.title}: ${count} characters`);
  console.log(`${text.language}: ${text.title} (${count} characters)`);
}

const values = new Map<string, string>();
let failWrites = false;
const browser = new EventTarget();
Object.assign(browser, { localStorage: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { if (failWrites) throw new Error("quota"); values.set(key, value); },
} });
Object.defineProperty(globalThis, "window", { value: browser, configurable: true });

const parts = segmentLongform("First sentence. Another sentence!\r\n\r\n다음 문단입니다. 끝입니다.", "eng");
assert.equal(parts.length, 4);
assert.deepEqual(parts.map((part) => part.paragraph), [0, 0, 1, 1]);
assert.equal(segmentLongform("\n \n", "kor").length, 0);
for (const text of ["😀".repeat(400), "word ".repeat(300), "가나다 ".repeat(150)]) {
  const segments = segmentLongform(text, "eng");
  assert(segments.every((part) => Array.from(part.text).length <= 180));
  assert.equal(segments.map((part) => part.text).join("").replace(/\s/gu, ""), text.replace(/\s/gu, ""));
  assert(segments.every((part) => !/[\uD800-\uDBFF]$/u.test(part.text)));
}
const segmenter = Intl.Segmenter;
Object.defineProperty(Intl, "Segmenter", { value: undefined, configurable: true });
assert.equal(segmentLongform("One. Two!\n세 번째입니다.", "kor").length, 3);
Object.defineProperty(Intl, "Segmenter", { value: segmenter, configurable: true });

const item = BUILTIN_LONGFORM.find((text) => text.language === "eng")!;
const itemSegments = segmentLongform(item.body, item.language);
assert.equal(toScriptureItem(item).kind, "long");
assert.deepEqual(toScriptureItem(item).media, { type: "none" });
assert.equal(toScriptureItem(item).body.split("\n").length, itemSegments.length);
assert.notEqual(longformVersion(item), longformVersion({ ...item, body: `${item.body} Updated.` }));
const progress = loadLongformProgress(item);
progress.line = 1;
progress.segments["0"] = { characters: 15, elapsedMs: 1000, accuracy: 90 };
saveLongformProgress(item, progress);
assert.equal(loadLongformProgress(item).line, 1);
assert.equal(loadLongformProgress({ ...item, body: `${item.body} Updated.` }).line, 0);
assert.deepEqual(summarizeLongformProgress(progress), { completedSegments: 1, characters: 15, elapsedMs: 1000, accuracy: 90 });

useTypingStore.getState().setMode("kor", "word");
useTypingStore.getState().setScripture(item.id, "song");
assert.equal(useTypingStore.getState().language, "eng");
assert.equal(useTypingStore.getState().scriptureKind, "long");
assert.equal(useTypingStore.getState().scriptureLine, 1);
assert.equal(useTypingStore.getState().mode, "word", "No new DB typing mode");
assert.equal(getActiveLongform()?.id, item.id);
useTypingStore.getState().setScriptureLine(2);
assert.equal(loadLongformProgress(item).line, 2);
const finished = loadLongformProgress(item);
finished.completed = true;
saveLongformProgress(item, finished);
useTypingStore.getState().setScripture(item.id);
assert.equal(useTypingStore.getState().scriptureCompleted, true);
useTypingStore.getState().setScriptureLine(0);
assert.equal(useTypingStore.getState().scriptureLine, 2, "Completed text cannot advance or rewind");
const revision = useTypingStore.getState().practiceRevision;
restartLongform(item);
useTypingStore.getState().setScripture(item.id, "long");
assert.equal(useTypingStore.getState().scriptureCompleted, false);
assert.equal(useTypingStore.getState().scriptureLine, 0);
assert(useTypingStore.getState().practiceRevision > revision);
const metric = { characters: 15, elapsedMs: 1000, accuracy: 100 };
assert.equal(completeLongformSegment(item, 0, metric)?.line, 1);
assert.equal(completeLongformSegment(item, 0, metric), null, "Duplicate segment submit is ignored");
for (let index = 1; index < itemSegments.length; index++) completeLongformSegment(item, index, metric);
assert.equal(loadLongformProgress(item).completed, true);
assert.equal(completeLongformSegment(item, itemSegments.length - 1, metric), null, "Final submit cannot repeat");
assert.equal(summarizeLongformProgress(loadLongformProgress(item)).completedSegments, itemSegments.length);
const nextEnglish = pickRandomNextLongform(item, () => 0);
assert.equal(nextEnglish.language, item.language, "Automatic next essay stays in the current language");
assert.notEqual(nextEnglish.id, item.id, "Automatic next essay does not immediately repeat the completed essay");
useTypingStore.getState().setMode("kor", "short");
assert.equal(getActiveLongform(), undefined);
assert.equal(useTypingStore.getState().scriptureId, null);

// Quota failures must override stale disk values for the current session.
failWrites = true;
const failed = loadLongformProgress(item);
failed.line = 2;
saveLongformProgress(item, failed);
assert.equal(loadLongformProgress(item).line, 2);
setActiveLongform(item.id);
assert.equal(getActiveLongform()?.id, item.id);
failWrites = false;
restartLongform(item);
assert.equal(loadLongformProgress(item).line, 0, "Successful writes clear stale memory overrides");
const progressKey = `typenews.longform.progress.v1:${item.id}:${longformVersion(item)}`;
values.set(progressKey, JSON.stringify({ version: longformVersion(item), line: 99999, completed: false, segments: { "0": { characters: -1, elapsedMs: 0, accuracy: 0 } } }));
assert.equal(loadLongformProgress(item).line, itemSegments.length - 1);
assert.deepEqual(loadLongformProgress(item).segments, {});
console.log("Longform segmentation, Unicode limits, storage failures, versioning, resume, completion and restart passed.");
