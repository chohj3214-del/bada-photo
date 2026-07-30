const harmfulPatterns = [
  /죽어|죽여|살해|자살|협박/i,
  /병신|바보|멍청|꺼져|씨발|시발|좆/i,
  /개인.?정보|전화번호|주소.*알려/i,
];

/** 기기 안에서만 실행되는 MVP 안전 필터입니다. */
export function isInappropriateComment(text: string) {
  return harmfulPatterns.some((pattern) => pattern.test(text));
}
