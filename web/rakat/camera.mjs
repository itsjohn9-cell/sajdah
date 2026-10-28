import { RakatCounter, standingCalibration, classifyPose } from "./counter.mjs";
import { LightingMonitor } from "./lighting.mjs";

export function feedbackSnapshot() {
  return {
    sessionId, algorithmVersion: "pose-heuristic-v2",
    target: counter.target, detectedRakat: counter.rakats.length,
    detectedSajdahs: counter.rakats.length * 2 + counter.sajdahs,
    interruptions, completed: counter.complete,
    transitions: transitions.map(item => ({ ...item })),
  };
}

export function stopForFeedback() {
  if (stream || starting) stop("Camera stopped for feedback. Estimates retained.");
}

const $ = id => document.getElementById(id);
const video = $("video");
let counter = new RakatCounter();
let stream = null;
let detector = null;
let starting = false;
let generation = 0;
let frame = 0;
let calibration = null;
let calibrating = false;
let calibrationSince = null;
let baseline = null;
let lastVideoTime = -1;
let lastInference = 0;
let sessionId = crypto.randomUUID();
let interruptions = 0;
let firstObservation = null;
const transitions = [];
const lightButton = $("screen-light");
const lightStatus = $("screen-light-status");
const lightingStatus = $("lighting-status");
const lightCanvas = document.createElement("canvas");
lightCanvas.width = 32;
lightCanvas.height = 24;
let lightContext = null;
let lightingMonitor = new LightingMonitor();
let lastLightSample = null;
let lightingFailed = false;
let screenLight = false;

function setScreenLight(enabled) {
  screenLight = enabled;
  document.body.classList.toggle("screen-light", enabled);
  lightButton.setAttribute("aria-pressed", String(enabled));
  lightButton.textContent = enabled ? "Turn screen light off" : "Turn screen light on";
  if (window.SijdaLighting) {
    try {
      const applied = window.SijdaLighting.setEnabled(enabled);
      if (!applied) {
        lightStatus.textContent = enabled
          ? "White screen enabled, but Android brightness could not be raised. Adjust brightness manually."
          : "Screen light off, but brightness restoration could not be confirmed. Adjust brightness manually.";
        return;
      }
    } catch (error) {
      console.error("Sijda window brightness failed", error);
      lightStatus.textContent = "Window brightness control failed. Adjust brightness manually.";
      return;
    }
  }
  lightStatus.textContent = enabled
    ? window.SijdaLighting
      ? "Steady white screen enabled with temporary Android brightness. Limited range; stop restores brightness."
      : "Steady white screen enabled. This browser cannot raise display brightness; adjust it manually if comfortable."
    : "Screen light off. This can help nearby, but cannot guarantee tracking in darkness. Uses extra battery.";
}

function sampleLighting(time) {
  if (lightingFailed || (lastLightSample !== null && time - lastLightSample < 1000)) return;
  lastLightSample = time;
  try {
    lightContext ??= lightCanvas.getContext("2d", { willReadFrequently: true });
    if (!lightContext) throw new Error("Preview sampling is unavailable.");
    lightContext.drawImage(video, 0, 0, 32, 24);
    const condition = lightingMonitor.observe(lightContext.getImageData(0, 0, 32, 24).data);
    lightingStatus.textContent = condition === "dim"
      ? "Low-light warning: the preview is mostly dark. Try the optional screen light or a room light. If tracking stays uncertain, use manual counting."
      : condition === "uneven"
        ? "Uneven-light warning: a bright background may hide your body. Turn toward a light or adjust placement."
        : "Preview lighting check only: no persistent dark-frame warning. This does not confirm your body is visible or counting is accurate.";
  } catch (error) {
    console.error("Sijda lighting check failed", error);
    lightingFailed = true;
    lightingStatus.textContent = "Lighting check unavailable. Inspect the preview yourself; no lighting quality is being assumed.";
  }
}

function recordTransition(time, posture) {
  firstObservation ??= time;
  const last = transitions.at(-1);
  if (!last || last.posture !== posture || last.phase !== counter.phase ||
      last.paused !== counter.paused) {
    if (transitions.length < 500) transitions.push({
      elapsedMs: Math.round(time - firstObservation), posture, phase: counter.phase,
      paused: counter.paused, rakat: counter.rakats.length, sajdahs: counter.sajdahs,
    });
  }
}

