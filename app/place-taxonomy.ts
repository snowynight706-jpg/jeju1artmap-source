export type AdditionalCategoryId =
  | "exhibition-performance"
  | "multi-cultural"
  | "creative-startup"
  | "event-rental"
  | "experience-education"
  | "local-goods"
  | "walk-rest";

export type PrimaryPublicCategoryId = "culture" | "cafe" | "food" | "shop";
export type PublicListCategoryId = PrimaryPublicCategoryId | AdditionalCategoryId;

export type ConvenienceAttributeId =
  | "alcohol"
  | "late-night"
  | "reservation-required"
  | "free"
  | "paid"
  | "parking"
  | "toilet"
  | "wifi"
  | "pet-friendly"
  | "wheelchair-accessible";

export const additionalCategoryDefinitions: ReadonlyArray<{
  id: AdditionalCategoryId;
  name: string;
  publicCategories: readonly PublicListCategoryId[];
}> = [
  { id: "exhibition-performance", name: "전시·공연", publicCategories: ["exhibition-performance"] },
  { id: "multi-cultural", name: "복합문화", publicCategories: ["multi-cultural"] },
  { id: "creative-startup", name: "창작·창업", publicCategories: ["creative-startup"] },
  { id: "event-rental", name: "행사·대관", publicCategories: ["event-rental"] },
  { id: "experience-education", name: "체험·교육", publicCategories: ["experience-education"] },
  { id: "local-goods", name: "소품·로컬상품", publicCategories: ["local-goods"] },
  { id: "walk-rest", name: "산책·휴식", publicCategories: ["walk-rest"] },
] as const;

export const convenienceAttributeDefinitions: ReadonlyArray<{
  id: ConvenienceAttributeId;
  name: string;
}> = [
  { id: "alcohol", name: "주류 판매" },
  { id: "late-night", name: "야간영업" },
  { id: "reservation-required", name: "예약 필요" },
  { id: "free", name: "무료" },
  { id: "paid", name: "유료" },
  { id: "parking", name: "주차" },
  { id: "toilet", name: "화장실" },
  { id: "wifi", name: "와이파이" },
  { id: "pet-friendly", name: "반려동물 동반" },
  { id: "wheelchair-accessible", name: "휠체어 이용" },
] as const;

const additionalCategoryIds = new Set<string>(additionalCategoryDefinitions.map((item) => item.id));
const convenienceAttributeIds = new Set<string>(convenienceAttributeDefinitions.map((item) => item.id));
const legacyAdditionalCategoryMap: Readonly<Record<string, readonly AdditionalCategoryId[]>> = {
  "multi-cultural-space": ["multi-cultural"],
  "exhibition-space": ["exhibition-performance"],
  "performance-space": ["exhibition-performance"],
  "work-meeting-space": ["creative-startup", "event-rental"],
  "books-reading": ["experience-education"],
  "experience-creation": ["experience-education"],
  "cafe-service": [],
  "food-service": [],
  "outdoor-walk": ["walk-rest"],
};

export const MAIN_HUB_CANONICAL_NAME = "제주시소통협력센터";
export const MAIN_HUB_ROLE = "workation-main-hub";
export const ART_PLATFORM_GROUP_ID = "jeju-art-platform-building";
export const ART_PLATFORM_MAP_ANCHOR_ID = "jeju-art-platform";

export const ART_PLATFORM_FACILITY_NAMES = [
  "제주아트플랫폼",
  "아르코공연연습센터@제주",
  "제주예술인복지센터",
] as const;

export type PlaceDirectoryMetadata = {
  additionalCategories: AdditionalCategoryId[];
  convenienceAttributes: ConvenienceAttributeId[];
  locationGroupId: string;
  mapAnchorId: string;
  featuredRole: string;
  aliases: string[];
};

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedName(name: string) {
  const trimmed = cleanText(name);
  if (["제주특별자치도 소통협력센터", "제주소통협력센터", "제주소통협력센터 메인 오피스"].includes(trimmed)) {
    return MAIN_HUB_CANONICAL_NAME;
  }
  if (trimmed === "아르코 공연 예술센터") return "아르코공연연습센터@제주";
  if (trimmed === "예술인복지센터") return "제주예술인복지센터";
  return trimmed;
}

export function sanitizeAdditionalCategories(value: unknown): AdditionalCategoryId[] {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = candidate.split(",");
    }
  }
  if (!Array.isArray(candidate)) return [];
  const selected = new Set(candidate.flatMap((item): AdditionalCategoryId[] => {
    const id = cleanText(item, 80);
    if (additionalCategoryIds.has(id)) return [id as AdditionalCategoryId];
    return [...(legacyAdditionalCategoryMap[id] ?? [])];
  }));
  return additionalCategoryDefinitions
    .map((definition) => definition.id)
    .filter((id) => selected.has(id))
    .slice(0, 3);
}

export function sanitizeConvenienceAttributes(value: unknown): ConvenienceAttributeId[] {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = candidate.split(",");
    }
  }
  if (!Array.isArray(candidate)) return [];
  const selected = new Set(candidate.flatMap((item): ConvenienceAttributeId[] => {
    const id = cleanText(item, 80);
    return convenienceAttributeIds.has(id) ? [id as ConvenienceAttributeId] : [];
  }));
  return convenienceAttributeDefinitions.map((definition) => definition.id).filter((id) => selected.has(id));
}

