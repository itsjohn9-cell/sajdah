import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  RakatCounter,
  standingCalibration,
  adaptiveCalibration,
  classifyPose,
  detectOrientation,
  diagnosePlacement,
  selectPrimaryPose,
} from "../web/rakat/counter.mjs";
import { LightingMonitor } from "../web/rakat/lighting.mjs";
import { PoseEvidence, readNativeSensors, deviceIsMoving, sensorOrientation } from "../web/rakat/sensors.mjs";
import { buildSyntheticPose } from "./fixtures/video_benchmark_scenarios.mjs";

async function harness({ pendingModel = false, pendingCamera = false, denied = false, nativeLighting = false, completedRakat = 0, nativeSensors = null } = {}) {
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
  let poseResults = [];
  let now = 0;
  const sensorRequests = [];
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
    detectForVideo() { return { landmarks: poseResults }; },
  };
  const modelPromise = new Promise(resolve => { resolveModel = resolve; });
  const cameraPromise = new Promise(resolve => { resolveCamera = resolve; });
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "2", textContent: "", disabled: false, srcObject: null,
      readyState: 2, currentTime: 0,
      addEventListener(type, fn) { listeners.set(`${id}:${type}`, fn); },
      replaceChildren(...children) { this.children = children; },
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
  if (nativeSensors) window.SijdaSensors = {
    setEnabled(enabled) { sensorRequests.push(enabled); return true; },
    getSnapshot() { return JSON.stringify(nativeSensors); },
  };
  const context = vm.createContext({
    document, window, location: { origin: "https://sijda.test" },
    navigator: { mediaDevices: { getUserMedia: async () => {
      if (denied) throw new Error("Permission denied");
      return pendingCamera ? cameraPromise : stream;
    } } },
    crypto: { randomUUID: () => "test-session" }, confirm: () => true,
    performance: { now: () => now },
    requestAnimationFrame: fn => { animation = fn; return 1; },
    cancelAnimationFrame: () => { animation = null; },
    console: { error() {} },
  });
  const counterModule = new vm.SyntheticModule(
    ["RakatCounter", "standingCalibration", "classifyPose", "adaptiveCalibration", "detectOrientation", "diagnosePlacement", "selectPrimaryPose"],
    function () {
      this.setExport("RakatCounter", class extends RakatCounter {
        constructor(...args) {
          super(...args);
          this.rakats = Array.from({ length: completedRakat }, () => ({ sajdahs: 2 }));
        }
      });
      this.setExport("standingCalibration", standingCalibration);
      this.setExport("classifyPose", classifyPose);
      this.setExport("adaptiveCalibration", adaptiveCalibration);
      this.setExport("detectOrientation", detectOrientation);
      this.setExport("diagnosePlacement", diagnosePlacement);
      this.setExport("selectPrimaryPose", selectPrimaryPose);
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
  const sensorsModule = new vm.SyntheticModule(
    ["PoseEvidence", "readNativeSensors", "deviceIsMoving", "sensorOrientation"],
    function () {
      this.setExport("PoseEvidence", PoseEvidence);
      this.setExport("readNativeSensors", readNativeSensors);
      this.setExport("deviceIsMoving", deviceIsMoving);
      this.setExport("sensorOrientation", sensorOrientation);
    }, { context },
  );
  const source = await readFile(new URL("../web/rakat/camera.mjs", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, {
    context, importModuleDynamically: async () => mediaModule,
  });
  await module.link(specifier => specifier === "./lighting.mjs" ? lightingModule :
    specifier === "./sensors.mjs" ? sensorsModule : counterModule);
  await module.evaluate();
  return {
    element, tracks, detector, document, window, globalListeners, module, classes, brightnessRequests, sensorRequests,
    setPixels: value => { pixelValue = value; },
    setPoses: value => { poseResults = value; },
    failSampling: () => { samplingError = true; },
    samples: () => samples,
    closed: () => closed,
    click: id => listeners.get(`${id}:click`)(),
    change: id => listeners.get(`${id}:change`)(),
    resolveModel: () => resolveModel(detector),
    resolveCamera: () => resolveCamera(stream),
    frame: time => { now = time; animation?.(time); },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("diagnostic video is opt-in and privacy disclosures match", async () => {
  const html = await readFile(new URL("../web/rakat/index.html", import.meta.url), "utf8");
  const policy = await readFile(new URL("../web/privacy.html", import.meta.url), "utf8");
  assert.match(html, /id="record-test-video"/);
  assert.doesNotMatch(html, /id="record-test-video" checked/);
  assert.match(html, /off by default/);
  assert.match(html, /never uploaded/);
  assert.match(policy, /Microphone and voice tasbeeh/);
  assert.match(
    policy.replace(/\s+/g, " "),
    /Sajdah does not record, save or upload microphone audio/,
  );
});

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
  assert.match(app.element("status").textContent, /one person/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
  const diagnostics = await app.module.namespace.getFeedbackDiagnostics();
  assert.equal(diagnostics.trackingState, "calibrating");
  assert.equal(diagnostics.frameCounts.camera, 1);
  assert.equal(diagnostics.frameCounts.calibration, 1);
  assert.equal(diagnostics.frameCounts.calibrationNoPose, 1);
  assert.equal(diagnostics.frameCounts.noPose, 1);
  assert.equal(diagnostics.camera.diagnosticRecordingEnabled, false);
  assert.equal("location" in diagnostics, false);
  app.click("stop");
  assert.equal((await app.module.namespace.getFeedbackDiagnostics()).trackingState, "calibrating");
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

function standingPose() {
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  for (const [indices, y] of [[[0], 0.1], [[11, 12], 0.24], [[23, 24], 0.5], [[25, 26], 0.7], [[27, 28], 0.9]]) {
    for (const index of indices) pose[index].y = y;
  }
  return pose;
}

test("calibration completion immediately labels tracking active", async () => {
  const app = await harness();
  app.setPoses([standingPose()]);
  await app.click("start");
  for (let time = 100; time <= 1600; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.match(app.element("status").textContent, /Calibrated/);
  assert.match(app.element("session-state").textContent, /Tracking active/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
});

test("camera with no initial frames warns after 1500ms and requires full calibration on recovery", async () => {
  const app = await harness();
  await app.click("start");
  app.element("video").readyState = 0;
  app.frame(100);
  app.frame(1600);
  assert.doesNotMatch(app.element("status").textContent, /frames stopped/);
  app.frame(1601);
  assert.match(app.element("status").textContent, /frames stopped.*Calibration is on hold/);
  assert.match(app.element("session-state").textContent, /Setup in progress/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 0);
  app.setPoses([standingPose()]);
  app.element("video").readyState = 2;
  for (let time = 1700; time < 3200; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.match(app.element("session-state").textContent, /Setup in progress/);
  app.element("video").currentTime++;
  app.frame(3200);
  assert.match(app.element("session-state").textContent, /Tracking active/);
});

test("frozen calibrated video pauses without advancing counts", async () => {
  const app = await harness();
  app.setPoses([standingPose()]);
  await app.click("start");
  for (let time = 100; time <= 1700; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  app.frame(3200);
  assert.match(app.element("session-state").textContent, /Tracking active/);
  app.frame(3201);
  assert.match(app.element("status").textContent, /Camera frames stopped/);
  assert.match(app.element("session-state").textContent, /Tracking paused/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
});

test("a calibration frame gap discards partial standing dwell before recovery", async () => {
  const app = await harness();
  app.setPoses([standingPose()]);
  await app.click("start");
  for (let time = 100; time <= 900; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  app.frame(2401);
  assert.match(app.element("status").textContent, /Calibration is on hold/);
  for (let time = 2500; time <= 3900; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.match(app.element("session-state").textContent, /Setup in progress/);
  app.element("video").currentTime++;
  app.frame(4000);
  assert.match(app.element("session-state").textContent, /Tracking active/);
});

test("multiple people cannot calibrate or advance a calibrated session", async () => {
  const app = await harness();
  app.setPoses([standingPose(), standingPose()]);
  await app.click("start");
  for (let time = 100; time <= 1700; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.match(app.element("session-state").textContent, /Setup in progress/);
  assert.match(app.element("status").textContent, /one person/);
  app.setPoses([standingPose()]);
  for (let time = 1800; time <= 3400; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.match(app.element("session-state").textContent, /Tracking active/);
  app.setPoses([standingPose(), standingPose()]);
  for (let time = 3500; time <= 4500; time += 100) {
    app.element("video").currentTime++;
    app.frame(time);
  }
  assert.match(app.element("session-state").textContent, /Tracking paused/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
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
  assert.match(app.element("status").textContent, /one person/);
});

const matPoses = {
  standing: buildSyntheticPose({ headY: 0.22, shoulderY: 0.38, hipY: 0.60 }),
  bow: buildSyntheticPose({ headY: 0.48, shoulderY: 0.50 }),
  sitting: buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 }),
  sajdah: buildSyntheticPose({ headY: 0.72, shoulderY: 0.65 }),
};

function driver(app) {
  let time = 0;
  return {
    hold(posture, duration = posture === "sajdah" ? 400 : 200) {
      app.setPoses(posture === "unknown" ? [] : [matPoses[posture]]);
      for (let elapsed = 0; elapsed <= duration; elapsed += 100) {
        time += 100;
        app.element("video").currentTime++;
        app.frame(time);
      }
    },
    multiple() {
      app.setPoses([matPoses.standing, matPoses.standing]);
      for (let i = 0; i < 16; i++) {
        time += 100;
        app.element("video").currentTime++;
        app.frame(time);
      }
    },
  };
}

async function matApp(options = {}) {
  const app = await harness(options);
  app.element("placement").value = "mat";
  await app.click("start");
  const drive = driver(app);
  drive.hold("standing", 1900);
  assert.match(app.element("session-state").textContent, /Tracking active/);
  return { app, drive };
}

test("live camera path counts fast 2/3/4-rakat sequences and exposes observed phase results", async () => {
  for (const target of [2, 3, 4]) {
    const app = await harness();
    app.element("target").value = String(target);
    app.change("target");
    app.element("placement").value = "mat";
    await app.click("start");
    const drive = driver(app);
    drive.hold("standing", 1900);
    for (let rakat = 0; rakat < target; rakat++) {
      for (const posture of ["standing", "bow", "standing", "sajdah", "sitting", "sajdah", "sitting"]) {
        drive.hold(posture);
      }
    }
    const result = app.module.namespace.getLocalDiagnostics();
    assert.equal(result.rakats.length, target);
    assert.ok(result.rakats.every(rakat => rakat.quality === "sequence-observed"));
    assert.equal(app.module.namespace.feedbackSnapshot().algorithmVersion, "sensor-assisted-v3");
    assert.match(app.element("history").children[0].textContent, /full sequence observed/);
    assert.ok(app.tracks.every(track => track.ended));
  }
});

test("native proximity supports long occlusion and fast release without falsely verifying unseen phases", async () => {
  const sensors = { proximityAvailable: true, proximityDistance: 5, proximityMaxRange: 5, lightAvailable: true, lux: 8 };
  const { app, drive } = await matApp({ nativeSensors: sensors });
  assert.deepEqual(app.sensorRequests, [true]);
  assert.match(app.element("sensor-status").textContent, /proximity, light/);
  drive.hold("bow");
  sensors.proximityDistance = 0;
  drive.hold("unknown", 8000);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 1);
  sensors.proximityDistance = 5;
  drive.hold("unknown");
  sensors.proximityDistance = 0;
  drive.hold("unknown", 400);
  sensors.proximityDistance = 5;
  drive.hold("unknown");
  const result = app.module.namespace.getLocalDiagnostics().rakats[0];
  assert.ok(result);
  assert.equal(result.quality, "sajdah-pair");
  assert.equal(result.observed.ruku, true);
  assert.equal(result.observed.qaumah, false);
  assert.equal(result.observed.jalsah, false);
  assert.ok(result.sources.includes("proximity"));
  assert.match(app.element("history").children[0].textContent, /unverified: qaumah/);
  app.click("stop");
  assert.equal(app.sensorRequests.at(-1), false);
});

test("black camera frames during a low phase neither manufacture sajdah nor hide lost tracking", async () => {
  const { app, drive } = await matApp();
  drive.hold("sajdah");
  app.setPixels(0);
  drive.hold("unknown", 4200);
  assert.match(app.element("status").textContent, /Body tracking lost/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 1);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
  app.click("resume");
  drive.hold("standing");
  assert.match(app.element("session-state").textContent, /Tracking active/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 0);
});

test("Stop keeps second-sajdah partials without adding a completed estimate", async () => {
  const { app, drive } = await matApp();
  for (const posture of ["sajdah", "sitting", "sajdah"]) drive.hold(posture);
  app.click("stop");
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 0);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 2);
});

test("phone acceleration, rotation or changed angle requires recalibration", async () => {
  for (const change of [{ acceleration: 3 }, { rotationRate: 1 }, { pitch: 30 }, { roll: 30 }]) {
    const sensors = {
      orientationAvailable: true, pitch: 0, roll: 0,
      accelerationAvailable: true, acceleration: 0, gyroscopeAvailable: true, rotationRate: 0,
    };
    const { app, drive } = await matApp({ nativeSensors: sensors });
    Object.assign(sensors, change);
    drive.hold("sajdah");
    assert.match(app.element("status").textContent, /Phone moved/);
    assert.equal(app.element("resume").disabled, true);
    assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 0);
    Object.assign(sensors, { pitch: 0, roll: 0, acceleration: 0, rotationRate: 0 });
    app.click("calibrate");
    drive.hold("standing", 1900);
    assert.match(app.element("session-state").textContent, /Tracking active/);
  }
});

test("multi-person pause automatically restarts partial state without stale timestamps", async () => {
  const { app, drive } = await matApp({ completedRakat: 1 });
  drive.hold("sajdah");
  drive.multiple();
  assert.match(app.element("session-state").textContent, /Tracking paused/);
  drive.hold("standing", 2400);
  drive.hold("standing");
  assert.match(app.element("session-state").textContent, /Tracking active/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedRakat, 1);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 2);
});

test("native sensors cannot calibrate or count without a working camera", async () => {
  const sensors = { proximityAvailable: true, proximityDistance: 0, proximityMaxRange: 5 };
  const app = await harness({ nativeSensors: sensors });
  app.element("placement").value = "mat";
  await app.click("start");
  const drive = driver(app);
  drive.hold("unknown", 5000);
  assert.match(app.element("session-state").textContent, /Setup in progress/);
  assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 0);
  const denied = await harness({ nativeSensors: sensors, denied: true });
  await denied.click("start");
  assert.ok(!denied.sensorRequests.includes(true));
});

test("sensor bridge failures and motion permission denial stay visible with camera fallback", async () => {
  const app = await harness({ nativeSensors: {} });
  app.window.SijdaSensors.getSnapshot = () => { throw new Error("Bridge failed"); };
  await app.click("start");
  const drive = driver(app);
  drive.hold("standing", 1900);
  assert.match(app.element("sensor-status").textContent, /Native sensors unavailable/);
  assert.match(app.element("session-state").textContent, /Tracking active/);
  const browser = await harness();
  await browser.click("start");
  browser.window.DeviceMotionEvent = { requestPermission: async () => "denied" };
  await browser.click("enable-motion");
  assert.match(browser.element("motion-status").textContent, /denied/);
  assert.ok(browser.element("video").srcObject);
});

test("frozen camera cannot advance from proximity, and exit paths release native sensors", async () => {
  for (const reason of ["frozen", "hidden", "pagehide", "feedback", "failure"]) {
    const sensors = { proximityAvailable: true, proximityDistance: 5, proximityMaxRange: 5 };
    const { app, drive } = await matApp({ nativeSensors: sensors });
    drive.hold("bow");
    sensors.proximityDistance = 0;
    if (reason === "frozen") {
      app.frame(5000);
      assert.match(app.element("session-state").textContent, /Tracking paused/);
      assert.equal(app.module.namespace.feedbackSnapshot().detectedSajdahs, 0);
      app.click("stop");
    } else if (reason === "hidden") {
      app.document.hidden = true;
      app.globalListeners["document:visibilitychange"]();
    } else if (reason === "pagehide") app.globalListeners["window:pagehide"]();
    else if (reason === "feedback") app.module.namespace.stopForFeedback();
    else {
      app.detector.detectForVideo = () => { throw new Error("Inference failed"); };
      drive.hold("unknown");
    }
    assert.equal(app.sensorRequests.at(-1), false, reason);
    assert.ok(app.tracks.every(track => track.ended), reason);
  }
});