const phaseLabels = {
  standing: "Stand upright to begin the current rakat.",
  bow: "Standing detected. Waiting for ruku.",
  upright: "Ruku detected. Waiting for standing.",
  firstSajdah: "Waiting for first sajdah.",
  between: "First sajdah detected. Waiting for sitting.",
  secondSajdah: "Sitting detected. Waiting for second sajdah.",
  exit: "Second sajdah detected. Waiting for sitting or standing.",
};

function status(message) { $("status").textContent = message; }

function render() {
  $("totals").textContent = `${counter.rakats.length} / ${counter.target} estimated rakat · ${counter.sajdahs} sajdahs in current rakat`;
  $("history").replaceChildren(...counter.rakats.map((rakat, i) => {
    const entry = document.createElement("li");
    entry.textContent = `Rakat ${i + 1}: ${rakat.sajdahs} sajdahs detected (estimate)`;
    return entry;
  }));
  $("stop").disabled = !stream && !starting;
  $("start").disabled = Boolean(stream) || starting || counter.complete;
  $("target").disabled = Boolean(stream) || starting || counter.rakats.length > 0 || counter.phase !== "standing";
  $("calibrate").disabled = !stream;
  $("resume").disabled = !stream || !calibration || !counter.paused;
  $("undo").disabled = counter.rakats.length === 0;
  lightButton.disabled = !stream;
  video.hidden = !stream;
  $("camera-placeholder").hidden = Boolean(stream);
  $("session-state").textContent = counter.complete
    ? "Target reached. Review the estimates below and report whether they were right."
    : starting ? "Starting camera. Not tracking yet."
      : !stream ? "Not tracking. Any estimates below are retained until you leave or start a new session."
        : calibrating ? "Setup in progress. Counting starts only after calibration."
          : counter.paused ? "Tracking paused. No new counts are being added."
            : "Tracking active. Counts below are estimates; review after your test.";
}

function stop(message = "Camera stopped. Review your estimates before continuing.") {
  setScreenLight(false);
  lightingStatus.textContent = "Lighting check off. Camera frames are sampled only on-device while tracking.";
  generation++;
  starting = false;
  cancelAnimationFrame(frame);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  if (detector) detector.close();
  detector = null;
  calibration = null;
  calibrating = false;
  interruptions++;
  counter.pause("Camera stopped. Restart the current rakat after calibration.");
  status(message);
  render();
}

async function start() {
  if (starting || stream || counter.complete) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status("Camera unavailable. Open Sijda over HTTPS in a camera-enabled browser. Manual counting remains available.");
    return;
  }
  starting = true;
  const token = ++generation;
  render();
  status("Loading the on-device pose model and requesting the front camera...");
  try {
    const { FilesetResolver, PoseLandmarker } = await import("../vendor/mediapipe/vision_bundle.mjs");
    if (token !== generation) return;
    const files = await FilesetResolver.forVisionTasks("../vendor/mediapipe/wasm");
    if (token !== generation) return;
    const loaded = await PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: "../vendor/mediapipe/pose_landmarker_lite.task", delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 2,
      minPoseDetectionConfidence: 0.65,
      minPosePresenceConfidence: 0.65,
      minTrackingConfidence: 0.65,
    });
    if (token !== generation) { loaded.close(); return; }
    detector = loaded;
    const acquired = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (token === generation) stop("Camera stream ended. Review estimates and enable camera again.");
      });
    }
    video.srcObject = stream;
    await video.play();
    if (token !== generation) return;
    starting = false;
    lastVideoTime = -1;
    lastInference = 0;
    lastLightSample = null;
    lightingFailed = false;
    lightingMonitor = new LightingMonitor();
    beginCalibration();
    render();
    frame = requestAnimationFrame(loop);
  } catch (error) {
    if (token === generation) {
      console.error("Sijda camera startup failed", error);
      stop(`Camera/model could not start: ${error.message}. Check camera permission, browser support and model loading; use manual counting if unavailable.`);
    }
  }
}

