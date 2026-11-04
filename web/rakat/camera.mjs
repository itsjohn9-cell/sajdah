import {
  RakatCounter,
  standingCalibration,
  diagnosePlacement,
  selectPrimaryPose,
} from "./counter.mjs";
import { LightingMonitor } from "./lighting.mjs";
import { PoseEvidence, readNativeSensors, deviceIsMoving, sensorOrientation } from "./sensors.mjs";

const ALGORITHM_VERSION = "sensor-assisted-v3";

export function feedbackSnapshot() {
  return {
    sessionId, algorithmVersion: ALGORITHM_VERSION,
    target: counter.target, detectedRakat: counter.rakats.length,
    detectedSajdahs: counter.rakats.length * 2 + counter.sajdahs,
    interruptions, completed: counter.complete,
    transitions: transitions.map(item => ({ ...item })),
  };
}

export function getTransitions() {
  return transitions.map(item => ({ ...item }));
}

export function getLocalDiagnostics() {
  return {
    algorithmVersion: ALGORITHM_VERSION, mode: calibration?.mode ?? null,
    signal: { ...lastEvidence }, sensors: { ...latestSensors }, sensorError,
    rakats: counter.rakats.map(rakat => ({
      ...rakat, observed: { ...rakat.observed }, sources: [...(rakat.sources || [])],
    })),
  };
}

