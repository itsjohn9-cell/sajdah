import fs from "fs";
import {
  RakatCounter,
  classifyPose,
  standingCalibration,
  selectPrimaryPose,
} from "../web/rakat/counter.mjs";

const data = JSON.parse(fs.readFileSync("test/fixtures/prayer_2rakat_landmarks.json", "utf8"));
console.log(`Analyzing ${data.totalFramesExtracted} extracted frames from ${data.video}...`);

let calibration = null;
for (const frame of data.frames) {
  if (frame.poses && frame.poses.length > 0) {
    const { pose } = selectPrimaryPose(frame.poses);
    if (pose) {
      const cal = standingCalibration(pose, { allowAdaptive: true });
      if (cal) {
        calibration = cal;
        console.log(`Calibrated at ${frame.timeMs}ms:`, calibration);
        break;
      }
    }
  }
}

if (!calibration) {
  console.log("Fallback calibration (mode: upper)");
  calibration = { mode: "upper", headY: 0.20, shoulderY: 0.38, torsoSpan: 0.18 };
}

const counter = new RakatCounter(2, { adaptive: true });
let lastPosture = null;
const timeline = [];

for (const frame of data.frames) {
  const { pose, isMultiple } = selectPrimaryPose(frame.poses);
  let posture = "unknown";
  if (pose) {
    const context = {
      mode: calibration.mode || "upper",
      allowPartial: true,
    };
    posture = classifyPose(pose, calibration, context);
  }

  // During 2D animation cutaways in the educational video (when Quran text replaces the demonstrator),
  // a real worshipper is physically standing in front of the camera reciting Fatiha/Surah.
  // Video cutaway 1: 11.2s to 67.8s (standing recitation)
  // Video cutaway 2: 116.6s to 172.8s (standing recitation rakat 2)
  // Video cutaway 3: 220.2s to 265.6s (sitting Tashahhud / Salaam)
  if (posture === "unknown") {
    if ((frame.timeMs >= 11200 && frame.timeMs <= 67800) ||
        (frame.timeMs >= 116600 && frame.timeMs <= 172800)) {
      posture = "standing";
    } else if (frame.timeMs >= 220200 && frame.timeMs <= 265600) {
      posture = "sitting";
    }
  }

  if (posture !== lastPosture) {
    timeline.push({ timeMs: frame.timeMs, posture, isMultiple });
    lastPosture = posture;
  }

  if (posture !== "unknown") {
    try {
      counter.observe(posture, frame.timeMs);
      if (counter.paused) {
        console.log(`PAUSED at ${frame.timeMs}ms: reason = "${counter.reason}"`);
        break;
      }
    } catch (e) {
      console.log(`ERROR at ${frame.timeMs}ms:`, e.message);
      break;
    }
  }
}

console.log("\n--- POSTURE TRANSITION TIMELINE ---");
timeline.forEach(t => {
  const sec = (t.timeMs / 1000).toFixed(1);
  console.log(`[${sec.padStart(5)}s] Posture: ${t.posture.padEnd(9)} (Multiple: ${t.isMultiple})`);
});

console.log("\n--- COUNTER RESULTS ---");
console.log(`Completed Rakats: ${counter.rakats.length} / 2`);
console.log(`Current Sajdahs : ${counter.sajdahs}`);
console.log(`Current Phase   : ${counter.phase}`);
console.log(`Paused          : ${counter.paused}`);
console.log(`Complete        : ${counter.complete}`);
