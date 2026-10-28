import { feedbackSnapshot, stopForFeedback } from "./camera.mjs";
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

document.getElementById("review-feedback").addEventListener("click", () => {
  const section = document.getElementById("feedback-section");
  section.open = true;
  section.style.scrollMarginTop = `${document.querySelector(".session-summary").offsetHeight + 12}px`;
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!form.reportValidity() || button.disabled) return;
  button.disabled = true;
  message.textContent = "Saving your feedback...";
  try {
    stopForFeedback();
    const data = new FormData(form);
    const report = {
      ...feedbackSnapshot(), id: crypto.randomUUID(), schemaVersion: 1,
      createdAt: new Date().toISOString(), sample: false,
      verdict: data.get("verdict"), expectedRakat: Number(data.get("expectedRakat")),
      expectedSajdahs: Number(data.get("expectedSajdahs")),
      placement: data.get("placement"), distance: data.get("distance"),
      lighting: data.get("lighting"), device: data.get("device").trim(),
      notes: data.get("notes").trim(),
      browser: navigator.userAgent.slice(0, 300),
      viewport: `${innerWidth}x${innerHeight}`,
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