function cleanText(value, maximum) {
  return [...String(value)]
    .filter(character => {
      const code = character.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim()
    .slice(0, maximum);
}

export async function getFeedbackDiagnostics() {
  const cached = !stream && !starting ? lastSessionDiagnostics : null;
  const nativeInfo = readDeviceMetadata();
  let browserHints = {};
  if (typeof navigator !== "undefined" && navigator.userAgentData?.getHighEntropyValues) {
    try {
      browserHints = await navigator.userAgentData.getHighEntropyValues([
        "model", "platformVersion", "fullVersionList",
      ]);
    } catch (error) {
      console.error("Sajdah browser metadata unavailable", error);
      deviceMetadataError = "Detailed browser metadata unavailable.";
    }
  }
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  const androidVersion = /Android\s+([\d.]+)/i.exec(userAgent)?.[1] || "";
  const userAgentModel = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?\s*[;)]/i.exec(userAgent)?.[1]?.trim() || "";
  const browserMatch = /(Edg|SamsungBrowser|CriOS|Chrome|Firefox|Version)\/([\d.]+)/.exec(userAgent);
  const hintedBrowser = browserHints.fullVersionList?.find(item =>
    /Edge|Chrome|Chromium|Firefox|Safari/i.test(item.brand))?.version || "";
  const device = {
    manufacturer: nativeInfo.manufacturer || "",
    model: nativeInfo.model || browserHints.model || userAgentModel,
    osVersion: nativeInfo.osVersion || browserHints.platformVersion || androidVersion,
    appVersion: nativeInfo.appVersion || "",
    browserVersion: browserMatch ? `${browserMatch[1]} ${browserMatch[2]}` : hintedBrowser,
    webViewVersion: nativeInfo.webViewVersion || "",
    platform: nativeInfo.platform || browserHints.platform ||
      (/Android/i.test(userAgent) ? "Android" : typeof navigator === "undefined" ? "" : navigator.platform || ""),
  };
  if (!device.appVersion && typeof fetch === "function") {
    try {
      const response = await fetch(new URL("../version.json", import.meta.url), {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        deviceMetadataError = `App version lookup unavailable (HTTP ${response.status}).`;
      } else {
        const version = await response.json();
        device.appVersion = `${version.version || ""}${version.build_number ? `+${version.build_number}` : ""}`;
      }
    } catch (error) {
      console.error("Sajdah app version lookup failed", error);
      deviceMetadataError = "App version lookup unavailable.";
    }
  }

  const tracking = cached || feedbackTrackingSnapshot();
  return {
    trackingState: tracking.trackingState,
    status: tracking.status,
    placement: tracking.placement,
    calibrationMode: tracking.calibrationMode,
    calibrated: tracking.calibrated,
    phase: tracking.phase,
    lastPosture: tracking.lastPosture,
    lightingCondition: tracking.lightingCondition,
    sensorError: tracking.sensorError,
    deviceMetadataError,
    frameCounts: {
      camera: tracking.cameraFrames,
      pose: tracking.poseFrames,
      classified: tracking.classifiedFrames,
      unknown: tracking.unknownFrames,
      noPose: tracking.noPoseFrames,
      unclassifiedPose: tracking.unclassifiedPoseFrames,
      calibration: tracking.calibrationFrames,
      calibrationPose: tracking.calibrationPoseFrames,
      calibrationNoPose: tracking.calibrationNoPoseFrames,
      calibrationNotUpright: tracking.calibrationNotUprightFrames,
      calibrationUnstable: tracking.calibrationUnstableFrames,
      multiplePerson: tracking.multiplePersonFrames,
      lastPoseCount: tracking.lastPoseCount,
    },
    camera: {
      width: tracking.cameraWidth,
      height: tracking.cameraHeight,
      durationMs: tracking.cameraDurationMs,
      screenLightEnabled: tracking.screenLightEnabled,
      diagnosticRecordingEnabled: tracking.diagnosticRecordingEnabled,
      recordingSupported: tracking.recordingSupported,
    },
    sensorAvailability: tracking.sensorAvailability,
    device: Object.fromEntries(Object.entries(device).map(([key, value]) => [
      key, typeof value === "string" ? cleanText(value, 100) : "",
    ])),
    browser: userAgent.slice(0, 300),
    viewport: `${typeof innerWidth === "number" ? innerWidth : 0}x${typeof innerHeight === "number" ? innerHeight : 0}`,
    screen: {
      width: typeof screen === "undefined" ? 0 : screen.width,
      height: typeof screen === "undefined" ? 0 : screen.height,
      pixelRatio: typeof devicePixelRatio === "number" ? Math.min(8, Math.max(0.5, devicePixelRatio)) : 1,
    },
  };
}

export function getRecordedVideoUrl() {
  return recordedVideoUrl;
}

export function stopForFeedback() {
  if (stream || starting) stop("Camera stopped for feedback. Estimates retained.");
}

let previousSajdahCount = 0;
let previousRakatCount = 0;

function triggerHaptic(type = "light") {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      if (type === "sajdah") {
        navigator.vibrate([70, 50, 70]); // Double crisp pulse for Sajdah
      } else if (type === "rakat") {
        navigator.vibrate([150, 80, 200]); // Long celebration pulse for Rakat completion
      } else {
        navigator.vibrate(50); // Light tap
      }
    }
  } catch {}
}
let counter = new RakatCounter(2, { adaptive: true });
let stream = null;
const $ = id => (typeof document !== "undefined" && typeof document.getElementById === "function") ? document.getElementById(id) : null;
const video = $("video");
let detector = null;
let starting = false;
let generation = 0;
let frame = 0;
let calibration = null;
let calibrating = false;
let calibrationSince = null;
let baseline = null;
let baselineCondition = null;
let lastVideoTime = -1;
let lastInference = 0;
let frameWaitSince = null;
let sessionId = crypto.randomUUID();
let interruptions = 0;
let firstObservation = null;
let calibMultipleFrames = 0;
let multipleFrames = 0;
let multipleClearFrames = 0;  // counts consecutive non-multiple frames while paused by multi-person
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
let orientation = "unknown";
let devicePitch = null;
let deviceRoll = null;
let browserOrientation = null;
let browserMotion = null;
let latestSensors = {};
let sensorError = "";
let lastEvidence = { posture: "unknown", source: "none", released: false };
const poseEvidence = new PoseEvidence();
let calibrationPitch = null;
let calibrationRoll = null;
let lastPoseTime = 0;
let mediaRecorder = null;
let recordedChunks = [];
let recordedVideoUrl = null;
let statusText = "Camera off. Allow camera access only when you are ready.";
let lastSessionDiagnostics = null;
let deviceMetadataError = "";
let cameraStartedAt = null;
let cameraFrames = 0;
let poseFrames = 0;
let classifiedFrames = 0;
let unknownFrames = 0;
let noPoseFrames = 0;
let unclassifiedPoseFrames = 0;
let calibrationFrames = 0;
let calibrationPoseFrames = 0;
let calibrationNoPoseFrames = 0;
let calibrationNotUprightFrames = 0;
let calibrationUnstableFrames = 0;
let multiplePersonFrames = 0;
let lastPoseCount = 0;

