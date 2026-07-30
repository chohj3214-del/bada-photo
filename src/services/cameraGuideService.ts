import type { PoseGuide } from './poseDetectionService';

export type CameraGuide = { message: string; score?: number; status: 'ready' | 'aligning' | 'neutral' };

// MediaPipe가 현재 포즈를 넘겨주면 score로 교체할 수 있는 안내 규칙입니다.
export function getCameraGuide(reference: PoseGuide | undefined, detectedScore?: number, offsetX = 0, offsetY = 0): CameraGuide {
  if (!reference) return { status: 'neutral', message: '수평선을 맞춘 뒤 원하는 순간에 촬영해 보세요.' };
  if (detectedScore === undefined) return { status: 'aligning', message: '참고 포즈 틀 안에 인물이 보이도록 서 주세요.' };
  const score = detectedScore;
  if (score >= 90) return { status: 'ready', score, message: '포즈가 참고 틀에 잘 들어왔어요. 촬영해 보세요!' };
  if (Math.abs(offsetX) > 8) return { status: 'aligning', score, message: offsetX > 0 ? '인물을 조금 왼쪽으로 이동해 주세요.' : '인물을 조금 오른쪽으로 이동해 주세요.' };
  if (Math.abs(offsetY) > 9) return { status: 'aligning', score, message: offsetY > 0 ? '휴대폰을 조금 아래로 내려 주세요.' : '휴대폰을 조금 위로 올려 주세요.' };
  return { status: 'aligning', score, message: '인물이 반투명 포즈 틀 안에 들어오도록 위치를 맞춰 주세요.' };
}
