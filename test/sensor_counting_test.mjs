import test from "node:test";
import assert from "node:assert/strict";
import { RakatCounter, classifyPose, standingCalibration, estimateFaceScale } from "../web/rakat/counter.mjs";
import { PoseEvidence, readNativeSensors, deviceIsMoving, sensorOrientation } from "../web/rakat/sensors.mjs";
import { buildSyntheticPose } from "./fixtures/video_benchmark_scenarios.mjs";

const ordered = ["standing", "bow", "standing", "sajdah", "sitting", "sajdah", "sitting"];
const mat = { mode: "mat", headY: 0.22, faceScale: 0.3 };

function session(target = 2) {
  const counter = new RakatCounter(target, { adaptive: true });
  let time = 0;
  return {
    counter,
    hold(posture, duration = posture === "sajdah" ? 400 : 200, evidence = {}) {
      for (let elapsed = 0; elapsed <= duration; elapsed += 100) {
        counter.observe(posture, time, evidence);
        time += 100;
      }
    },
  };
}

test("fast 2/3/4-rakat sequences retain brief ruku, qaumah and jalsah", () => {
  for (const target of [2, 3, 4]) {
    const s = session(target);
    for (let rakat = 0; rakat < target; rakat++) ordered.forEach(posture => s.hold(posture));
    assert.equal(s.counter.rakats.length, target);
    assert.ok(s.counter.rakats.every(rakat => rakat.quality === "sequence-observed"));
    assert.ok(s.counter.rakats.every(rakat => Object.values(rakat.observed).every(Boolean)));
  }
});

test("adaptive dwell boundaries reject 199ms raised and 399ms sajdah observations", () => {
  const c = new RakatCounter(2, { adaptive: true });
  c.observe("standing", 0);
  c.observe("standing", 199);
  assert.equal(c.phase, "standing");
  c.observe("standing", 200);
  assert.equal(c.phase, "bow");
  c.observe("sajdah", 300);
  c.observe("sajdah", 699);
  assert.equal(c.sajdahs, 0);
  c.observe("sajdah", 700);
  assert.equal(c.sajdahs, 1);
});

test("skipped visual phases produce an explicitly incomplete estimate, never full verification", () => {
  const s = session();
  ["bow", "standing", "sajdah", "standing", "sajdah", "sitting"].forEach(p => s.hold(p));
  assert.equal(s.counter.rakats.length, 1);
  const result = s.counter.rakats[0];
  assert.equal(result.quality, "sajdah-pair");
  assert.equal(result.observed.ruku, false);
  assert.equal(result.observed.qaumah, false);
  assert.equal(result.observed.jalsah, false);
});

test("initial proximity or sajdahs without standing cannot start a cycle", () => {
  const s = session();
  for (const posture of ["sajdah", "sitting", "sajdah", "sitting"]) {
    s.hold(posture, 1000, { source: "proximity" });
  }
  assert.equal(s.counter.sajdahs, 0);
  assert.equal(s.counter.rakats.length, 0);
});

test("dropouts and elapsed time never turn a held sajdah into two", () => {
  const s = session();
  ["standing", "bow", "standing", "sajdah"].forEach(p => s.hold(p));
  for (let i = 0; i < 10; i++) {
    s.hold("sajdah", 2000);
    s.hold("unknown", 100);
  }
  s.hold("sajdah", 800);
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.phase, "between");
  s.hold("sitting");
  s.hold("sajdah");
  s.hold("sitting");
  assert.equal(s.counter.rakats.length, 1);
});

test("bow-like noise during a prostration does not establish a sitting separator", () => {
  const s = session();
  ["standing", "sajdah"].forEach(p => s.hold(p));
  s.hold("bow", 800);
  s.hold("sajdah", 1200);
  assert.equal(s.counter.sajdahs, 1);
  assert.equal(s.counter.phase, "between");
});