function readDeviceMetadata() {
  if (!window.SijdaSensors || typeof window.SijdaSensors.getDeviceInfo !== "function") return {};
  try {
    const info = JSON.parse(window.SijdaSensors.getDeviceInfo());
    if (!info || typeof info !== "object" || Array.isArray(info)) {
      throw new Error("Invalid native device metadata");
    }
    return info;
  } catch (error) {
    console.error("Sajdah native device metadata unavailable", error);
    deviceMetadataError = "Native device details unavailable.";
    return {};
  }
}

function feedbackTrackingSnapshot() {
  const resolutionWidth = video?.videoWidth || 0;
  const resolutionHeight = video?.videoHeight || 0;
  const state = counter.complete ? "complete"
    : starting ? "starting"
      : calibrating ? "calibrating"
        : !stream ? "stopped"
          : counter.paused ? "paused" : "tracking";
  const available = key => Number.isFinite(latestSensors[key]);
  return {
    trackingState: state,
    status: cleanText(statusText, 300),
    placement: $("placement")?.value === "mat" ? "mat" : $("placement")?.value === "auto" ? "auto" : "unknown",
    calibrationMode: calibration?.mode || "none",
    calibrated: Boolean(calibration),
    cameraFrames, poseFrames, classifiedFrames, unknownFrames, noPoseFrames,
    unclassifiedPoseFrames, calibrationFrames, calibrationPoseFrames,
    calibrationNoPoseFrames, calibrationNotUprightFrames, calibrationUnstableFrames,
    multiplePersonFrames,
    lastPoseCount, lastPosture: lastEvidence.posture || "unknown",
    phase: counter.phase,
    cameraWidth: resolutionWidth, cameraHeight: resolutionHeight,
    cameraDurationMs: cameraStartedAt === null ? 0 : Math.min(
      86_400_000, Math.max(0, Math.round(performance.now() - cameraStartedAt)),
    ),
    lightingCondition: lightingMonitor.condition || "unknown",
    screenLightEnabled: screenLight,
    sensorAvailability: {
      camera: Boolean(stream),
      proximity: typeof latestSensors.proximity === "boolean",
      light: available("lux"),
      orientation: available("pitch") && available("roll"),
      accelerometer: available("acceleration"),
      gyroscope: available("rotationRate"),
    },
    diagnosticRecordingEnabled: Boolean($("record-test-video")?.checked),
    recordingSupported: typeof MediaRecorder !== "undefined",
    sensorError: cleanText(sensorError, 100),
  };
}

function resetFeedbackDiagnostics() {
  lastSessionDiagnostics = null;
  deviceMetadataError = "";
  cameraStartedAt = null;
  cameraFrames = poseFrames = classifiedFrames = unknownFrames = noPoseFrames = 0;
  unclassifiedPoseFrames = calibrationFrames = calibrationPoseFrames = 0;
  calibrationNoPoseFrames = calibrationNotUprightFrames = 0;
  calibrationUnstableFrames = multiplePersonFrames = 0;
  lastPoseCount = 0;
}

function resetEvidence() {
  poseEvidence.reset();
  lastEvidence = { posture: "unknown", source: "none", released: false };
}

function restartCurrentTracking() {
  counter.restartCurrent();
  resetEvidence();
  previousRakatCount = counter.rakats.length;
  previousSajdahCount = counter.rakats.length * 2;
}

