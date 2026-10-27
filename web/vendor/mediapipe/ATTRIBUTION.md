# Bundled pose assets

- Runtime: `@mediapipe/tasks-vision` version `0.10.22-rc.20250304`,
  downloaded from the npm registry. Upstream package metadata is included as
  `package.json`; MediaPipe's Apache-2.0 license is included as `LICENSE`.
- Runtime license source:
  https://github.com/google-ai-edge/mediapipe/blob/v0.10.22/LICENSE
- Model: Pose Landmarker Lite, float16, version 1:
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Model documentation:
  https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- Model card linked by that documentation:
  https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf
- Model SHA-256:
  `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.

The runtime license is verified from upstream. The official BlazePose GHUM 3D
model card linked above describes Lite, Full and Heavy models and explicitly
states "LICENSED UNDER Apache License, Version 2.0". This model-specific
license evidence was verified on 28 October 2026; it is not inferred from a
notebook's code license. Retain the bundled Apache-2.0 license and attribution
when distributing the runtime and downloaded model.
The public repository includes the licensed runtime, but excludes model weights.
Download the model directly from Google using the setup instructions in the
root README and verify the checksum above. Review the upstream model terms
before use or distribution. Locally downloaded weights support experimental
evaluation; no external model requests are required by the camera page once
the app has been built with those local assets.
