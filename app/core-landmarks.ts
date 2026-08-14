export const CHILSEONG_CANONICAL_NAME = "칠성로";

export const CORE_LANDMARK_NAMES = [
  "제주아트플랫폼",
  "김만덕기념관",
  "예술공간 이아",
  "아라리오뮤지엄 탑동시네마",
  "김만덕객주",
  "산지천갤러리",
  "제주목 관아",
  "관덕정",
  CHILSEONG_CANONICAL_NAME,
  "북수구광장",
  "탑동광장",
  "탑동해변공연장",
  "동문시장",
] as const;

const CORE_LANDMARK_NAME_SET = new Set<string>(CORE_LANDMARK_NAMES);

export function normalizePlaceName(name: string) {
  const trimmed = name.trim();
  if (["제주 칠성로 상점가", "제주칠성로상점가", "제주칠성로 상점가", "제주 칠성로상점가"].includes(trimmed)) {
    return CHILSEONG_CANONICAL_NAME;
  }
  if (trimmed === "제주해변공연장") return "탑동해변공연장";
  if (["제주특별자치도 소통협력센터", "제주소통협력센터", "제주소통협력센터 메인 오피스"].includes(trimmed)) return "제주시소통협력센터";
  if (["LPP", "Local Player Platform", "로컬 플레이어 플랫폼"].includes(trimmed)) return "LPP (Local Player Platform)";
  if (trimmed === "아르코 공연 예술센터") return "아르코공연연습센터@제주";
  if (trimmed === "예술인복지센터") return "제주예술인복지센터";
  return trimmed;
}

export function isCoreLandmarkName(name: string) {
  return CORE_LANDMARK_NAME_SET.has(normalizePlaceName(name));
}

export function categoryForPlace<T extends string>(name: string, category: T): T | "landmark" {
  return isCoreLandmarkName(name) ? "landmark" : category;
}
