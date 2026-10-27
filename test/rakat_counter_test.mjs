import test from "node:test";
import assert from "node:assert/strict";
import { RakatCounter, standingCalibration, classifyPose } from "../web/rakat/counter.mjs";

function session(target = 2) {
  const counter = new RakatCounter(target);
  let time = 0;
  return {
    counter,
    hold(posture, duration = 800) {
      for (let elapsed = 0; elapsed <= duration; elapsed += 100) {
        counter.observe(posture, time);
        time += 100;
      }
    },
  };
}
const sequence = ["standing", "bow", "standing", "sajdah", "sitting", "sajdah", "sitting"];

test("full ordered sequence records both sajdahs only after their separate entries", () => {
  const { counter, hold } = session();
  for (const posture of sequence.slice(0, 4)) hold(posture);
  assert.equal(counter.sajdahs, 1);
  assert.equal(counter.rakats.length, 0);
  hold("sajdah", 2000);
  assert.equal(counter.sajdahs, 1);
  hold("sitting");
  hold("sajdah");
  assert.equal(counter.sajdahs, 2);
  assert.equal(counter.rakats.length, 0);
  hold("sitting");
  assert.deepEqual(counter.rakats, [{ sajdahs: 2 }]);
  assert.equal(counter.sajdahs, 0);
});

test("two sajdahs without ruku and standing do not establish a rakat", () => {
  const { counter, hold } = session();
  ["standing", "sajdah", "sitting", "sajdah", "standing"].forEach(p => hold(p));
  assert.equal(counter.rakats.length, 0);
  assert.equal(counter.sajdahs, 0);
});

test("brief jitter cannot advance; prolonged loss pauses without inventing counts", () => {
  const { counter, hold } = session();
  hold("standing");
  hold("bow", 200);
  hold("standing");
  assert.equal(counter.phase, "bow");
  hold("unknown", 1200);
  assert.equal(counter.paused, true);
  sequence.forEach(p => hold(p));
  assert.equal(counter.rakats.length, 0);
  counter.restartCurrent();
  sequence.forEach(p => hold(p));
  assert.equal(counter.rakats.length, 1);
});

test("frame interruptions pause and restart discards only partial detections", () => {
  const { counter, hold } = session();
  sequence.forEach(p => hold(p));
  ["standing", "bow", "standing", "sajdah"].forEach(p => hold(p));
  assert.equal(counter.sajdahs, 1);
  counter.observe("sitting", 100000);
  assert.equal(counter.paused, true);
  counter.restartCurrent();
  assert.equal(counter.rakats.length, 1);
  assert.equal(counter.sajdahs, 0);
  assert.equal(counter.phase, "standing");
});

test("all targets stop counting at completion; undo reopens the session", () => {
  for (const target of [2, 3, 4]) {
    const { counter, hold } = session(target);
    for (let i = 0; i < target + 1; i++) sequence.forEach(p => hold(p));
    assert.equal(counter.rakats.length, target);
    assert.equal(counter.complete, true);
    counter.undoRakat();
    assert.equal(counter.complete, false);
    sequence.forEach(p => hold(p));
    assert.equal(counter.rakats.length, target);
  }
});

test("standing after second sajdah correctly begins the next rakat", () => {
  const { counter, hold } = session();
  [...sequence.slice(0, 6), "standing"].forEach(p => hold(p));
  assert.equal(counter.rakats.length, 1);
  sequence.slice(1).forEach(p => hold(p));
  assert.equal(counter.rakats.length, 2);
});

function points({ head = 0.1, shoulder = 0.24, hip = 0.5, knee = 0.7, ankle = 0.9 } = {}) {
  const result = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  for (const [indices, y] of [[[0], head], [[11, 12], shoulder], [[23, 24], hip], [[25, 26], knee], [[27, 28], ankle]]) {
    for (const index of indices) result[index].y = y;
  }
  return result;
}

test("synthetic normalized landmarks classify standard postures", () => {
  const calibration = standingCalibration(points());
  assert.ok(calibration);
  assert.equal(classifyPose(points(), calibration), "standing");
  assert.equal(classifyPose(points({ head: 0.51, shoulder: 0.5 }), calibration), "bow");
  assert.equal(classifyPose(points({ head: 0.48, shoulder: 0.58, hip: 0.8, knee: 0.82 }), calibration), "sitting");
  assert.equal(classifyPose(points({ head: 0.88, shoulder: 0.81, hip: 0.75, knee: 0.84 }), calibration), "sajdah");
  assert.equal(classifyPose(null, calibration), "unknown");
});

