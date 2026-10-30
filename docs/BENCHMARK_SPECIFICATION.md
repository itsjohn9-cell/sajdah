# Sajdah Vision & Pose Benchmark Specification

This specification documents the standard benchmark suite used to evaluate and validate the Sajdah automated prostration and rakat tracking engine against real-world video recordings, diverse phone placements, optical conditions, and Namaz progression tempos.

---

## 1. Phone Placement & Camera Angle Matrix

| Placement Mode | Angle / Pitch | Distance to Worshipper | Visual Characteristics | Active Engine Mode |
|---|---|---|---|---|
| **P1: Prostration-Spot / Mat Front** | 0° to 15° (Flat on floor / prayer mat near *Turbah*) | 5 cm to 25 cm from prostration point | Camera faces upwards toward worshipper. In standing, lower legs or perspective-shrunk torso is visible; in bowing, torso tilts horizontally; in prostration, head/forehead descends directly over or adjacent to camera; in sitting, upright face is visible at medium distance. | Mode 1: Mat Mode (`calibration.mode = "mat"`) + Proximity / Optical Occlusion + Upper-body low-head pose |
| **P2: Low-Floor Angled / Propped** | 20° to 45° (Leaning on book, wall, or phone stand) | 0.5 m to 1.0 m ahead of mat | Feet are cropped at the bottom of the frame; upper body, torso, arms, and head are visible throughout. | Mode 4: Upper-Body Mode (`calibration.mode = "upper"`) with proportional head drop and torso span |
| **P3: Lateral Side-View Profile** | 60° to 90° (Left or right lateral floor/low table) | 1.5 m to 2.5 m to side | Full silhouette visible from the side: vertical spine in Qiyam (standing), 90° angle in Ruku (bowing), 7-point contact folded silhouette in Sujud, and kneeling L-shape in Jalsah. | Mode 3: Side-Profile Mode (`calibration.mode = "side"`) with hip/ankle depth and knee angles |
| **P4: Elevated Front / Distance View** | 0° to -15° (On desk, shelf, or tripod at chest height) | 2.0 m to 3.5 m in front | Full human body visible from head to ankles without cropping. | Mode 2: Standard Full-Body Mode (`calibration.mode = "full"`) |

---

## 2. Environmental & Optical Condition Matrix

| Condition ID | Description | Optical Challenges | Benchmark Requirement |
|---|---|---|---|
| **C1: Standard Lighting** | 150 to 500 lux (daylight or well-lit room) | High signal-to-noise ratio, standard keypoint confidences. | Baseline 100% precision and recall on all postures. |
| **C2: Low Ambient + Screen Light** | Ambient < 15 lux with screen light enabled | Screen glows white at 100% brightness. Illuminates face/forehead at close range, but background is dark. Hardware proximity often unavailable in WebViews. | Pose-based low head detection in Mat Mode must recognize Sajdah without relying solely on dark-frame classification. |
| **C3: Low Ambient without Screen Light** | Ambient < 15 lux with screen light off | Sensor noise, reduced landmark visibility, low-contrast silhouette. | `diagnosePlacement` warns of dim lighting when standing/bowing; suppresses warnings during active Sujud to avoid disturbing prayer. |
| **C4: Glossy Marble / Tile Reflections** | Polished ceramic, marble, or glass floor (common in prayer halls and homes) | Mirrored reflection of hands, knees, or chest produces secondary ghost landmarks. | `selectPrimaryPose` rejects reflections (`second.score < 10` or `top.score >= second.score * 1.5`). Does not pause prayer with "Multiple people detected". |
| **C5: Backlit / Silhouette** | Bright window or overhead light directly behind worshipper | High contrast, facial landmarks may have low confidence. | Upper-body silhouette (shoulders, torso span, head envelope) maintains posture classification without facial landmarks. |
| **C6: Flowing / Loose Clothing** | Traditional prayer attire (*Thobe*, *Jubbah*, *Abaya*, *Chador*, wide trousers) | Knee and hip joints are obscured by fabric folds. Leg landmarks drop in confidence. | Upper-body and head-drop features drive classification without requiring visible ankle/knee keypoints. |

---

## 3. Namaz Progression & Timing Variations

| Timing ID | Profile | Key Durations | Invariants Tested |
|---|---|---|---|
| **T1: Standard Pace** | 60s to 90s per Rakat | Qiyam: 15–25s, Ruku: 4–6s, Sajdah 1: 4–6s, Jalsah: 2–4s, Sajdah 2: 4–6s | Clean state machine progression through all phases. |
| **T2: Prolonged Sujud (Dua in Prostration)** | Extended dhikr / supplication in Sajdah | Sajdah 1 or 2 held for 10s to 30s | **Zero false timeouts:** "Body tracking lost" must NOT fire during prostration (`adaptive` mode). |
| **T3: Rapid / Brief Jalsah** | Quick pause between prostrations | Jalsah duration: 1.0s to 2.0s | `leftFirstSajdah` is triggered cleanly upon sitting/rising; Sajdah 2 is recorded as a distinct second prostration and never merged with Sajdah 1. |
| **T4: Multi-Rakat Formats** | 2, 3, and 4 Rakats (Fajr, Maghrib, Dhuhr/Asr/Isha) | Includes intermediate Tashahhud (sitting after Rakat 2) and final Tashahhud / Taslim | Target completion flags set accurately at target; counter halts further increments. |

---

## 4. Evaluation Metrics & Success Criteria

1. **Rakat Target Accuracy:** Exactly matches intended prayer target ($2/2, 3/3, 4/4$) with $0$ extra and $0$ missing rakats.
2. **Sajdah Count Precision:** Exactly 2 sajdahs per completed rakat ($100\%$ precision, $100\%$ recall).
3. **Zero False Pauses:** 0 session pauses caused by:
   - Floor/tile reflections ("Multiple people detected").
   - Prolonged holding in Sajdah ("Body tracking lost").
   - Transient landmark flicker during posture transitions.
4. **Transition Continuity:** Every Rakat exits cleanly into either Qiyam (for subsequent rakat) or Tashahhud sitting (at completion).