function startRecording(mediaStream) {
  recordedChunks = [];
  if (recordedVideoUrl) {
    try { URL.revokeObjectURL(recordedVideoUrl); } catch {}
    recordedVideoUrl = null;
  }
  const recordCheckbox = $("record-test-video");
  const recordingStatus = $("recording-status");
  if (recordCheckbox && !recordCheckbox.checked) {
    if (recordingStatus) recordingStatus.textContent = "Diagnostic recording is off. No video is recorded or uploaded.";
    return;
  }
  if (typeof MediaRecorder === "undefined") {
    if (recordingStatus) recordingStatus.textContent = "This browser does not support local video recording. Camera counting can still be used.";
    return;
  }
  try {
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : MediaRecorder.isTypeSupported("video/mp4")
          ? "video/mp4"
          : "";
    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(mediaStream, options);
    mediaRecorder = recorder;
    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    recorder.onerror = event => {
      const error = event.error || new Error("Recording failed.");
      console.error("Sijda diagnostic video recording failed", error);
      if (recordingStatus) recordingStatus.textContent = `Local recording failed: ${error.message}. No video was uploaded.`;
    };
    recorder.onstop = () => {
      if (recordedChunks.length > 0) {
        const type = recorder.mimeType || "video/webm";
        const blob = new Blob(recordedChunks, { type });
        recordedVideoUrl = URL.createObjectURL(blob);
        const player = $("diagnostic-video-player");
        const downloadBtn = $("download-video-btn");
        const container = $("video-recording-container");
        if (player) player.src = recordedVideoUrl;
        if (downloadBtn) {
          downloadBtn.href = recordedVideoUrl;
          downloadBtn.download = `sijda-prayer-test-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`;
        }
        if (container) container.hidden = false;
        if (recordingStatus) recordingStatus.textContent = "Local recording ready to review or download. It stays on this device and is never uploaded.";
      } else if (recordingStatus && !recordingStatus.textContent.startsWith("Local recording failed:")) {
        recordingStatus.textContent = "No video data was recorded. Counting feedback can still be submitted.";
      }
    };
    recorder.start(1000);
    if (recordingStatus) recordingStatus.textContent = "Recording locally on this device. Stop the test to review or download; video is never uploaded.";
  } catch (error) {
    console.error("Sijda diagnostic video recording failed to start", error);
    if (recordingStatus) recordingStatus.textContent = `Local recording could not start: ${error.message}. Camera counting can still be used.`;
  }
}

function stopRecording(discard = false) {
  const recordingStatus = $("recording-status");
  if (discard) {
    recordedChunks = [];
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
    }
    if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
    recordedVideoUrl = null;
    const player = $("diagnostic-video-player");
    const downloadButton = $("download-video-btn");
    const container = $("video-recording-container");
    if (player) player.removeAttribute("src");
    if (downloadButton) downloadButton.removeAttribute("href");
    if (container) container.hidden = true;
    if (recordingStatus) recordingStatus.textContent = "Recording discarded. No video was uploaded.";
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch (error) {
      console.error("Sijda diagnostic video recording could not stop", error);
      if (recordingStatus) recordingStatus.textContent = `Local recording could not be finalized: ${error.message}.`;
    }
  }
  mediaRecorder = null;
}

if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("deviceorientation", event => {
    if (stream && Number.isFinite(event.beta) && Number.isFinite(event.gamma)) {
      browserOrientation = { pitch: event.beta, roll: event.gamma, time: performance.now() };
    }
  });
  window.addEventListener("devicemotion", event => {
    if (!stream) return;
    const a = event.acceleration;
    const g = event.accelerationIncludingGravity;
    const r = event.rotationRate;
    const vector = value => value && [value.x, value.y, value.z].every(Number.isFinite)
      ? Math.hypot(value.x, value.y, value.z) : null;
    const acceleration = vector(a);
    const gravity = vector(g);
    browserMotion = {
      acceleration: acceleration ?? (gravity === null ? null : Math.abs(gravity - 9.80665)),
      rotationRate: r && [r.alpha, r.beta, r.gamma].every(Number.isFinite)
        ? Math.hypot(r.alpha, r.beta, r.gamma) * Math.PI / 180 : null,
      time: performance.now(),
    };
  });
}

function setSensorsEnabled(enabled) {
  if (!window.SijdaSensors) return;
  try {
    if (!window.SijdaSensors.setEnabled(enabled)) throw new Error("Sensor access unavailable");
  } catch (error) {
    console.error("Sajdah sensor control failed", error);
    sensorError = "Native sensors unavailable; camera-only tracking.";
  }
}