test("calibration and classification reject cropped, occluded or shifted views", () => {
  const calibration = standingCalibration(points());
  const cropped = points();
  cropped[0].y = -0.1;
  assert.equal(standingCalibration(cropped), null);
  assert.equal(classifyPose(cropped, calibration), "unknown");
  const occluded = points();
  occluded[25].visibility = 0.2;
  assert.equal(classifyPose(occluded, calibration), "unknown");
  assert.equal(classifyPose(points({ ankle: 0.6 }), calibration), "unknown");
  assert.equal(standingCalibration(points({ head: 0.51, shoulder: 0.5 })), null);
});

test("invalid observations and targets fail explicitly", () => {
  assert.throws(() => new RakatCounter(0), /Invalid/);
  assert.throws(() => new RakatCounter().observe("other", 0), /Invalid/);
  assert.throws(() => new RakatCounter().observe("standing", NaN), /Invalid/);
});

test("backwards, duplicate and negative timestamps fail rather than corrupting dwell time", () => {
  const counter = new RakatCounter();
  counter.observe("standing", 100);
  for (const time of [100, 99, -1, Infinity]) {
    assert.throws(() => counter.observe("standing", time), /Invalid/);
  }
});

test("exact 600ms dwell and 1000ms unknown thresholds are respected", () => {
  const counter = new RakatCounter();
  counter.observe("standing", 0);
  counter.observe("standing", 599);
  assert.equal(counter.phase, "standing");
  counter.observe("standing", 600);
  assert.equal(counter.phase, "bow");
  counter.observe("unknown", 700);
  counter.observe("unknown", 1699);
  assert.equal(counter.paused, false);
  counter.observe("unknown", 1700);
  assert.equal(counter.paused, true);
});

test("unexpected stable sequence pauses instead of stitching unrelated movements together", () => {
  for (const prefix of [
    ["standing", "sajdah"],
    ["standing", "bow", "sajdah"],
    ["standing", "bow", "standing", "sajdah", "standing"],
    ["standing", "bow", "standing", "sajdah", "sitting", "standing"],
  ]) {
    const { counter, hold } = session();
    prefix.forEach(p => hold(p));
    assert.equal(counter.paused, true);
    sequence.forEach(p => hold(p));
    assert.equal(counter.rakats.length, 0);
  }
});

test("transitional sitting before first sajdah is allowed", () => {
  const { counter, hold } = session();
  ["standing", "bow", "standing", "sitting", "sajdah", "sitting", "sajdah", "sitting"].forEach(p => hold(p));
  assert.equal(counter.rakats.length, 1);
  assert.equal(counter.paused, false);
});

test("long standing, ruku and sajdah holds never double count", () => {
  const { counter, hold } = session();
  sequence.forEach(p => hold(p, 10000));
  assert.equal(counter.rakats.length, 1);
  assert.equal(counter.sajdahs, 0);
});

test("brief unknown observations do not duplicate a held sajdah", () => {
  const { counter, hold } = session();
  sequence.slice(0, 4).forEach(p => hold(p));
  hold("unknown", 200);
  hold("sajdah");
  assert.equal(counter.sajdahs, 1);
  assert.equal(counter.phase, "between");
  assert.equal(counter.paused, false);
});

test("correction on empty sessions is safe; partials cannot survive an undo", () => {
  const { counter, hold } = session();
  counter.undoRakat();
  sequence.forEach(p => hold(p));
  sequence.slice(0, 4).forEach(p => hold(p));
  counter.undoRakat();
  assert.equal(counter.rakats.length, 0);
  assert.equal(counter.sajdahs, 0);
  assert.equal(counter.phase, "standing");
});

test("invalid calibration, nonfinite landmarks and confidence outside bounds are unknown", () => {
  for (const calibration of [
    {}, { height: NaN, hipY: 0.5, ankleY: 0.9 },
    { height: 0, hipY: 0.5, ankleY: 0.9 },
    { height: 0.8, hipY: 0.9, ankleY: 0.5 },
  ]) assert.equal(classifyPose(points(), calibration), "unknown");
  for (const change of [
    { x: Infinity }, { y: NaN }, { visibility: Infinity }, { visibility: 2 },
    { visibility: undefined }, { visibility: 0.649 },
  ]) {
    const pose = points();
    Object.assign(pose[11], change);
    assert.equal(standingCalibration(pose), null);
    assert.equal(classifyPose(pose, standingCalibration(points())), "unknown");
  }
});

test("normalized calibration tolerates moderate framing changes without fixed distance", () => {
  for (const [scale, offset] of [[0.7, 0.15], [0.9, 0.03]]) {
    const pose = points().map(point => ({ ...point, y: point.y * scale + offset }));
    const calibration = standingCalibration(pose);
    assert.ok(calibration);
    assert.equal(classifyPose(pose, calibration), "standing");
  }
});