test("unknown tracking times out even during sajdah; restart clears stale timestamps and partials", () => {
  const s = session();
  ordered.forEach(p => s.hold(p));
  ["standing", "sajdah"].forEach(p => s.hold(p));
  s.hold("unknown", 4100);
  assert.equal(s.counter.paused, true);
  s.counter.restartCurrent();
  assert.equal(s.counter.rakats.length, 1);
  assert.equal(s.counter.sajdahs, 0);
  s.counter.observe("standing", 100000);
  s.counter.observe("standing", 100200);
  assert.equal(s.counter.paused, false);
  assert.equal(s.counter.phase, "bow");
});

test("sensor far/near cycles can separate sajdahs but cannot verify sitting or bowing", () => {
  const s = session();
  s.hold("standing");
  s.hold("sajdah", 1000, { source: "proximity" });
  s.hold("unknown", 200, { source: "none", released: true });
  assert.equal(s.counter.phase, "secondSajdah");
  s.hold("sajdah", 1000, { source: "proximity" });
  s.hold("unknown", 200, { source: "none", released: true });
  assert.equal(s.counter.rakats.length, 1);
  assert.equal(s.counter.rakats[0].quality, "sajdah-pair");
  assert.equal(s.counter.rakats[0].observed.jalsah, false);
  assert.equal(s.counter.rakats[0].observed.sajdah1, false);
  assert.ok(s.counter.rakats[0].sources.includes("proximity"));
});

test("darkness, coverage flags, missing people and ambiguous geometry are not postures", () => {
  for (const context of [{ isCovered: true }, { personVisible: false }, { proximity: true }, { opticalProximity: true }]) {
    assert.equal(classifyPose(null, mat, context), "unknown");
  }
  const evidence = new PoseEvidence();
  assert.equal(evidence.observe(null, mat, { lux: 0 }, 100).posture, "unknown");
  assert.equal(evidence.observe(null, mat, { proximity: true }, 200).posture, "unknown");
  assert.equal(classifyPose(buildSyntheticPose({ headY: 0.30, shoulderY: 0.20 }), mat), "unknown");
  assert.equal(classifyPose(buildSyntheticPose({ headY: 0.45, shoulderY: 0.48 }), { mode: "upper" }), "unknown");
});

test("flat calibration takes precedence and shares face scale with live classification", () => {
  const standing = buildSyntheticPose({ headY: 0.22, shoulderY: 0.38, hipY: 0.60 });
  const calibration = standingCalibration(standing, { allowAdaptive: true, orientation: "flat" });
  assert.equal(calibration.mode, "mat");
  assert.equal(calibration.faceScale, estimateFaceScale(standing));
  assert.equal(classifyPose(standing, calibration), "standing");
  assert.equal(classifyPose(buildSyntheticPose({ headY: 0.40, shoulderY: 0.60 }), calibration), "sitting");
  const bad = buildSyntheticPose();
  bad[7].x = NaN;
  assert.ok(Number.isFinite(estimateFaceScale(bad)));
});

test("proximity cannot override visible standing or a non-mat camera view", () => {
  const evidence = new PoseEvidence();
  const standing = buildSyntheticPose({ headY: 0.22, shoulderY: 0.38 });
  assert.equal(evidence.observe(standing, mat, { proximity: true }, 100).posture, "standing");
  const full = standingCalibration(buildSyntheticPose());
  assert.equal(evidence.observe(null, full, { proximity: true }, 200).posture, "unknown");
});

test("supported proximity stays usable during long occlusion and needs a real far release", () => {
  const evidence = new PoseEvidence();
  const sajdah = buildSyntheticPose({ headY: 0.72, shoulderY: 0.65 });
  evidence.observe(sajdah, mat, { proximity: true }, 100);
  assert.equal(evidence.observe(null, mat, { proximity: true }, 20000).posture, "sajdah");
  assert.equal(evidence.observe(null, mat, { proximity: false }, 20200).released, true);
  assert.equal(evidence.observe(null, mat, { proximity: false }, 20400).released, true);
  assert.equal(evidence.observe(null, mat, { proximity: true }, 20500).posture, "sajdah");
  evidence.reset();
  assert.equal(evidence.observe(null, mat, { proximity: true }, 20600).posture, "unknown");
});