function getSensorData(time) {
  let sensors = {};
  if (window.SijdaSensors && !sensorError) {
    try {
      sensors = readNativeSensors(window.SijdaSensors);
    } catch (error) {
      console.error("Sajdah sensor read failed", error);
      sensorError = "Native sensors unavailable; camera-only tracking.";
    }
  }
  if (browserOrientation && time - browserOrientation.time >= 0 && time - browserOrientation.time <= 1000) {
    sensors.pitch ??= browserOrientation.pitch;
    sensors.roll ??= browserOrientation.roll;
  }
  if (browserMotion && time - browserMotion.time >= 0 && time - browserMotion.time <= 1000) {
    sensors.acceleration ??= browserMotion.acceleration;
    sensors.rotationRate ??= browserMotion.rotationRate;
  }
  latestSensors = sensors;
  devicePitch = sensors.pitch ?? null;
  deviceRoll = sensors.roll ?? null;
  orientation = sensorOrientation(sensors);
  return sensors;
}

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
    if (calibrating && baselineCondition === null) {
      baselineCondition = condition;
    }
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
  secondSajdah: "Release detected. Waiting for second sajdah; sitting is verified only when visible.",
  exit: "Second sajdah detected. Waiting for sitting or standing.",
};

function status(message) {
  statusText = String(message);
  $("status").textContent = statusText;
}

function pauseForInterruption(reason) {
  if (!counter.paused) interruptions++;
  counter.pause(reason);
}

function render() {
  $("totals").textContent = `${counter.rakats.length} / ${counter.target} estimated rakat · ${counter.sajdahs} sajdahs in current rakat`;
  $("history").replaceChildren(...counter.rakats.map((rakat, i) => {
    const entry = document.createElement("li");
    const missing = Object.entries(rakat.observed || {}).filter(([, seen]) => !seen).map(([phase]) => phase);
    entry.textContent = `Rakat ${i + 1}: ${rakat.sajdahs} sajdahs · ${
      rakat.quality === "sequence-observed" ? "full sequence observed (estimate)" :
        `pair-based estimate; unverified: ${missing.join(", ") || "phase details"}`}`;
    if (rakat.sources?.length) entry.textContent += ` · evidence: ${rakat.sources.join(", ")}`;
    return entry;
  }));
  $("stop").disabled = !stream && !starting;
  $("start").disabled = Boolean(stream) || starting || counter.complete;
  $("target").disabled = Boolean(stream) || starting || counter.rakats.length > 0 || counter.phase !== "standing";
  $("placement").disabled = $("target").disabled;
  $("calibrate").disabled = !stream;
  $("resume").disabled = !stream || !calibration || !counter.paused;
  $("undo").disabled = counter.rakats.length === 0;
  lightButton.disabled = !stream;
  video.hidden = !stream;
  $("camera-placeholder").hidden = Boolean(stream);
  const activeSensors = ["camera"];
  if (typeof latestSensors.proximity === "boolean") activeSensors.push("proximity");
  if (Number.isFinite(latestSensors.lux)) activeSensors.push(`light (${Math.round(latestSensors.lux)} lux; guidance only)`);
  if (orientation !== "unknown") activeSensors.push("orientation");
  if (Number.isFinite(latestSensors.acceleration)) activeSensors.push("accelerometer");
  if (Number.isFinite(latestSensors.rotationRate)) activeSensors.push("gyroscope");
  $("sensor-status").textContent = !stream ? "Sensors off. Camera is required for counting."
    : `${sensorError || `Available: ${activeSensors.join(", ")}.`} Mode: ${calibration?.mode || "setup"}. Sensor-assisted v3.${
      Number.isFinite(latestSensors.lux) && latestSensors.lux < 10
        ? " Low ambient-light reading; inspect the preview or add room light." : ""}`;
  $("evidence-status").textContent = `Current evidence: ${lastEvidence.source}${
    lastEvidence.released ? " · proximity release; sitting unverified" : ""}. Recognition filters: 200 ms raised posture, 400 ms sajdah; shorter movements may be missed.`;
  $("enable-motion").hidden = Boolean(window.SijdaSensors);
  $("enable-motion").disabled = !stream;
  $("session-state").textContent = counter.complete
    ? "Target reached. Review the estimates below and report whether they were right."
    : starting ? "Starting camera. Not tracking yet."
      : !stream ? "Not tracking. Any estimates below are retained until you leave or start a new session."
        : calibrating ? "Setup in progress. Counting starts only after calibration."
          : counter.paused ? "Tracking paused. No new counts are being added."
            : "Tracking active. Counts below are estimates; review after your test.";
  if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
    const badges = document.querySelectorAll(".flow-badge");
    const phaseIndex = {
      standing: 0, bow: 1, upright: 2, firstSajdah: 3,
      between: 4, secondSajdah: 5, exit: 4,
    }[counter.phase] ?? 0;
    badges.forEach((b, i) => b.classList.toggle("active", i === phaseIndex));
  }
}

