import { useEffect, useState } from "react";
import { preparePoseLandmarker, readCameraPose, type CompositionTemplate, type Point, type PoseGuide } from "../services/poseDetectionService";
import { getCameraGuide } from "../services/cameraGuideService";

function toScreen(point: Point) { return { x: 50 + point.x * 13, y: 52 + point.y * 13 }; }
const line = (a?: Point, b?: Point) => a && b ? `${toScreen(a).x},${toScreen(a).y} ${toScreen(b).x},${toScreen(b).y}` : "";

export function PoseOverlay({ guide, composition, active }: { guide?: PoseGuide; composition?: CompositionTemplate; active: boolean }) {
  const [current, setCurrent] = useState<PoseGuide["joints"]>();
  useEffect(() => {
    if (!active || !guide) return;
    let frame = 0; let last = 0; let cancelled = false;
    const update = () => {
      const video = document.querySelector<HTMLVideoElement>(".camera-bg video");
      if (video && performance.now() - last > 220) {
        last = performance.now();
        const reading = readCameraPose(video, performance.now(), guide);
        setCurrent(reading?.joints);
        const feedback = reading ? getCameraGuide(guide, reading.score, reading.offsetX, reading.offsetY) : { message: "인물의 관절을 찾고 있어요. 포즈 틀 안에 서 주세요.", score: undefined };
        const bubble = document.querySelector(".guide-bubble p"); const match = document.querySelector(".match");
        if (bubble) bubble.textContent = feedback.message;
        if (match) match.textContent = feedback.score === undefined ? "포즈 인식 중" : `포즈 ${feedback.score}% 정렬`;
      }
      if (!cancelled) frame = requestAnimationFrame(update);
    };
    void preparePoseLandmarker().then(update).catch(() => {
      const bubble = document.querySelector(".guide-bubble p");
      if (bubble) bubble.textContent = "포즈 인식을 준비하지 못했어요. 참고 사진을 보며 촬영할 수 있어요.";
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [active, guide]);
  if (!active || !guide) return null;
  const draw = (joints: PoseGuide["joints"], className: string) => <g className={className}>
    {[["leftShoulder", "rightShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftWrist"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightWrist"], ["leftShoulder", "leftHip"], ["rightShoulder", "rightHip"], ["leftHip", "rightHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftAnkle"], ["rightHip", "rightKnee"], ["rightKnee", "rightAnkle"]].map(([a, b]) => {
      const points = line(joints[a as keyof typeof joints], joints[b as keyof typeof joints]);
      return points ? <polyline key={`${a}-${b}`} points={points} /> : null;
    })}
    {Object.entries(joints).map(([name, point]) => point && <circle key={name} cx={toScreen(point).x} cy={toScreen(point).y} r="1.5" />)}
  </g>;
  const box = composition?.bounds;
  const style = box ? { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%`, inset: "auto" } : undefined;
  return <svg className="pose-overlay" style={style} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="참고 포즈와 현재 인물 관절 안내">
    {draw(guide.joints, "reference-skeleton")}
    {current && draw(current, "current-skeleton")}
  </svg>;
}
