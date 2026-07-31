import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export const POSE_JOINTS = [
  "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist",
  "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle",
] as const;
export type PoseJoint = (typeof POSE_JOINTS)[number];
export type Point = { x: number; y: number; visibility?: number };
export type PoseGuide = {
  version?: 1;
  label: string;
  /** Body-centre / shoulder-width normalized coordinates; contains no facial landmarks. */
  joints: Partial<Record<PoseJoint, Point>>;
};
export type PoseTemplate = PoseGuide;
export type CompositionTemplate = { version: 1; aspectRatio: number; bounds: { x: number; y: number; width: number; height: number }; centre: Point; headTop: number; bottom: number; margins: { left: number; right: number; top: number; bottom: number }; coverage: "full" | "upper"; mirrored: boolean };
export type PoseReading = { score: number; offsetX: number; offsetY: number; joints: PoseGuide["joints"] };

const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const landmarkIndex: Record<PoseJoint, number> = {
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
};
let videoLandmarker: PoseLandmarker | null = null;
let videoLoading: Promise<PoseLandmarker> | null = null;
let imageLandmarker: PoseLandmarker | null = null;
let imageLoading: Promise<PoseLandmarker> | null = null;

async function createLandmarker(runningMode: "IMAGE" | "VIDEO", delegate: "GPU" | "CPU") {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL, delegate }, runningMode, numPoses: 1,
  });
}
async function withCpuFallback(runningMode: "IMAGE" | "VIDEO") {
  try { return await createLandmarker(runningMode, "GPU"); }
  catch { return createLandmarker(runningMode, "CPU"); }
}
export async function preparePoseLandmarker() {
  if (videoLandmarker) return videoLandmarker;
  if (!videoLoading) videoLoading = withCpuFallback("VIDEO").then((model) => (videoLandmarker = model)).catch((error) => { videoLoading = null; throw error; });
  return videoLoading;
}
async function prepareImageLandmarker(forceCpu = false) {
  if (imageLandmarker) return imageLandmarker;
  if (!imageLoading) imageLoading = (forceCpu ? createLandmarker("IMAGE", "CPU") : withCpuFallback("IMAGE"))
    .then((model) => (imageLandmarker = model)).catch((error) => { imageLoading = null; throw error; });
  return imageLoading;
}
function resetImageModel() { imageLandmarker?.close(); imageLandmarker = null; imageLoading = null; }
function normalized(raw: { x: number; y: number; visibility?: number }[], label: string): PoseTemplate | null {
  const visible = (joint: PoseJoint) => raw[landmarkIndex[joint]]?.visibility ?? 0;
  const required = POSE_JOINTS.filter((joint) => visible(joint) >= 0.45);
  if (required.length < 7 || (visible("leftShoulder") < .45 && visible("rightShoulder") < .45)) return null;
  const leftShoulder = raw[11], rightShoulder = raw[12], leftHip = raw[23], rightHip = raw[24];
  const shoulderCentre = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
  const hipCentre = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
  const centre = (visible("leftHip") >= .3 && visible("rightHip") >= .3) ? hipCentre : shoulderCentre;
  const shoulderWidth = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
  const torso = Math.hypot(shoulderCentre.x - hipCentre.x, shoulderCentre.y - hipCentre.y);
  const scale = Math.max(shoulderWidth, torso * .72, .035);
  const joints: PoseGuide["joints"] = {};
  POSE_JOINTS.forEach((joint) => {
    const item = raw[landmarkIndex[joint]];
    if (item && (item.visibility ?? 0) >= .35) joints[joint] = { x: (item.x - centre.x) / scale, y: (item.y - centre.y) / scale, visibility: item.visibility };
  });
  return Object.keys(joints).length >= 7 ? { version: 1, label, joints } : null;
}
async function sourceToBitmap(source: string | Blob): Promise<ImageBitmap> {
  const response = typeof source === "string" ? await fetch(source, { mode: "cors", credentials: "omit" }) : null;
  if (response && !response.ok) throw new Error("참고 사진을 불러오지 못했어요.");
  const blob: Blob = response ? await response.blob() : source as Blob;
  // from-image applies EXIF orientation before the static-image detector receives pixels.
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}
export async function analyseUploadedPose(source: string | Blob, label = "업로드한 사진 포즈"): Promise<PoseTemplate | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await sourceToBitmap(source);
    const result = (await prepareImageLandmarker()).detect(bitmap);
    return normalized(result.landmarks[0] || [], label);
  } catch {
    // activeTexture/WebGL failures are retried once with a fresh CPU/WASM model.
    try {
      resetImageModel();
      if (!bitmap) bitmap = await sourceToBitmap(source);
      const result = (await prepareImageLandmarker(true)).detect(bitmap);
      return normalized(result.landmarks[0] || [], label);
    } catch { return null; }
  } finally { bitmap?.close(); }
}
export async function analyseUploadedComposition(source: string | Blob): Promise<CompositionTemplate | null> {
  let bitmap: ImageBitmap | null = null;
  try { bitmap = await sourceToBitmap(source); const result = (await prepareImageLandmarker()).detect(bitmap); const points = (result.landmarks[0] || []).filter((point) => (point.visibility ?? 0) >= .45); if (points.length < 7) return null;
    const xs = points.map((point) => point.x), ys = points.map((point) => point.y); const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys)), right = Math.min(1, Math.max(...xs)), bottom = Math.min(1, Math.max(...ys));
    return { version: 1, aspectRatio: bitmap.width / bitmap.height, bounds: { x, y, width: right - x, height: bottom - y }, centre: { x: (x + right) / 2, y: (y + bottom) / 2 }, headTop: y, bottom, margins: { left: x, right: 1 - right, top: y, bottom: 1 - bottom }, coverage: bottom > .82 && y < .2 ? "full" : "upper", mirrored: false };
  } catch { return null; } finally { bitmap?.close(); }
}
function mirrored(joints: PoseGuide["joints"]): PoseGuide["joints"] {
  return Object.fromEntries(Object.entries(joints).map(([key, point]) => [key, point ? { ...point, x: -point.x } : point])) as PoseGuide["joints"];
}
function poseDistance(current: PoseGuide["joints"], reference: PoseGuide["joints"]) {
  const values = POSE_JOINTS.flatMap((joint) => {
    const a = current[joint], b = reference[joint];
    if (!a || !b || (a.visibility ?? 1) < .4 || (b.visibility ?? 1) < .4) return [];
    return [Math.hypot(a.x - b.x, a.y - b.y) * Math.min(a.visibility ?? 1, b.visibility ?? 1)];
  });
  return values.length >= 6 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
export function readCameraPose(video: HTMLVideoElement, timestamp: number, guide: PoseGuide): PoseReading | null {
  if (!videoLandmarker || video.readyState < 2) return null;
  try {
    const detected = videoLandmarker.detectForVideo(video, timestamp).landmarks[0];
    const current = detected ? normalized(detected, "현재 인물") : null;
    if (!current) return null;
    const direct = poseDistance(current.joints, guide.joints);
    const flipped = poseDistance(current.joints, mirrored(guide.joints));
    const distance = [direct, flipped].filter((value): value is number => value !== null).sort((a, b) => a - b)[0];
    if (distance === undefined) return null;
    const score = Math.round(Math.max(0, Math.min(100, 100 - distance * 32)));
    const shoulder = current.joints.leftShoulder || current.joints.rightShoulder;
    return { score, offsetX: shoulder?.x ?? 0, offsetY: shoulder?.y ?? 0, joints: current.joints };
  } catch {
    videoLandmarker.close(); videoLandmarker = null; videoLoading = null;
    void preparePoseLandmarker();
    return null;
  }
}

export const referenceGuides: Record<string, PoseGuide> = {};
export async function analyseReferencePose(_place: string, source?: string) {
  return source ? analyseUploadedPose(source, "참고 사진 포즈") : null;
}