test("brief near noise and unavailable proximity cannot manufacture a release", () => {
  const evidence = new PoseEvidence();
  const sajdah = buildSyntheticPose({ headY: 0.72, shoulderY: 0.65 });
  evidence.observe(sajdah, mat, { proximity: true }, 100);
  assert.equal(evidence.observe(null, mat, { proximity: false }, 200).released, false);
  evidence.observe(sajdah, mat, { proximity: true }, 300);
  evidence.observe(null, mat, { proximity: true }, 800);
  assert.equal(evidence.observe(null, mat, {}, 900).released, false);
  assert.equal(evidence.observe(null, mat, { proximity: false }, 1000).released, false);
});

test("visible continued sajdah cancels a contradictory far-release reading", () => {
  const evidence = new PoseEvidence();
  const sajdah = buildSyntheticPose({ headY: 0.72, shoulderY: 0.65 });
  evidence.observe(sajdah, mat, { proximity: true }, 100);
  evidence.observe(sajdah, mat, { proximity: false }, 200);
  assert.equal(evidence.observe(null, mat, { proximity: false }, 300).released, false);
});

test("optical assistance requires recent person evidence and confident close-up landmarks", () => {
  const evidence = new PoseEvidence();
  const bow = buildSyntheticPose({ headY: 0.48, shoulderY: 0.50 });
  const closeup = buildSyntheticPose({ headY: 0.4, shoulderVis: 0.1, hipVis: 0.1 });
  closeup[7].x = 0.25;
  closeup[8].x = 0.75;
  assert.equal(evidence.observe(closeup, mat, {}, 100).posture, "unknown");
  evidence.observe(bow, mat, {}, 200);
  assert.equal(evidence.observe(closeup, mat, {}, 300).source, "optical");
  assert.equal(evidence.observe(closeup, mat, {}, 2000).posture, "unknown");
  evidence.observe(bow, mat, {}, 2100);
  closeup[7].visibility = 0.1;
  assert.equal(evidence.observe(closeup, mat, {}, 2200).posture, "unknown");
});

test("native capability flags and invalid readings cannot create sensor evidence", () => {
  const snapshot = data => readNativeSensors({ getSnapshot: () => JSON.stringify(data) });
  assert.equal(snapshot({ proximityAvailable: true, proximityDistance: 5, proximityMaxRange: 5 }).proximity, false);
  assert.equal(snapshot({ proximityAvailable: true, proximityDistance: 0, proximityMaxRange: 5 }).proximity, true);
  assert.equal(snapshot({ proximityAvailable: false, proximityDistance: 0, proximityMaxRange: 5 }).proximity, null);
  assert.equal(snapshot({ proximityAvailable: true, proximityDistance: -1, proximityMaxRange: 5 }).proximity, null);
  assert.equal(snapshot({ orientationAvailable: false, pitch: 0 }).pitch, null);
  assert.throws(() => readNativeSensors({ getSnapshot: () => "broken" }), SyntaxError);
  assert.throws(() => readNativeSensors({ getSnapshot: () => "null" }), /Invalid/);
});

test("motion/orientation aid placement but do not infer prayer phases", () => {
  assert.equal(sensorOrientation({ pitch: null, roll: null }), "unknown");
  assert.equal(sensorOrientation({ pitch: 0, roll: 0 }), "flat");
  assert.equal(sensorOrientation({ pitch: 0, roll: 90 }), "tilted");
  assert.equal(deviceIsMoving({ acceleration: 3 }), true);
  assert.equal(deviceIsMoving({ rotationRate: 1 }), true);
  assert.equal(deviceIsMoving({ acceleration: null, rotationRate: null }), false);
});
