export function assessLighting(pixels) {
  if (!pixels.length || pixels.length % 4 !== 0) {
    throw new Error("Lighting sample must contain RGBA pixels.");
  }
  let total = 0;
  let dark = 0;
  let bright = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    total += luminance;
    if (luminance < 45) dark++;
    if (luminance > 210) bright++;
  }
  // Preview heuristics, not lux measurements or a guarantee of pose visibility.
  if (total / count < 45 || dark / count >= 0.7) return "dim";
  if (dark / count >= 0.4 && bright / count >= 0.15) return "uneven";
  return "unassessed";
}

export class LightingMonitor {
  candidate = null;
  samples = 0;
  condition = "unassessed";

  observe(pixels) {
    const next = assessLighting(pixels);
    this.samples = next === this.candidate ? this.samples + 1 : 1;
    this.candidate = next;
    if (this.samples >= 2) this.condition = next;
    return this.condition;
  }
}
