import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
export type Point = { x: number; y: number };
export type PoseGuide = { points: Point[]; label: string };
export type PoseReading = { score: number; offsetX: number; offsetY: number };
let landmarker: PoseLandmarker | null = null;
let loading: Promise<PoseLandmarker> | null = null;

export async function preparePoseLandmarker() {
  if (landmarker) return landmarker;
  if (!loading) loading = (async () => {
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
    landmarker = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task' }, runningMode: 'VIDEO', numPoses: 1 });
    return landmarker;
  })();
  return loading;
}

export function readCameraPose(video: HTMLVideoElement, timestamp: number, guide: PoseGuide): PoseReading | null {
  if (!landmarker || video.readyState < 2) return null;
  const pose = landmarker.detectForVideo(video, timestamp).landmarks[0];
  if (!pose) return null;
  const indexes = [0, 11, 12, 15, 16, 23, 24, 27, 28];
  const current = indexes.map(index => ({ x: pose[index].x * 100, y: pose[index].y * 100 }));
  const center = (points: Point[]) => ({ x: points.reduce((sum,p)=>sum+p.x,0)/points.length, y: points.reduce((sum,p)=>sum+p.y,0)/points.length });
  const currentCenter = center(current); const guideCenter = center(guide.points);
  const min = (points: Point[], axis: 'x'|'y') => Math.min(...points.map(p=>p[axis])); const max = (points: Point[], axis: 'x'|'y') => Math.max(...points.map(p=>p[axis]));
  const currentScale = Math.max(max(current,'x')-min(current,'x'), max(current,'y')-min(current,'y'), 1);
  const guideScale = Math.max(max(guide.points,'x')-min(guide.points,'x'), max(guide.points,'y')-min(guide.points,'y'), 1);
  const normalized = current.map(p => ({ x: ((p.x-currentCenter.x)/currentScale)*guideScale+guideCenter.x, y: ((p.y-currentCenter.y)/currentScale)*guideScale+guideCenter.y }));
  const poseError = normalized.reduce((sum,p,index)=>sum+Math.hypot(p.x-guide.points[index].x,p.y-guide.points[index].y),0)/normalized.length;
  const positionError = Math.hypot(currentCenter.x-guideCenter.x,currentCenter.y-guideCenter.y);
  return { score: Math.max(0, Math.min(100, Math.round(100-poseError*2.4-positionError*.8))), offsetX: currentCenter.x-guideCenter.x, offsetY: currentCenter.y-guideCenter.y };
}
// MediaPipe adapter boundary: MVP uses a stable device-local guide until the model asset is bundled.
export const referenceGuides: Record<string, PoseGuide> = {
  'standing-wave': { label: '파도를 바라보는 서 있는 포즈', points: [{x:63,y:31},{x:59,y:39},{x:68,y:40},{x:58,y:53},{x:69,y:54},{x:61,y:64},{x:68,y:64},{x:62,y:86},{x:70,y:86}] },
  'sitting-beach': { label: '앉아서 바다를 바라보는 포즈', points: [{x:36,y:46},{x:32,y:53},{x:42,y:54},{x:25,y:73},{x:48,y:72},{x:37,y:65},{x:50,y:70},{x:58,y:77},{x:83,y:73}] },
  'side-standing': { label: '옆모습으로 바다를 바라보는 포즈', points: [{x:52,y:27},{x:49,y:36},{x:56,y:37},{x:47,y:53},{x:58,y:54},{x:50,y:62},{x:57,y:63},{x:50,y:86},{x:58,y:87}] },
  'wing-pose': { label: '팔을 펼친 기울기 포즈', points: [{x:35,y:39},{x:31,y:48},{x:43,y:43},{x:16,y:70},{x:88,y:31},{x:38,y:65},{x:51,y:61},{x:43,y:86},{x:58,y:85}] },
  '광안리': { label: '난간을 바라보는 포즈', points: [{x:50,y:19},{x:43,y:31},{x:57,y:31},{x:40,y:47},{x:60,y:47},{x:43,y:62},{x:57,y:62},{x:41,y:82},{x:59,y:82}] },
  '해운대': { label: '바다를 향해 손을 든 포즈', points: [{x:51,y:19},{x:44,y:31},{x:58,y:30},{x:41,y:45},{x:66,y:20},{x:43,y:62},{x:57,y:62},{x:43,y:83},{x:58,y:83}] },
  '송도': { label: '풍경 중심 구도', points: [{x:50,y:25},{x:45,y:36},{x:55,y:36},{x:43,y:52},{x:57,y:52},{x:44,y:66},{x:56,y:66},{x:42,y:83},{x:58,y:83}] },
  '청사포': { label: '바다를 바라보는 포즈', points: [{x:50,y:22},{x:44,y:34},{x:56,y:34},{x:40,y:49},{x:60,y:49},{x:44,y:63},{x:56,y:63},{x:42,y:83},{x:58,y:83}] }
};
export async function analyseReferencePose(place: string) { return referenceGuides[place] ?? null; }