function stop(message = "Camera stopped. Review your estimates before continuing.") {
  status(message);
  lastSessionDiagnostics = feedbackTrackingSnapshot();
  stopRecording();
  setScreenLight(false);
  setSensorsEnabled(false);
  latestSensors = {};
  browserOrientation = browserMotion = null;
  resetEvidence();
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
  counter.pause("Camera stopped. Restart the current rakat after calibration.");
  cameraStartedAt = null;
  render();
}

async function start() {
  if (starting || stream || counter.complete) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    status("Camera unavailable. Open Sajdah over HTTPS in a camera-enabled browser. Manual counting remains available.");
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
        if (token === generation) {
          pauseForInterruption("Camera stream ended. Review estimates and enable camera again.");
          stop("Camera stream ended. Review estimates and enable camera again.");
        }
      });
    }
    video.srcObject = stream;
    await video.play();
    if (token !== generation) return;
    cameraStartedAt ??= performance.now();
    sensorError = "";
    setSensorsEnabled(true);
    startRecording(stream);
    starting = false;
    lastVideoTime = -1;
    lastInference = 0;
    frameWaitSince = null;
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
  restartCurrentTracking();
  calibMultipleFrames = multipleFrames = multipleClearFrames = 0;
  status("Stand upright in the camera view and keep the phone still for 1.5 seconds. Flat-mat mode can use an upper-body view.");
}

