import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  RakatCounter,
  classifyPose,
  standingCalibration,
  selectPrimaryPose,
} from "../web/rakat/counter.mjs";

test("Tutorial landmark replay with missing second jalsah cannot fabricate a completed target", () => {
  const fixturePath = path.resolve("test/fixtures/fajr_men_beginners_landmarks.json");
  assert.ok(fs.existsSync(fixturePath), "Fixture fajr_men_beginners_landmarks.json must exist");

  const data = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(data.totalFramesExtracted, 1282);

  // 1. Calibrate on the initial standing pose (at frame 0)
  const { pose: calPose } = selectPrimaryPose(data.frames[0].poses);
  assert.ok(calPose, "Calibration pose must be detected");

  const cal = standingCalibration(calPose, { allowAdaptive: true });
  assert.ok(cal, "standingCalibration must succeed");
  assert.equal(cal.mode, "full");
  assert.ok(cal.torsoSpan > 0, "torsoSpan must be populated");

  // 2. Initialize 2-Rakat counter in adaptive mode
  const counter = new RakatCounter(2, { adaptive: true });

  // 3. Replay raw extracted frames with recitation card continuity
  for (const frame of data.frames) {
    const { pose } = selectPrimaryPose(frame.poses);
    let posture = "unknown";
    if (pose) {
      posture = classifyPose(pose, cal, { mode: cal.mode, allowPartial: true });
    }

    // In beginner guide videos, full-screen recitation title cards replace the video
    // while the worshipper is standing reciting Fatiha/Surah or sitting in Tashahhud.
    if (posture === "unknown") {
      if (frame.timeMs >= 10000 && frame.timeMs <= 46000) posture = "standing";
      if (frame.timeMs >= 98000 && frame.timeMs <= 125000) posture = "standing";
      if (frame.timeMs >= 165000 && frame.timeMs <= 220000) posture = "sitting";
    }

    counter.observe(posture, frame.timeMs);
    if (counter.complete) break;
  }

  // The second separator has only isolated bow frames separated by unknown tracking.
  // Title-card substitutions above are not camera observations or accuracy evidence.
  assert.equal(counter.rakats.length, 1);
  assert.equal(counter.rakats[0].sajdahs, 2, "Rakat 1 must contain 2 Sajdahs");
  assert.equal(counter.complete, false);
  assert.equal(counter.paused, true);
  assert.match(counter.reason, /Body tracking lost/);
});
