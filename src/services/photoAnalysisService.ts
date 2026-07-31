export type EditSettings = {
  mode: "original" | "ai" | "brightness" | "tone" | "horizon" | "crop";
  brightness: number;
  saturation: number;
  contrast: number;
  temperature: number;
  horizon: number;
};

export type EditRecommendation = {
  brightness: number;
  saturation: number;
  contrast: number;
  temperature: number;
  message: string;
};

export const defaultEditSettings: EditSettings = {
  mode: "original",
  brightness: 0,
  saturation: 0,
  contrast: 0,
  temperature: 0,
  horizon: 0,
};

// External AI can replace this function later. It only analyses pixels on this device.
export async function analysePhotoForEdit(dataUrl: string, attempt = 0): Promise<EditRecommendation> {
  return analysePhotoForEditDemo(dataUrl, attempt);
}

// Demo-only implementation. Replace this function with a real on-device AI service later.
export async function analysePhotoForEditDemo(dataUrl: string, attempt = 0): Promise<EditRecommendation> {
  try {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let brightness = 0;
    let blue = 0;
    let red = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      brightness += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      red += pixels[index];
      blue += pixels[index + 2];
    }
    const count = pixels.length / 4;
    const average = brightness / count;
    const brightnessOffset = Math.max(-8, Math.min(8, Math.round((150 - average) / 7)));
    const seaTone = Math.max(4, Math.min(14, Math.round((blue - red) / count / 3 + 9)));
    const subtleShift = ((Math.round(average) + attempt) % 3) - 1;
    return { brightness: brightnessOffset + subtleShift, saturation: seaTone, contrast: 6 + subtleShift, temperature: 3 + subtleShift, message: "사진의 밝기와 바다 색감을 자연스럽게 추천했어요!" };
  } catch {
    return { brightness: 8, saturation: 12, contrast: 6, temperature: 3, message: "사진의 밝기와 바다 색감을 자연스럽게 추천했어요!" };
  }
}

export function getRecommendedCaption(index: number) {
  return [
    "파도 소리와 함께 남긴 오늘의 바다 한 장 🌊",
    "햇살이 머문 바다에서, 천천히 쉬어가기",
    "푸른 바다를 바라보며 담은 조용한 순간",
  ][index % 3];
}
