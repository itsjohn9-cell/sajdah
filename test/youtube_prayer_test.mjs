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

test("Tutorial replay cannot use bow noise as jalsah or bridge a 5.4-second tracking gap", () => {
  const fixturePath = path.resolve("test/fixtures/prayer_2rakat_landmarks.json");
  assert.ok(fs.existsSync(fixturePath), "Fixture prayer_2rakat_landmarks.json must exist");

  const data = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  assert.equal(data.totalFramesExtracted, 1549);

  // 1. Calibrate on the initial standing pose (at 7600ms)
  const calFrame = data.frames.find(f => f.timeMs === 7600);
  assert.ok(calFrame, "Calibration frame at 7600ms must exist");
  const { pose: calPose } = selectPrimaryPose(calFrame.poses);
  assert.ok(calPose, "Calibration pose must be detected");

  const cal = standingCalibration(calPose, { allowAdaptive: true });
  assert.ok(cal, "standingCalibration must succeed");
  assert.equal(cal.mode, "side");
  assert.ok(cal.torsoSpan > 0, "torsoSpan must be populated for graceful upper-body fallback");

  // 2. Initialize 2-Rakat counter
  const counter = new RakatCounter(2, { adaptive: true });

  // 3. Replay extracted frames (starting after calibration completes at 7600ms)
  for (const frame of data.frames) {
    if (frame.timeMs < 7600) continue;

    const { pose } = selectPrimaryPose(frame.poses);
    let posture = "unknown";
    if (pose) {
      posture = classifyPose(pose, cal, { mode: cal.mode, allowPartial: true });
    }

    // In the educational YouTube video, the camera cuts away to full-screen 2D Quranic
    // recitation text while the demonstrator is reciting Surah Al-Fatiha (standing)
    // and during the final Tashahhud / Salaam (sitting).
    // In real life prayer, the human worshipper is physically standing / sitting throughout.
    if (posture === "unknown") {
      if ((frame.timeMs >= 11200 && frame.timeMs <= 67800) ||
          (frame.timeMs >= 116600 && frame.timeMs <= 172800)) {
        posture = "standing";
      } else if (frame.timeMs >= 220200 && frame.timeMs <= 265600) {
        posture = "sitting";
      }
    }

    counter.observe(posture, frame.timeMs);
    if (counter.complete) break;
  }

  // The first separator is only bow-like noise; later classification is unknown
  // continuously from 193400 through 198800 ms. Neither can establish jalsah.
  assert.equal(counter.rakats.length, 0);
  assert.equal(counter.sajdahs, 1);
  assert.equal(counter.complete, false);
  assert.equal(counter.paused, true);
  assert.match(counter.reason, /Body tracking lost/);
});
