import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { RakatCounter, standingCalibration, classifyPose } from "../web/rakat/counter.mjs";
import { LightingMonitor } from "../web/rakat/lighting.mjs";

async function harness({ pendingModel = false, pendingCamera = false, denied = false, nativeLighting = false, completedRakat = 0 } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const tracks = [{ ended: false, stop() { this.ended = true; }, addEventListener() {} }];
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks };
  let closed = 0;
  let resolveModel;
  let resolveCamera;
  let animation;
  let pixelValue = 128;
  let samplingError = false;
  let samples = 0;
  const brightnessRequests = [];
  const classes = new Set();
  const canvas = {
    getContext: () => ({
      drawImage() { if (samplingError) throw new Error("Sample failed"); },
      getImageData() {
        samples++;
        return { data: new Uint8ClampedArray([pixelValue, pixelValue, pixelValue, 255]) };
      },
    }),
  };
  const detector = {
    close() { closed++; },
    detectForVideo() { return { landmarks: [] }; },
  };
  const modelPromise = new Promise(resolve => { resolveModel = resolve; });
  const cameraPromise = new Promise(resolve => { resolveCamera = resolve; });
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "2", textContent: "", disabled: false, srcObject: null,
      readyState: 2, currentTime: 0,
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
      replaceChildren() {},
      setAttribute(name, value) { this[name] = value; },
      play: async () => {},
    });
    return elements.get(id);
  }
  const globalListeners = {};
  const document = {
    getElementById: element,
    createElement: tag => tag === "canvas" ? canvas : { textContent: "" },
    body: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } },
    hidden: false,
    addEventListener(type, fn) { globalListeners[`document:${type}`] = fn; },
  };
  const window = {
    isSecureContext: true,
    addEventListener(type, fn) { globalListeners[`window:${type}`] = fn; },
  };
  if (nativeLighting) window.SijdaLighting = {
    setEnabled(enabled) { brightnessRequests.push(enabled); return true; },
  };
  const context = vm.createContext({
    document, window, location: { origin: "https://sijda.test" },
    navigator: { mediaDevices: { getUserMedia: async () => {
      if (denied) throw new Error("Permission denied");
      return pendingCamera ? cameraPromise : stream;
    } } },
    crypto: { randomUUID: () => "test-session" }, confirm: () => true,
    requestAnimationFrame: fn => { animation = fn; return 1; },
    cancelAnimationFrame: () => { animation = null; },
    console: { error() {} },
  });
  const counterModule = new vm.SyntheticModule(
    ["RakatCounter", "standingCalibration", "classifyPose"],
    function () {
      this.setExport("RakatCounter", class extends RakatCounter {
        constructor(...args) {
          super(...args);
          this.rakats = Array.from({ length: completedRakat }, () => ({ sajdahs: 2 }));
        }
      });
      this.setExport("standingCalibration", standingCalibration);
      this.setExport("classifyPose", classifyPose);
    }, { context },
  );
  const mediaModule = new vm.SyntheticModule(["FilesetResolver", "PoseLandmarker"], function () {
    this.setExport("FilesetResolver", { forVisionTasks: async () => ({}) });
    this.setExport("PoseLandmarker", { createFromOptions: async () => pendingModel ? modelPromise : detector });
  }, { context });
  await mediaModule.link(() => {});
  await mediaModule.evaluate();
  const lightingModule = new vm.SyntheticModule(["LightingMonitor"], function () {
    this.setExport("LightingMonitor", LightingMonitor);
  }, { context });
  const source = await readFile(new URL("../web/rakat/camera.mjs", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, {
    context, importModuleDynamically: async () => mediaModule,
  });
  await module.link(specifier => specifier === "./lighting.mjs" ? lightingModule : counterModule);
  await module.evaluate();
  return {
    element, tracks, detector, document, window, globalListeners, module, classes, brightnessRequests,
    setPixels: value => { pixelValue = value; },
    failSampling: () => { samplingError = true; },
    samples: () => samples,
    closed: () => closed,
    click: id => listeners.get(`${id}:click`)(),
    resolveModel: () => resolveModel(detector),
    resolveCamera: () => resolveCamera(stream),
    frame: time => animation?.(time),
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("start, blank inference, stop and no automatic camera acquisition", async () => {
  const app = await harness();
  assert.equal(app.element("video").srcObject, null);
  assert.equal(app.element("video").hidden, true);
  assert.equal(app.element("camera-placeholder").hidden, false);
  await app.click("start");
  assert.ok(app.element("video").srcObject);
  assert.equal(app.element("video").hidden, false);
  assert.equal(app.element("camera-placeholder").hidden, true);
  assert.match(app.element("session-state").textContent, /Setup in progress/);
  app.element("video").currentTime = 1;
  app.frame(100);
  assert.match(app.element("status").textContent, /one full body/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
  app.click("stop");
  assert.ok(app.tracks.every(track => track.ended));
  assert.equal(app.closed(), 1);
  assert.equal(app.element("video").srcObject, null);
  assert.equal(app.element("video").hidden, true);
  assert.equal(app.element("camera-placeholder").hidden, false);
  assert.match(app.element("session-state").textContent, /Not tracking/);
});

test("permission denial and insecure contexts are visible, with no dangling model", async () => {
  const app = await harness({ denied: true });
  await app.click("start");
  assert.match(app.element("status").textContent, /Permission denied/);
  assert.match(app.element("session-state").textContent, /Not tracking/);
  assert.equal(app.closed(), 1);
  assert.equal(app.element("start").disabled, false);
  app.window.isSecureContext = false;
  await app.click("start");
  assert.match(app.element("status").textContent, /HTTPS/);
});

test("stopping camera retains estimated totals and labels them as not tracking", async () => {
  const app = await harness({ completedRakat: 1 });
  assert.match(app.element("totals").textContent, /1 \/ 2 estimated rakat/);
  await app.click("start");
  app.click("stop");
  assert.match(app.element("totals").textContent, /1 \/ 2 estimated rakat/);
  assert.match(app.element("session-state").textContent, /Not tracking/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 1);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 2);
});

test("stop during model loading closes late model and never starts a camera", async () => {
  const app = await harness({ pendingModel: true });
  const start = app.click("start");
  await settle();
  app.click("stop");
  app.resolveModel();
  await start;
  assert.equal(app.closed(), 1);
  assert.equal(app.element("video").srcObject, null);
});

test("stop during permission request releases late camera tracks", async () => {
  const app = await harness({ pendingCamera: true });
  const start = app.click("start");
  await settle();
  app.click("stop");
  app.resolveCamera();
  await start;
  assert.ok(app.tracks.every(track => track.ended));
  assert.equal(app.closed(), 1);
  assert.equal(app.element("video").srcObject, null);
});

test("page visibility and parent navigation stop camera; foreign messages do not", async () => {
  for (const reason of ["hidden", "navigation", "pagehide"]) {
    const app = await harness();
    app.window.parent = {};
    await app.click("start");
    app.globalListeners["window:message"]({
      origin: "https://other.test", source: app.window.parent, data: "sijda-stop-camera",
    });
    assert.ok(app.element("video").srcObject);
    if (reason === "hidden") {
      app.document.hidden = true;
      app.globalListeners["document:visibilitychange"]();
    } else if (reason === "navigation") {
      app.globalListeners["window:message"]({
        origin: "https://sijda.test", source: app.window.parent, data: "sijda-stop-camera",
      });
    } else app.globalListeners["window:pagehide"]();
    assert.ok(app.tracks.every(track => track.ended), reason);
    assert.equal(app.closed(), 1);
  }
});

test("inference exceptions stop stream and preserve visible failure", async () => {
  const app = await harness();
  await app.click("start");
  app.detector.detectForVideo = () => { throw new Error("Inference error"); };
  app.element("video").currentTime = 1;
  app.frame(100);
  assert.match(app.element("status").textContent, /Inference error/);
  assert.ok(app.tracks.every(track => track.ended));
});

test("screen light is opt-in, browser limitations are visible, and stop resets it", async () => {
  const app = await harness();
  assert.equal(app.element("screen-light").disabled, true);
  app.click("screen-light");
  assert.equal(app.classes.has("screen-light"), false);
  await app.click("start");
  assert.equal(app.classes.has("screen-light"), false);
  app.click("screen-light");
  assert.equal(app.classes.has("screen-light"), true);
  assert.equal(app.element("screen-light")["aria-pressed"], "true");
  assert.match(app.element("screen-light-status").textContent, /browser cannot raise/);
  app.click("screen-light");
  assert.equal(app.classes.has("screen-light"), false);
  app.click("screen-light");
  app.click("stop");
  assert.equal(app.classes.has("screen-light"), false);
  assert.equal(app.element("screen-light")["aria-pressed"], "false");
  assert.equal(app.element("screen-light").disabled, true);
  await app.click("start");
  assert.equal(app.classes.has("screen-light"), false);
});

test("native brightness is requested only on opt-in and released for every exit", async () => {
  for (const reason of ["stop", "hidden", "pagehide", "navigation", "feedback", "failure"]) {
    const app = await harness({ nativeLighting: true });
    await app.click("start");
    assert.deepEqual(app.brightnessRequests, []);
    app.click("screen-light");
    assert.deepEqual(app.brightnessRequests, [true]);
    if (reason === "hidden") {
      app.document.hidden = true;
      app.globalListeners["document:visibilitychange"]();
    } else if (reason === "pagehide") app.globalListeners["window:pagehide"]();
    else if (reason === "navigation") app.globalListeners["window:message"]({
      origin: "https://sijda.test", source: app.window.parent, data: "sijda-stop-camera",
    });
    else if (reason === "feedback") app.module.namespace.stopForFeedback();
    else if (reason === "failure") {
      app.detector.detectForVideo = () => { throw new Error("Detector failed"); };
      app.element("video").currentTime = 1;
      app.frame(100);
    } else app.click("stop");
    assert.equal(app.brightnessRequests.at(-1), false, reason);
    assert.equal(app.classes.has("screen-light"), false, reason);
    assert.ok(app.tracks.every(track => track.ended), reason);
  }
});

test("native brightness failures are visible without weakening camera counting", async () => {
  const app = await harness({ nativeLighting: true });
  await app.click("start");
  app.window.SijdaLighting.setEnabled = () => false;
  app.click("screen-light");
  assert.match(app.element("screen-light-status").textContent, /could not be raised/);
  assert.ok(app.element("video").srcObject);
  app.click("screen-light");
  app.window.SijdaLighting.setEnabled = () => { throw new Error("Bridge failed"); };
  app.click("screen-light");
  assert.match(app.element("screen-light-status").textContent, /control failed/);
  app.click("stop");
  assert.ok(app.tracks.every(track => track.ended));
});

test("dark-frame warnings are sampled locally at 1 Hz and clear only after stable recovery", async () => {
  const app = await harness();
  app.setPixels(0);
  await app.click("start");
  for (const time of [100, 200, 1100]) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.equal(app.samples(), 2);
  assert.match(app.element("lighting-status").textContent, /Low-light warning/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
  app.setPixels(128);
  app.element("video").currentTime++;
  app.frame(2100);
  assert.match(app.element("lighting-status").textContent, /Low-light warning/);
  app.element("video").currentTime++;
  app.frame(3100);
  assert.match(app.element("lighting-status").textContent, /does not confirm/);
  app.click("stop");
  assert.match(app.element("lighting-status").textContent, /check off/);
});

test("lighting sampler failure is explicit and does not terminate pose tracking", async () => {
  const app = await harness();
  app.failSampling();
  await app.click("start");
  app.element("video").currentTime++;
  app.frame(100);
  assert.match(app.element("lighting-status").textContent, /check unavailable/);
  assert.ok(app.element("video").srcObject);
  assert.match(app.element("status").textContent, /one full body/);
});