function beginCalibration() {
  calibration = null;
  baseline = null;
  calibrationSince = null;
  calibrating = true;
  counter.restartCurrent();
  status("Stand upright with your full body visible and hold still for 1.5 seconds.");
}

function loop(time) {
  if (!stream || !detector) return;
  try {
    if (lastInference > 0 && time - lastInference > 1500) {
      if (calibrating) {
        calibrationSince = null;
        baseline = null;
      } else if (!counter.paused) {
        counter.pause("Camera frames stopped. Restart the current rakat after checking the preview.");
        status(counter.reason);
        render();
      }
    }
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime && time - lastInference >= 100) {
      lastVideoTime = video.currentTime;
      lastInference = time;
      sampleLighting(time);
      const result = detector.detectForVideo(video, time);
      const points = result.landmarks.length === 1 ? result.landmarks[0] : null;
      if (calibrating) {
        const sample = standingCalibration(points);
        const stable = sample && (!baseline ||
          (Math.abs(sample.hipY - baseline.hipY) < 0.03 &&
           Math.abs(sample.height - baseline.height) < 0.04));
        if (!stable) {
          calibrationSince = null;
          baseline = null;
          status("Setup: one full body must be visible and upright. Adjust distance, camera tilt or lighting.");
        } else {
          if (calibrationSince === null) { calibrationSince = time; baseline = sample; }
          status("Standing visible. Hold still for calibration...");
          if (time - calibrationSince >= 1500) {
            calibration = baseline;
            calibrating = false;
            status("Calibrated. Stand upright to begin tracking.");
          }
        }
      } else if (!counter.paused && !counter.complete) {
        const posture = classifyPose(points, calibration);
        counter.observe(posture, time);
        recordTransition(time, posture);
        status(counter.paused ? counter.reason :
          counter.complete ? "Session target reached. Stop camera and review estimates." :
          posture === "unknown" ? "Tracking uncertain. No posture is being assumed." :
          phaseLabels[counter.phase]);
        render();
        if (counter.complete) {
          stop("Session target reached. Camera stopped. Review each rakat estimate.");
          return;
        }
      }
    }
    frame = requestAnimationFrame(loop);
  } catch (error) {
    console.error("Sijda pose inference failed", error);
    stop(`Tracking failed: ${error.message}. Estimates retained for review; no count inferred.`);
  }
}

$("start").addEventListener("click", start);
lightButton.addEventListener("click", () => {
  if (stream) setScreenLight(!screenLight);
});
$("stop").addEventListener("click", () => stop());
$("calibrate").addEventListener("click", () => {
  if (!confirm("Recalibrate and clear partial detections for the current rakat? Completed estimates are kept.")) return;
  beginCalibration();
  render();
});
$("resume").addEventListener("click", () => {
  counter.restartCurrent();
  status("Current partial rakat cleared. Stand upright to restart detection.");
  render();
});
$("undo").addEventListener("click", () => {
  if (!confirm("Remove the last estimated rakat and clear current partial detections?")) return;
  counter.undoRakat();
  if (stream) beginCalibration();
  status("Last estimate removed. Calibrate standing before continuing.");
  render();
});
$("reset").addEventListener("click", () => {
  if (!confirm("Clear this automatic session? Manual and qaza counts will not change.")) return;
  stop();
  counter = new RakatCounter(Number($("target").value));
  sessionId = crypto.randomUUID();
  interruptions = 0;
  transitions.length = 0;
  firstObservation = null;
  status("New session. Enable the front camera when ready.");
  render();

});
$("target").addEventListener("change", () => {
  counter = new RakatCounter(Number($("target").value));
  render();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (stream || starting)) stop("Page hidden: camera stopped. Recalibrate before continuing.");
});
window.addEventListener("pagehide", () => stop());
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === window.parent &&
      event.data === "sijda-stop-camera") stop("Camera stopped after leaving the rakat screen.");
});
window.addEventListener("resize", () => {
  if (stream && !calibrating) {
    counter.pause("View changed. Recalibrate before continuing.");
    calibration = null;
    status(counter.reason);
    render();
  }
});
render();
