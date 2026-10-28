import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { validateFeedback } from "../web/rakat/feedback_service.mjs";

async function harness({ native = false, saved = "[]" } = {}) {
  const elements = new Map();
  let stored = saved;
  let downloads = 0;
  let uploads = 0;
  const revoked = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "", textContent: "", disabled: false,
      style: {}, offsetHeight: 160,
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      click() { downloads++; },
      reportValidity: () => true,
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element, createElement: element, querySelector: element },
    navigator: { userAgent: native ? "Test SijdaAndroid/0.1" : "Test browser" },
    localStorage: {
      getItem: () => stored,
      setItem: (key, value) => { stored = value; },
    },
    FormData: class {
      get(key) {
        return {
          verdict: "incorrect", expectedRakat: "2", expectedSajdahs: "4",
          placement: "chair", distance: "1-2m", lighting: "normal",
          device: "Test phone", notes: "", consent: null,
        }[key];
      }
    },
    innerWidth: 360, innerHeight: 640,
    crypto: { randomUUID: () => "test-report" },
    Blob,
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL: url => revoked.push(url),
    },
    setTimeout: fn => fn(),
    console: { error() {} },
  });
  const camera = new vm.SyntheticModule(["feedbackSnapshot", "stopForFeedback"], function () {
    this.setExport("feedbackSnapshot", () => ({
      detectedRakat: 0, detectedSajdahs: 0, transitions: [],
    }));
    this.setExport("stopForFeedback", () => {});
  }, { context });
  const service = new vm.SyntheticModule(["validateFeedback", "uploadFeedback"], function () {
    this.setExport("validateFeedback", validateFeedback);
    this.setExport("uploadFeedback", async () => { uploads++; });
  }, { context });
  const source = await readFile(new URL("../web/rakat/feedback.mjs", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => specifier === "./camera.mjs" ? camera : service);
  await module.evaluate();
  return {
    element, revoked, downloads: () => downloads, uploads: () => uploads,
    setSaved: value => { stored = value; },
    export: () => element("export-feedback").listeners.click(),
    review: () => element("review-feedback").listeners.click(),
    submit: () => element("feedback-form").listeners.submit({ preventDefault() {} }),
  };
}

test("review shortcut opens the feedback form and offsets scrolling below sticky results", async () => {
  const app = await harness();
  app.review();
  assert.equal(app.element("feedback-section").open, true);
  assert.equal(app.element("feedback-section").style.scrollMarginTop, "172px");
});

test("native feedback exports selectable JSON without download or upload", async () => {
  const reports = [{ id: "local-report", notes: "Screen light off" }];
  const app = await harness({ native: true, saved: JSON.stringify(reports) });
  app.export();
  assert.equal(app.element("feedback-export").hidden, false);
  assert.deepEqual(JSON.parse(app.element("feedback-json").value), reports);
  assert.match(app.element("feedback-status").textContent, /1 saved reports ready.*Nothing uploaded/);
  assert.equal(app.downloads(), 0);
  assert.equal(app.uploads(), 0);
});

test("browser export downloads JSON and also offers selectable fallback", async () => {
  const app = await harness();
  app.export();
  assert.equal(app.downloads(), 1);
  assert.deepEqual(app.revoked, ["blob:test"]);
  assert.equal(app.element("feedback-export").hidden, false);
  assert.equal(app.element("feedback-json").value, "[]");
  assert.match(app.element("feedback-status").textContent, /Exported 0 reports/);
  assert.equal(app.uploads(), 0);
});

test("invalid saved feedback clears stale export and reports failure without overwriting storage", async () => {
  const app = await harness({ native: true });
  app.export();
  for (const invalid of ["{", "{}"]) {
    app.setSaved(invalid);
    app.export();
    assert.equal(app.element("feedback-export").hidden, true);
    assert.equal(app.element("feedback-json").value, "");
    assert.match(app.element("feedback-status").textContent, /Feedback export failed/);
  }
  assert.equal(app.downloads(), 0);
  assert.equal(app.uploads(), 0);
});

test("the 100-report local limit still permits full native export", async () => {
  const reports = Array.from({ length: 100 }, (_, id) => ({ id }));
  const app = await harness({ native: true, saved: JSON.stringify(reports) });
  await app.submit();
  assert.match(app.element("feedback-status").textContent, /Local feedback limit reached/);
  app.export();
  assert.deepEqual(JSON.parse(app.element("feedback-json").value), reports);
  assert.equal(app.uploads(), 0);
});
