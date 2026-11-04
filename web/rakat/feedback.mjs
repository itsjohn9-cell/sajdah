import { feedbackSnapshot, getFeedbackDiagnostics, stopForFeedback } from "./camera.mjs";
import { validateFeedback, uploadFeedback } from "./feedback_service.mjs";

const form = document.getElementById("feedback-form");
const message = document.getElementById("feedback-status");
const button = document.getElementById("submit-feedback");
const sample = {
  sample: true, verdict: "incorrect", expectedRakat: 2, expectedSajdahs: 4,
  detectedRakat: 1, detectedSajdahs: 3, placement: "floor-tilted",
  distance: "1-2m", lighting: "dim", device: "Example Android phone / Chrome",
  notes: "SAMPLE ONLY: head left the frame in the second sajdah.",
};
document.getElementById("feedback-sample").textContent = JSON.stringify(sample, null, 2);
const deviceInput = form.querySelector('[name="device"]');
const expectedRakatInput = form.querySelector('[name="expectedRakat"]');
const expectedSajdahsInput = form.querySelector('[name="expectedSajdahs"]');

function formatDevice(device = {}) {
  return [
    [device.manufacturer, device.model].filter(Boolean).join(" "),
    device.osVersion && `${device.platform || "OS"} ${device.osVersion}`,
    device.appVersion && `Sajdah ${device.appVersion}`,
    device.webViewVersion && `WebView ${device.webViewVersion}`,
    !device.webViewVersion && device.browserVersion,
  ].filter(Boolean).join(" · ").slice(0, 120);
}

const initialDiagnostics = getFeedbackDiagnostics()
  .then(diagnostics => {
    if (deviceInput && !deviceInput.value) deviceInput.value = formatDevice(diagnostics.device);
    if (!deviceInput?.value) {
      document.getElementById("feedback-status").textContent =
        "Phone details could not be detected automatically. Enter the phone model; tracking diagnostics will still be included.";
    }
    return diagnostics;
  })
  .catch(error => {
    console.error("Sajdah device details unavailable", error);
    document.getElementById("feedback-status").textContent =
      "Automatic phone details are unavailable. Enter the phone model; tracking diagnostics will still be included.";
    return null;
  });

function updateExpectedSajdahs() {
  if (!expectedRakatInput || !expectedSajdahsInput) return;
  const rakats = Number(expectedRakatInput.value);
  expectedSajdahsInput.value = Number.isInteger(rakats) && rakats >= 0
    ? String(rakats * 2) : "";
}

expectedRakatInput?.addEventListener("input", updateExpectedSajdahs);

document.getElementById("review-feedback").addEventListener("click", () => {
  const section = document.getElementById("feedback-section");
  section.open = true;
  section.style.scrollMarginTop = `${document.querySelector(".session-summary").offsetHeight + 12}px`;
  if (typeof section.scrollIntoView === "function") section.scrollIntoView({ behavior: "smooth" });
});

const quickReviewSection = document.getElementById("quick-review");
const verdictBanner = document.getElementById("quick-review-verdict");
const closeReviewBtn = document.getElementById("close-quick-review");
const openFullFormBtn = document.getElementById("quick-fill-feedback");

if (closeReviewBtn) {
  closeReviewBtn.addEventListener("click", () => {
    if (quickReviewSection) quickReviewSection.hidden = true;
  });
}

if (openFullFormBtn) {
  openFullFormBtn.addEventListener("click", () => {
    const section = document.getElementById("feedback-section");
    if (section) {
      section.open = true;
      if (typeof section.scrollIntoView === "function") {
        section.scrollIntoView({ behavior: "smooth" });
      }
    }
  });
}