function loop(time) {
  if (!stream || !detector) return;
  try {
    frameWaitSince ??= time;
    if (time - (lastInference || frameWaitSince) > 1500) {
      if (calibrating) {
        calibrationSince = null;
        baseline = null;
        status("Camera frames stopped. Calibration is on hold. Check the preview or restart the camera.");
      } else if (!counter.paused) {
        resetEvidence();
        pauseForInterruption("Camera frames stopped. Restart the current rakat after checking the preview.");
        status(counter.reason);
        render();
      }
    }
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime && time - lastInference >= 100) {
      lastVideoTime = video.currentTime;
      lastInference = time;
      sampleLighting(time);
      const result = detector.detectForVideo(video, time);
      const { pose: points, isMultiple } = selectPrimaryPose(result.landmarks);
      cameraFrames++;
      lastPoseCount = Array.isArray(result.landmarks) ? result.landmarks.length : 0;
      if (points) poseFrames++;
      else noPoseFrames++;
      const sensorData = getSensorData(time);
      const changedAngle = calibration && Number.isFinite(calibrationPitch) && Number.isFinite(devicePitch) &&
        (Math.abs(devicePitch - calibrationPitch) > 15 ||
          (Number.isFinite(deviceRoll) && Number.isFinite(calibrationRoll) && Math.abs(deviceRoll - calibrationRoll) > 15));
      if (deviceIsMoving(sensorData) || changedAngle) {
        resetEvidence();
        calibrationSince = null;
        baseline = null;
        if (!calibrating) {
          calibration = null;
          pauseForInterruption("Phone moved. Recalibrate before continuing; completed estimates are kept.");
        }
        unknownFrames++;
        status(calibrating ? "Keep the phone still. Standing calibration restarted." : counter.reason);
        recordTransition(time, "unknown");
        render();
        frame = requestAnimationFrame(loop);
        return;
      }
      if (calibrating) {
        calibrationFrames++;
        if (isMultiple) {
          multiplePersonFrames++;
          calibMultipleFrames++;
          calibrationSince = null;
          baseline = null;
          if (calibMultipleFrames >= 8) {
            status("Setup: one person must be visible. Multiple people detected. Only one person should be in camera view.");
          }
          recordTransition(time, "unknown");
          render();
          frame = requestAnimationFrame(loop);
          return;
        } else {
          calibMultipleFrames = 0;
        }
        const sample = standingCalibration(points, {
          allowAdaptive: true, orientation, mode: $("placement").value === "mat" ? "mat" : undefined,
        });
        if (!sample) {
          if (points) calibrationNotUprightFrames++;
          else calibrationNoPoseFrames++;
        }
        const stable = sample && (!baseline ||
          (sample.mode === baseline.mode &&
           (!Number.isFinite(sample.hipY) || Math.abs(sample.hipY - baseline.hipY) < 0.06) &&
           Math.abs(sample.headY - baseline.headY) < 0.06));
        if (!stable) {
          if (sample) calibrationUnstableFrames++;
          calibrationSince = null;
          baseline = null;
          let guidance = "";
          const diag = diagnosePlacement({
            points,
            numPoses: result.landmarks.length,
            lightingCondition: lightingMonitor.condition,
            orientation,
            pitch: devicePitch,
            timeSinceLastDetection: time - lastPoseTime,
          });
          if (diag) guidance = ` Fix: ${diag.fix}`;
          status(`Setup: one person must be visible and upright. Keep head and shoulders in view; adjust distance, camera tilt or lighting.${guidance}`);
        } else {
          calibrationPoseFrames++;
          if (calibrationSince === null) { calibrationSince = time; baseline = sample; }
          status("Standing visible. Hold still for calibration...");
          if (time - calibrationSince >= 1500) {
            calibration = baseline;
            calibrationPitch = devicePitch;
            calibrationRoll = deviceRoll;
            calibrating = false;
            status("Calibrated. Stand upright to begin tracking.");
            render();
          }
        }
        render();
      } else if (counter.paused && !counter.complete &&
                 counter.reason === "Multiple people detected. Only one person should be in camera view." &&
                 calibration) {
        if (isMultiple) multiplePersonFrames++;
        if (!isMultiple && points) {
          multipleClearFrames++;
          if (multipleClearFrames >= 20) {
            multipleClearFrames = 0;
            multipleFrames = 0;
            restartCurrentTracking();
            status("Single person visible. Current partial rakat cleared; stand to restart. Completed estimates kept.");
            render();
          }
        } else {
          multipleClearFrames = 0;
        }
        recordTransition(time, "unknown");
      } else if (!counter.paused && !counter.complete) {
        if (isMultiple) {
          multiplePersonFrames++;
          const threshold = (counter.phase === "firstSajdah" || counter.phase === "between" || counter.phase === "secondSajdah" || counter.phase === "exit") ? 15 : 8;
          multipleFrames++;
          multipleClearFrames = 0;
          if (multipleFrames >= threshold) {
            pauseForInterruption("Multiple people detected. Only one person should be in camera view.");
            status(counter.reason);
          } else {
            unknownFrames++;
            counter.observe("unknown", time);
          }
          recordTransition(time, "unknown");
          resetEvidence();
          render();
          frame = requestAnimationFrame(loop);
          return;
        } else {
          multipleFrames = 0;
        }
        if (points) lastPoseTime = time;
        lastEvidence = poseEvidence.observe(points, calibration, sensorData, time);
        const { posture } = lastEvidence;
        if (posture === "unknown") {
          unknownFrames++;
          if (points) unclassifiedPoseFrames++;
        } else {
          classifiedFrames++;
        }
        const wasPaused = counter.paused;
        counter.observe(posture, time, lastEvidence);
        if (!wasPaused && counter.paused) interruptions++;
        recordTransition(time, posture);

        // Haptic feedback checks on Sajdah and Rakat boundaries
        const currentSajdahs = counter.rakats.length * 2 + counter.sajdahs;
        const currentRakats = counter.rakats.length;
        if (currentRakats > previousRakatCount) {
          triggerHaptic("rakat");
          previousRakatCount = currentRakats;
          previousSajdahCount = currentSajdahs;
        } else if (currentSajdahs > previousSajdahCount) {
          triggerHaptic("sajdah");
          previousSajdahCount = currentSajdahs;
        }
        let guidance = "";
        const isProstrating = posture === "sajdah" || counter.phase === "firstSajdah" ||
          counter.phase === "between" || counter.phase === "secondSajdah";
        if (counter.paused || (posture === "unknown" && !isProstrating) || time - lastPoseTime > 1500) {
          const diag = diagnosePlacement({
            points,
            numPoses: result.landmarks.length,
            lightingCondition: lightingMonitor.condition,
            orientation,
            pitch: devicePitch,
            timeSinceLastDetection: time - lastPoseTime,
            calibration,
            isProstrating,
          });
          if (diag) guidance = ` Fix: ${diag.fix}`;
        }
        status(counter.paused ? `${counter.reason}${guidance}` :
          counter.complete ? "Session target reached. Stop camera and review estimates." :
          posture === "unknown" ? (lastEvidence.released ? "Proximity release detected; sitting posture unverified."
            : `Tracking uncertain. No posture is being assumed.${guidance}`) :
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
  restartCurrentTracking();
  status("Partial detections cleared. Stand upright to restart the current rakat.");
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
  counter = new RakatCounter(Number($("target").value), { adaptive: true });
  previousRakatCount = previousSajdahCount = 0;
  sessionId = crypto.randomUUID();
  interruptions = 0;
  transitions.length = 0;
  firstObservation = null;
  resetFeedbackDiagnostics();
  status("New session. Enable the front camera when ready.");
  render();

});
$("target").addEventListener("change", () => {
  counter = new RakatCounter(Number($("target").value), { adaptive: true });
  render();
});
$("enable-motion").addEventListener("click", async () => {
  try {
    const apis = [window.DeviceOrientationEvent, window.DeviceMotionEvent].filter(Boolean);
    if (!apis.length) {
      $("motion-status").textContent = "Motion sensors are not supported here. Camera-only tracking remains available.";
      return;
    }
    const permissions = await Promise.all(apis.map(sensor =>
      typeof sensor.requestPermission === "function" ? sensor.requestPermission() : "granted"));
    if (permissions.some(permission => permission !== "granted")) throw new Error("Motion permission denied");
    $("motion-status").textContent = "Motion access requested. Availability is shown above when readings arrive; camera tracking continues without it.";
  } catch (error) {
    console.error("Sajdah motion permission failed", error);
    $("motion-status").textContent = `${error.message}. Camera-only tracking remains available.`;
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (stream || starting)) {
    pauseForInterruption("Page hidden: camera stopped. Recalibrate before continuing.");
    stop("Page hidden: camera stopped. Recalibrate before continuing.");
  }
});
window.addEventListener("pagehide", () => {
  if (stream || starting) pauseForInterruption("Page closed: camera stopped.");
  stop();
});
window.addEventListener("message", event => {
  if (event.origin === location.origin && event.source === window.parent &&
      event.data === "sijda-stop-camera") stop("Camera stopped after leaving the rakat screen.");
});
window.addEventListener("resize", () => {
  if (stream && !calibrating) {
    pauseForInterruption("View changed. Recalibrate before continuing.");
    calibration = null;
    status(counter.reason);
    render();
  }
});

export function openReviewPanel() {
  const panel = $("quick-review");
  if (!panel) return;
  panel.hidden = false;
  const comp = $("review-comparison");
  if (comp) {
    comp.textContent = `Sajdah detected: ${counter.rakats.length} rakat(s) and ${counter.sajdahs} partial sajdah(s).`;
  }
  const timelineEl = $("timeline-log");
  const countEl = $("timeline-count");
  if (timelineEl) {
    if (transitions.length === 0) {
      timelineEl.textContent = "No posture transitions recorded yet.";
    } else {
      timelineEl.textContent = transitions.map(t =>
        `+${(t.elapsedMs / 1000).toFixed(1)}s: ${t.posture.padEnd(8)} (phase: ${t.phase.padEnd(12)}, rakat: ${t.rakat}, sajdahs: ${t.sajdahs})`
      ).join("\n");
    }
  }
  if (countEl) countEl.textContent = String(transitions.length);
  if (typeof panel.scrollIntoView === "function") {
    panel.scrollIntoView({ behavior: "smooth" });
  }
}

const doneReviewBtn = $("done-review");
if (doneReviewBtn) {
  doneReviewBtn.addEventListener("click", () => {
    stop("Session finished for review. Check your test results below.");
    openReviewPanel();
  });
}

const recordCheckbox = $("record-test-video");
if (recordCheckbox) {
  recordCheckbox.addEventListener("change", () => {
    if (!recordCheckbox.checked) {
      stopRecording(true);
    } else if (stream) {
      startRecording(stream);
    } else {
      $("recording-status").textContent = "Recording will start when the camera starts. The clip stays on this device and is never uploaded.";
    }
  });
}

render();
