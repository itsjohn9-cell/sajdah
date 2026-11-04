import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { validateFeedback } from "../web/rakat/feedback_service.mjs";

async function harness({ native = false, saved = "[]", consent = false } = {}) {
  const elements = new Map();
  let stored = saved;
  let downloads = 0;
  let uploads = 0;
  let uploaded = null;
  const revoked = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "", textContent: "", disabled: false,
      style: {}, offsetHeight: 160,
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      scrollIntoView() { this.scrolled = true; },
      click() { downloads++; },
      reportValidity: () => true,
    });
    return elements.get(id);
  }
  const inputs = Object.fromEntries(
    ["device", "expectedRakat", "expectedSajdahs"].map(name => [name, element(`input-${name}`)]),
  );
  element("input-expectedRakat").value = "2";
  element("input-expectedSajdahs").value = "4";
  element("feedback-form").querySelector = selector => {
    const name = /name="([^"]+)"/.exec(selector)?.[1];
    return inputs[name] || element(`input-${name}`);
  };
  const device = {
    manufacturer: "Samsung", model: "SM-S928N", osVersion: "16",
    appVersion: "0.1.19+20", browserVersion: "Chrome 156",
    webViewVersion: "156.0.8078.47", platform: "Android",
  };
  const context = vm.createContext({
    document: { getElementById: element, createElement: element, querySelector: element },
    navigator: { userAgent: native ? "Test SijdaAndroid/0.1" : "Test browser" },
    localStorage: {
      getItem: () => stored,
      setItem: (key, value) => { stored = value; },
    },
    FormData: class {
      get(key) {
        if (key === "device") return inputs.device.value;
        if (key === "expectedRakat") return inputs.expectedRakat.value;
        if (key === "expectedSajdahs") return inputs.expectedSajdahs.value;
        return {
          verdict: "incorrect",
          placement: "chair", distance: "1-2m", lighting: "normal",
          notes: "", consent: consent ? "on" : null,
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
  const camera = new vm.SyntheticModule(["feedbackSnapshot", "getFeedbackDiagnostics", "stopForFeedback"], function () {
    this.setExport("feedbackSnapshot", () => ({
      sessionId: "test-session", algorithmVersion: "sensor-assisted-v3",
      target: 2, detectedRakat: 0, detectedSajdahs: 0, interruptions: 0,
      completed: false, transitions: [],
    }));
    this.setExport("getFeedbackDiagnostics", async () => ({
      trackingState: "calibrating", status: "Setup incomplete.", placement: "mat",
      calibrationMode: "none", calibrated: false,
      frameCounts: {
        camera: 5, pose: 0, classified: 0, unknown: 0, noPose: 5,
        unclassifiedPose: 0, calibration: 5, calibrationPose: 0,
        calibrationNoPose: 5, calibrationNotUpright: 0, calibrationUnstable: 0,
        multiplePerson: 0, lastPoseCount: 0,
      },
      lastPosture: "unknown", phase: "standing",
      camera: {
        width: 640, height: 480, durationMs: 1200, screenLightEnabled: false,
        diagnosticRecordingEnabled: false, recordingSupported: true,
      },
      lightingCondition: "unassessed",
      sensorAvailability: {
        camera: true, proximity: false, light: false, orientation: false,
        accelerometer: false, gyroscope: false,
      },
      deviceMetadataError: "", sensorError: "", device,
      browser: "test browser", viewport: "360x640",
      screen: { width: 360, height: 640, pixelRatio: 2 },
    }));
    this.setExport("stopForFeedback", () => {});
  }, { context });
  const service = new vm.SyntheticModule(["validateFeedback", "uploadFeedback"], function () {
    this.setExport("validateFeedback", validateFeedback);
    this.setExport("uploadFeedback", async report => { uploads++; uploaded = report; });
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
    input: name => inputs[name],
    saved: () => JSON.parse(stored),
    uploaded: () => uploaded,
    uploads: () => uploads,
    deviceReady: () => new Promise(resolve => setImmediate(resolve)),
  };
}

test("review shortcut opens the feedback form and offsets scrolling below sticky results", async () => {
  const app = await harness();
  app.review();
  assert.equal(app.element("feedback-section").open, true);
  assert.equal(app.element("feedback-section").style.scrollMarginTop, "172px");
  assert.equal(app.element("feedback-section").scrolled, true);
});

test("sticky feedback entry and consent disclosure keep reports reachable and media private", async () => {
  const html = await readFile(new URL("../web/rakat/index.html", import.meta.url), "utf8");
  assert.match(html, /id="review-feedback" class="primary report-button"/);
  assert.match(html, /Upload requires your consent for each report/);
  assert.match(html, /camera\/video, images, raw body landmarks, location/);
  assert.doesNotMatch(html, /name="consent" checked/);
});

test("device details and posture diagnostics are auto-filled and uploaded only with consent", async () => {
  const app = await harness({ consent: true });
  await app.deviceReady();
  assert.equal(app.input("device").value, "Samsung SM-S928N · Android 16 · Sajdah 0.1.19+20 · WebView 156.0.8078.47");
  app.input("expectedRakat").value = "3";
  app.input("expectedRakat").listeners.input();
  assert.equal(app.input("expectedSajdahs").value, "6");
  await app.submit();
  assert.equal(app.uploads(), 1);
  assert.equal(app.uploaded().diagnostics.trackingState, "calibrating");
  assert.equal(app.uploaded().device, app.input("device").value);
  assert.equal(app.uploaded().expectedRakat, 3);
  assert.equal(app.uploaded().expectedSajdahs, 6);
  assert.equal(app.uploaded().diagnostics.device.model, "SM-S928N");
  assert.equal(app.uploaded().diagnostics.screen.pixelRatio, 2);
  assert.equal(app.uploaded().video, undefined);
  assert.equal(app.saved()[0].diagnostics.frameCounts.noPose, 5);
});

test("reports remain local when the per-report upload consent is unchecked", async () => {
  const app = await harness();
  await app.submit();
  assert.equal(app.uploads(), 0);
  assert.equal(app.saved().length, 1);
  assert.match(app.element("feedback-status").textContent, /on this device only/);
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
