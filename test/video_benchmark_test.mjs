import test from "node:test";
import assert from "node:assert/strict";
import {
  RakatCounter,
  estimateFaceScale,
  selectPrimaryPose,
} from "../web/rakat/counter.mjs";
import { PoseEvidence } from "../web/rakat/sensors.mjs";
import { BENCHMARK_SCENARIOS } from "./fixtures/video_benchmark_scenarios.mjs";

test("Synthetic landmark scenarios: sensor fusion and live adaptive counter", async (t) => {
  const results = [];

  for (const scenario of BENCHMARK_SCENARIOS) {
    await t.test(`${scenario.id}: ${scenario.name} [${scenario.category}]`, () => {
      const counter = new RakatCounter(scenario.targetRakats, { adaptive: true });
      const dataset = scenario.generate();
      const evidence = new PoseEvidence();
      const calibration = {
        ...scenario.calibration,
        faceScale: estimateFaceScale(selectPrimaryPose(dataset.frames[0].poses).pose),
      };

      let postureTransitions = 0;
      let lastPosture = null;

      for (const frame of dataset.frames) {
        // 1. Primary pose selection (verifies reflection and ghost-pose rejection)
        const { pose, isMultiple } = selectPrimaryPose(frame.poses);
        
        assert.equal(
          isMultiple,
          false,
          `Frame at ${frame.timeMs}ms in scenario ${scenario.id} falsely triggered multiple people`
        );

        // 2. Posture classification across placement modes
        const signal = evidence.observe(pose, calibration, frame.context, frame.timeMs);
        const { posture } = signal;
        if (posture !== lastPosture) {
          postureTransitions++;
          lastPosture = posture;
        }

        // 3. Counter observation and progression
        counter.observe(posture, frame.timeMs, signal);

        // Invariant: No false pauses
        assert.equal(
          counter.paused,
          false,
          `Counter unexpectedly paused at ${frame.timeMs}ms in ${scenario.id}: "${counter.reason}"`
        );
      }

      // Ground truth assertions
      assert.equal(
        counter.rakats.length,
        dataset.expectedRakats,
        `Expected ${dataset.expectedRakats} completed rakats in ${scenario.id}, got ${counter.rakats.length}`
      );

      assert.equal(
        counter.complete,
        dataset.expectedComplete,
        `Expected complete=${dataset.expectedComplete} in ${scenario.id}`
      );

      results.push({
        id: scenario.id,
        name: scenario.name,
        category: scenario.category,
        rakats: `${counter.rakats.length}/${scenario.targetRakats}`,
        passed: true,
        transitions: postureTransitions,
      });
    });
  }

  assert.equal(results.length, BENCHMARK_SCENARIOS.length);
  assert.ok(results.every(r => r.passed));
});
