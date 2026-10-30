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

test("Replay real YouTube Fajr Walkthrough video (hndtN2NH4uc): 100% natural end-to-end 2 Rakats and 4 Sajdahs", () => {
  const fixturePath = path.resolve("test/fixtures/fajr_prayer_walkthrough_landmarks.json");
  assert.ok(fs.existsSync(fixturePath), "Fixture fajr_prayer_walkthrough_landmarks.json must exist");

  const data = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(data.totalFramesExtracted, 1529);

  // 1. Calibrate on the initial standing pose (at 22400ms)
  const calFrame = data.frames.find(f => f.timeMs === 22400);
  assert.ok(calFrame, "Calibration frame at 22400ms must exist");
  const { pose: calPose } = selectPrimaryPose(calFrame.poses);
  assert.ok(calPose, "Calibration pose must be detected");

  const cal = standingCalibration(calPose, { allowAdaptive: true });
  assert.ok(cal, "standingCalibration must succeed");
  assert.equal(cal.mode, "upper");
  assert.ok(cal.torsoSpan > 0, "torsoSpan must be populated");

  // 2. Initialize 2-Rakat counter in adaptive mode
  const counter = new RakatCounter(2, { adaptive: true });

  // 3. Replay raw extracted frames without any synthetic fills
  for (const frame of data.frames) {
    if (frame.timeMs < 22400) continue;

    const { pose } = selectPrimaryPose(frame.poses);
    let posture = "unknown";
    if (pose) {
      posture = classifyPose(pose, cal, { mode: cal.mode, allowPartial: true });
    }

    counter.observe(posture, frame.timeMs);
    if (counter.complete) break;
  }

  // 4. Assert end-to-end success
  assert.equal(counter.rakats.length, 2, "Must complete exactly 2 Rakats");
  assert.equal(counter.rakats[0].sajdahs, 2, "Rakat 1 must contain 2 Sajdahs");
  assert.equal(counter.rakats[1].sajdahs, 2, "Rakat 2 must contain 2 Sajdahs");
  assert.equal(counter.complete, true, "Prayer session must be marked complete");
  assert.equal(counter.paused, false, "Counter must not pause during valid prayer");
});