export function inferAdditionalCategories(
  name: string,
  primaryCategory: string,
  subtype = "",
  description = "",
): AdditionalCategoryId[] {
  const canonicalName = normalizedName(name);
  const text = `${canonicalName} ${subtype} ${description}`;
  const inferred = new Set<AdditionalCategoryId>();

  if (/복합문화|복합공간|문화예술 플랫폼|문화·판매|문화·음식|문화·교류/.test(text)) inferred.add("multi-cultural");
  if (/갤러리|미술관|전시|공연|상영|음악회|극장|무대|연습실|아트스페이스|미디어아트/.test(text)) inferred.add("exhibition-performance");
  if (/창작공간|코워킹|입주공간|입주실|창업|네트워킹|워케이션|업무공간|작업공간|도시재생 거점/.test(text)) inferred.add("creative-startup");
  if (/팝업|행사|대관|공간대여|모임|회의|세미나|커뮤니티/.test(text)) inferred.add("event-rental");
  if (/체험|교육|워크숍|클래스|강연|공방|메이커|책|도서|북라운지|문학/.test(text)) inferred.add("experience-education");
  if (primaryCategory !== "shop" && /소품|굿즈|기념품|편집숍|로컬상품/.test(text)) inferred.add("local-goods");
  if (/정원|테라스|공원|광장|산책|휴식|해변|야외/.test(text)) inferred.add("walk-rest");

  if (canonicalName === "제주아트플랫폼") {
    return ["exhibition-performance", "multi-cultural", "event-rental"];
  } else if (canonicalName === "아르코공연연습센터@제주") {
    return ["exhibition-performance", "event-rental"];
  } else if (canonicalName === "제주예술인복지센터") {
    return ["creative-startup", "event-rental", "experience-education"];
  } else if (canonicalName === MAIN_HUB_CANONICAL_NAME) {
    return ["creative-startup", "event-rental", "experience-education"];
  }

  return additionalCategoryDefinitions.map((item) => item.id).filter((id) => inferred.has(id)).slice(0, 3);
}

export function directoryMetadataDefaults(
  name: string,
  primaryCategory: string,
  subtype = "",
  description = "",
): PlaceDirectoryMetadata {
  const canonicalName = normalizedName(name);
  const isArtPlatformFacility = (ART_PLATFORM_FACILITY_NAMES as readonly string[]).includes(canonicalName);
  const aliases = canonicalName === MAIN_HUB_CANONICAL_NAME
    ? ["제주소통협력센터", "제주소통협력센터 메인 오피스", "제주특별자치도 소통협력센터"]
    : canonicalName === "아르코공연연습센터@제주"
      ? ["아르코 공연 예술센터", "아르코공연연습센터"]
      : canonicalName === "제주예술인복지센터"
        ? ["예술인복지센터", "제주 예술인 복지센터"]
        : [];
  return {
    additionalCategories: inferAdditionalCategories(canonicalName, primaryCategory, subtype, description),
    convenienceAttributes: [],
    locationGroupId: isArtPlatformFacility ? ART_PLATFORM_GROUP_ID : "",
    mapAnchorId: isArtPlatformFacility ? ART_PLATFORM_MAP_ANCHOR_ID : "",
    featuredRole: canonicalName === MAIN_HUB_CANONICAL_NAME ? MAIN_HUB_ROLE : "",
    aliases,
  };
}

export function mergeDirectoryMetadata(
  value: Partial<PlaceDirectoryMetadata> | null | undefined,
  defaults: PlaceDirectoryMetadata,
): PlaceDirectoryMetadata {
  const hasAdditionalCategories = Boolean(value && Object.prototype.hasOwnProperty.call(value, "additionalCategories"));
  const hasConvenienceAttributes = Boolean(value && Object.prototype.hasOwnProperty.call(value, "convenienceAttributes"));
  const hasAliases = Boolean(value && Object.prototype.hasOwnProperty.call(value, "aliases"));
  const additionalCategories = sanitizeAdditionalCategories(value?.additionalCategories);
  const aliases = Array.isArray(value?.aliases)
    ? [...new Set(value.aliases.map((item) => cleanText(item)).filter(Boolean))].slice(0, 12)
    : [];
  return {
    additionalCategories: hasAdditionalCategories ? additionalCategories : defaults.additionalCategories,
    convenienceAttributes: hasConvenienceAttributes
      ? sanitizeConvenienceAttributes(value?.convenienceAttributes)
      : defaults.convenienceAttributes,
    locationGroupId: cleanText(value?.locationGroupId) || defaults.locationGroupId,
    mapAnchorId: cleanText(value?.mapAnchorId) || defaults.mapAnchorId,
    featuredRole: cleanText(value?.featuredRole, 120) || defaults.featuredRole,
    aliases: hasAliases ? aliases : defaults.aliases,
  };
}

export function publicCategoriesForAdditionalCategories(value: unknown): PublicListCategoryId[] {
  const selected = new Set(sanitizeAdditionalCategories(value));
  return [...new Set(additionalCategoryDefinitions.flatMap((definition) => (
    selected.has(definition.id) ? [...definition.publicCategories] : []
  )))];
}

export function publicDisplayName(name: string, featuredRole = "") {
  return featuredRole === MAIN_HUB_ROLE || normalizedName(name) === MAIN_HUB_CANONICAL_NAME
    ? "제주소통협력센터 메인 오피스"
    : name;
}