if (typeof document.querySelectorAll === "function") {
  document.querySelectorAll(".rakat-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const actualRakat = Number(btn.getAttribute("data-rakat"));
      const snapshot = feedbackSnapshot();
      const detectedRakat = snapshot.detectedRakat;
      const isCorrect = actualRakat === detectedRakat;

      if (verdictBanner) {
        verdictBanner.hidden = false;
        if (isCorrect) {
          verdictBanner.style.color = "#176b58";
          verdictBanner.textContent = `✅ Perfect match! You prayed ${actualRakat} rakat(s) and Sajdah detected ${detectedRakat} rakat(s).`;
        } else {
          verdictBanner.style.color = "#a33";
          verdictBanner.textContent = `⚠️ Mismatch: You prayed ${actualRakat} rakat(s), but Sajdah detected ${detectedRakat} rakat(s) (${snapshot.detectedSajdahs} sajdahs). Detailed log is ready below.`;
        }
      }

      const expectedRakatInput = form.querySelector('[name="expectedRakat"]');
      const expectedSajdahsInput = form.querySelector('[name="expectedSajdahs"]');
      const verdictSelect = form.querySelector('[name="verdict"]');
      if (expectedRakatInput) expectedRakatInput.value = actualRakat;
      if (expectedSajdahsInput) expectedSajdahsInput.value = actualRakat * 2;
      if (verdictSelect) verdictSelect.value = isCorrect ? "correct" : "incorrect";
    });
  });
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity() || button.disabled) return;
  button.disabled = true;
  message.textContent = "Saving your feedback...";
  try {
    const snapshot = feedbackSnapshot();
    const diagnostics = await getFeedbackDiagnostics();
    await initialDiagnostics;
    stopForFeedback();
    const data = new FormData(form);
    const report = {
      ...snapshot, diagnostics, id: crypto.randomUUID(), schemaVersion: 1,
      createdAt: new Date().toISOString(), sample: false,
      verdict: data.get("verdict"), expectedRakat: Number(data.get("expectedRakat")),
      expectedSajdahs: Number(data.get("expectedSajdahs")),
      placement: data.get("placement"), distance: data.get("distance"),
      lighting: data.get("lighting"),             device: String(data.get("device") || "").trim() || formatDevice(diagnostics.device),
      notes: data.get("notes").trim(),
      browser: diagnostics.browser || navigator.userAgent.slice(0, 300),
      viewport: diagnostics.viewport || `${innerWidth}x${innerHeight}`,
    };
    validateFeedback(report);
    // Keep an explicit local copy before any network request.
    const existing = JSON.parse(localStorage.getItem("sijda.feedback.v1") ?? "[]");
    if (!Array.isArray(existing)) throw new Error("Saved feedback has an invalid format. Export/recover browser storage before retrying.");
    if (existing.length >= 100) throw new Error("Local feedback limit reached (100). Export your feedback and clear app data only after backing up counters.");
    existing.push(report);
    localStorage.setItem("sijda.feedback.v1", JSON.stringify(existing));
    if (data.get("consent") === "on") {
      message.textContent = "Saved on this device. Uploading with your consent...";
      try {
        await uploadFeedback(report);
        message.textContent = `Feedback uploaded. Report ID: ${report.id}. Thank you. Your local copy is retained.`;
      } catch (error) {
        console.error("Sijda feedback upload failed", error);
        message.textContent = `Feedback saved locally, but upload failed: ${error.message}. Export your local copy; submitting again creates another report.`;
      }
    } else {
      message.textContent = "Feedback saved on this device only. Nothing uploaded.";
    }
  } catch (error) {
    console.error("Sijda feedback save failed", error);
    message.textContent = `Feedback was not saved: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("export-feedback").addEventListener("click", () => {
  const output = document.getElementById("feedback-export");
  const text = document.getElementById("feedback-json");
  output.hidden = true;
  text.value = "";
  try {
    const reports = JSON.parse(localStorage.getItem("sijda.feedback.v1") ?? "[]");
    if (!Array.isArray(reports)) throw new Error("Invalid saved feedback format.");
    text.value = JSON.stringify(reports, null, 2);
    output.hidden = false;
    if (navigator.userAgent.includes("SijdaAndroid/")) {
      message.textContent = `${reports.length} saved reports ready. Long-press the JSON below, select all and copy to a private file. Nothing uploaded.`;
      return;
    }
    const url = URL.createObjectURL(new Blob([text.value], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sijda-testing-feedback.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = `Exported ${reports.length} reports. Sample feedback is not included.`;
  } catch (error) {
    console.error("Sijda feedback export failed", error);
    message.textContent = `Feedback export failed: ${error.message}`;
  }
});
