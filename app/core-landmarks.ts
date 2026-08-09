export const CORE_LANDMARK_NAMES = [
  "제주아트플랫폼",
  "김만덕기념관",
  "예술공간 이아",
  "아라리오뮤지엄 탑동시네마",
  "김만덕객주",
  "산지천갤러리",
  "제주목 관아",
  "관덕정",
  "칠성로",
  "북수구광장",
  "탑동광장",
  "탑동해변공연장",
  "동문시장",
] as const;

const CORE_LANDMARK_NAME_SET = new Set<string>(CORE_LANDMARK_NAMES);

export function normalizePlaceName(name: string) {
  const trimmed = name.trim();
  if (trimmed === "제주해변공연장") return "탑동해변공연장";
  if (trimmed === "제주특별자치도 소통협력센터") return "제주시소통협력센터";
  return trimmed;
}

export function isCoreLandmarkName(name: string) {
  return CORE_LANDMARK_NAME_SET.has(normalizePlaceName(name));
}

export function categoryForPlace<T extends string>(name: string, category: T): T | "landmark" {
  return isCoreLandmarkName(name) ? "landmark" : category;
}
