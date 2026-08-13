export type AdditionalCategoryId =
  | "multi-cultural"
  | "exhibition"
  | "performance"
  | "creative"
  | "startup"
  | "event"
  | "rental"
  | "experience"
  | "education"
  | "walk"
  | "rest"
  | "goods-shop"
  | "reading"
  | "tourism"
  | "market-shopping";

export type PrimaryPublicCategoryId = "culture" | "cafe" | "food" | "shop";
export type PublicListCategoryId = PrimaryPublicCategoryId | AdditionalCategoryId;

const primaryPublicCategoryIds = new Set<string>(["culture", "cafe", "food", "shop"]);

export function normalizeDirectoryCategory(category: string): string {
  return category === "landmark" ? "culture" : category;
}

export function isPrimaryPublicCategory(category: string): category is PrimaryPublicCategoryId {
  return primaryPublicCategoryIds.has(category);
}

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
  { id: "multi-cultural", name: "복합문화", publicCategories: ["multi-cultural"] },
  { id: "exhibition", name: "전시", publicCategories: ["exhibition"] },
  { id: "performance", name: "공연", publicCategories: ["performance"] },
  { id: "creative", name: "창작", publicCategories: ["creative"] },
  { id: "startup", name: "창업", publicCategories: ["startup"] },
  { id: "event", name: "행사", publicCategories: ["event"] },
  { id: "rental", name: "대관", publicCategories: ["rental"] },
  { id: "experience", name: "체험", publicCategories: ["experience"] },
  { id: "education", name: "교육", publicCategories: ["education"] },
  { id: "walk", name: "산책", publicCategories: ["walk"] },
  { id: "rest", name: "휴식", publicCategories: ["rest"] },
  { id: "goods-shop", name: "소품샵", publicCategories: ["goods-shop"] },
  { id: "reading", name: "독서", publicCategories: ["reading"] },
  { id: "tourism", name: "관광", publicCategories: ["tourism"] },
  { id: "market-shopping", name: "시장&상가", publicCategories: ["market-shopping"] },
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
  "exhibition-performance": ["exhibition", "performance"],
  "creative-startup": ["creative", "startup"],
  "event-rental": ["event", "rental"],
  "experience-education": ["experience", "education"],
  "local-goods": ["goods-shop"],
  "walk-rest": ["walk", "rest"],
  "multi-cultural-space": ["multi-cultural"],
  "exhibition-space": ["exhibition"],
  "performance-space": ["performance"],
  "work-meeting-space": ["creative", "startup", "event", "rental"],
  "books-reading": ["reading"],
  "experience-creation": ["experience", "creative"],
  "cafe-service": [],
  "food-service": [],
  "outdoor-walk": ["walk", "rest"],
};

export const MAIN_HUB_CANONICAL_NAME = "제주시소통협력센터";
export const MAIN_HUB_ROLE = "workation-main-hub";
export const LPP_CANONICAL_NAME = "LPP (Local Player Platform)";
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
    .filter((id) => selected.has(id));
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
  if (/갤러리|미술관|전시|상영|아트스페이스|미디어아트/.test(text)) inferred.add("exhibition");
  if (/공연|음악회|극장|무대|공연장|연습실/.test(text)) inferred.add("performance");
  if (/창작공간|작업공간|공방|메이커|스튜디오|작가/.test(text)) inferred.add("creative");
  if (/창업|코워킹|입주공간|입주실|네트워킹|워케이션|업무공간|도시재생 거점/.test(text)) inferred.add("startup");
  if (/팝업|행사|모임|세미나|커뮤니티|포럼|축제/.test(text)) inferred.add("event");
  if (/대관|공간대여|회의실|세미나실|연습실/.test(text)) inferred.add("rental");
  if (/체험|워크숍|클래스|공방|메이커/.test(text)) inferred.add("experience");
  if (/교육|강연|클래스|아카데미|학교/.test(text)) inferred.add("education");
  if (/산책|해변|올레|탐방|보행/.test(text)) inferred.add("walk");
  if (/휴식|정원|테라스|공원|광장|야외|라운지/.test(text)) inferred.add("rest");
  if (primaryCategory !== "shop" && /소품|굿즈|기념품|편집숍|로컬상품/.test(text)) inferred.add("goods-shop");
  if (/책|도서|북라운지|문학|서점|독서/.test(text)) inferred.add("reading");
  if (/관광|명소|역사|유적|기념관|박물관|관아|문화재/.test(text)) inferred.add("tourism");
  if (/시장|상가|상점가|쇼핑몰|쇼핑거리|아케이드/.test(text)) inferred.add("market-shopping");

  if (canonicalName === "제주아트플랫폼") {
    return ["multi-cultural", "exhibition", "performance", "event", "rental"];
  } else if (canonicalName === "아르코공연연습센터@제주") {
    return ["performance", "creative", "rental"];
  } else if (canonicalName === "제주예술인복지센터") {
    return ["creative", "startup", "event", "rental", "education"];
  } else if (canonicalName === MAIN_HUB_CANONICAL_NAME) {
    return ["multi-cultural", "creative", "startup", "event", "rental", "experience", "education"];
  } else if (canonicalName === LPP_CANONICAL_NAME) {
    return ["multi-cultural", "startup", "event", "rental", "experience", "education", "goods-shop"];
  }

  return additionalCategoryDefinitions.map((item) => item.id).filter((id) => inferred.has(id));
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
    : canonicalName === LPP_CANONICAL_NAME
      ? ["LPP", "Local Player Platform", "로컬 플레이어 플랫폼"]
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
    ? "제주소통협력센터"
    : name;
}
