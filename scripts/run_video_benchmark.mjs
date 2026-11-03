#!/usr/bin/env node
import { performance } from "perf_hooks";
import {
  RakatCounter,
  estimateFaceScale,
  selectPrimaryPose,
} from "../web/rakat/counter.mjs";
import { PoseEvidence } from "../web/rakat/sensors.mjs";
import { BENCHMARK_SCENARIOS } from "../test/fixtures/video_benchmark_scenarios.mjs";

console.log("================================================================================");
console.log("             🕋 SAJDAH COMPUTER VISION & POSE BENCHMARK SUITE                  ");
console.log("================================================================================");
console.log(`Synthetic scenarios       : ${BENCHMARK_SCENARIOS.length} (not camera recordings or field accuracy)`);
console.log(`Placement Modes Tested    : Mat Floor (0°-15°), Propped (30°), Side (90°), Front Distance`);
console.log(`Optical Conditions Tested : Screen Light, Tile Reflections, Flowing Cloth, Backlight`);
console.log("================================================================================\n");

let passed = 0;
let failed = 0;
let totalFrames = 0;
let pauses = 0;
const tStart = performance.now();

console.log(
  "ID    Scenario Name                                        Category       Rakats  Frames  Status"
);
console.log(
  "--------------------------------------------------------------------------------"
);

for (const scenario of BENCHMARK_SCENARIOS) {
  const counter = new RakatCounter(scenario.targetRakats, { adaptive: true });
  const dataset = scenario.generate();
  const evidence = new PoseEvidence();
  const calibration = {
    ...scenario.calibration,
    faceScale: estimateFaceScale(selectPrimaryPose(dataset.frames[0].poses).pose),
  };
  totalFrames += dataset.frames.length;

  let failedReason = null;

  for (const frame of dataset.frames) {
    const { pose, isMultiple } = selectPrimaryPose(frame.poses);
    if (isMultiple) {
      failedReason = `Multiple people falsely detected at ${frame.timeMs}ms`;
      break;
    }
    const signal = evidence.observe(pose, calibration, frame.context, frame.timeMs);
    counter.observe(signal.posture, frame.timeMs, signal);
    if (counter.paused) {
      pauses++;
      failedReason = `Paused at ${frame.timeMs}ms: ${counter.reason}`;
      break;
    }
  }

  if (!failedReason && counter.rakats.length !== dataset.expectedRakats) {
    failedReason = `Rakat count mismatch: expected ${dataset.expectedRakats}, got ${counter.rakats.length}`;
  }

  if (!failedReason && counter.complete !== dataset.expectedComplete) {
    failedReason = `Completion mismatch: expected ${dataset.expectedComplete}, got ${counter.complete}`;
  }

  const idCol = scenario.id.padEnd(5);
  const nameCol = scenario.name.length > 50 ? scenario.name.slice(0, 47) + "..." : scenario.name.padEnd(51);
  const catCol = scenario.category.padEnd(14);
  const rakatCol = `${counter.rakats.length}/${scenario.targetRakats}`.padEnd(7);
  const frameCol = String(dataset.frames.length).padStart(6) + "  ";

  if (!failedReason) {
    passed++;
    console.log(`${idCol} ${nameCol} ${catCol} ${rakatCol} ${frameCol} \x1b[32m✔ PASS\x1b[0m`);
  } else {
    failed++;
    console.log(`${idCol} ${nameCol} ${catCol} ${rakatCol} ${frameCol} \x1b[31m✖ FAIL\x1b[0m`);
    console.log(`      \x1b[31m-> ${failedReason}\x1b[0m`);
  }
}

const totalTime = ((performance.now() - tStart) / 1000).toFixed(2);
const accuracyPct = ((passed / BENCHMARK_SCENARIOS.length) * 100).toFixed(1);

console.log("\n================================================================================");
console.log(`RESULTS SUMMARY: ${passed}/${BENCHMARK_SCENARIOS.length} Scenarios Passed (${accuracyPct}%)`);
console.log(`Processed Frames : ${totalFrames} frames in ${totalTime}s`);
console.log(`Observed Pauses  : ${pauses} (not a measured field false-pause rate)`);
console.log(`Overall Status   : ${failed === 0 ? "\x1b[32m✔ SYNTHETIC SCENARIOS PASS; DEVICE VALIDATION STILL REQUIRED\x1b[0m" : "\x1b[31m✖ REGRESSIONS DETECTED\x1b[0m"}`);
console.log("================================================================================\n");

if (failed > 0) {
  process.exit(1);
}
