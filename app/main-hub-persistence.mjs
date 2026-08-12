export const MAIN_HUB_DIRECTORY_ID = "place-sotong-center";
export const MAIN_HUB_ASSET_ID = "jeju-communication-center-a02";
export const MAIN_HUB_DEFAULT_SIZE = 6.2;
export const MAIN_HUB_DEFAULT_LABEL_GAP = 8;

const MAIN_HUB_NAMES = new Set([
  "제주시소통협력센터",
  "제주소통협력센터",
  "제주특별자치도소통협력센터",
  "제주소통협력센터메인오피스",
]);
const MAIN_HUB_ALIASES = [
  "제주소통협력센터",
  "제주소통협력센터 메인 오피스",
  "제주특별자치도 소통협력센터",
];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "") : "";
}

function finiteNumber(value, fallback, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

export function isMainHubPersistenceTarget(value) {
  if (!isRecord(value)) return false;
  const directoryId = typeof value.directoryId === "string" ? value.directoryId.trim() : "";
  const key = typeof value.key === "string" ? value.key.trim() : "";
  return directoryId === MAIN_HUB_DIRECTORY_ID
    || key === `directory:${MAIN_HUB_DIRECTORY_ID}`
    || MAIN_HUB_NAMES.has(normalizedName(value.name));
}

export function stableMainHubResourceSize(value) {
  return finiteNumber(value, MAIN_HUB_DEFAULT_SIZE, 0.1, 40);
}

export function withoutMainHubPlacementOverrides(value) {
  return Array.isArray(value) ? value.filter((item) => !isMainHubPersistenceTarget(item)) : [];
}

function mainHubDirectoryPlace(document) {
  if (!Array.isArray(document.directoryPlaces)) return null;
  return document.directoryPlaces.find((place) => isMainHubPersistenceTarget(place)) ?? null;
}

export function consolidateMainHubDirectoryPlaces(value) {
  if (!Array.isArray(value)) return value;
  const candidates = value.filter((place) => isMainHubPersistenceTarget(place));
  if (!candidates.length) return value;
  const primary = candidates.find((place) => place?.id === MAIN_HUB_DIRECTORY_ID) ?? candidates[0];
  const aliases = [...new Set([
    ...MAIN_HUB_ALIASES,
    ...candidates.flatMap((place) => Array.isArray(place?.aliases) ? place.aliases : []),
  ])];
  const stablePlace = {
    ...primary,
    id: MAIN_HUB_DIRECTORY_ID,
    name: "제주시소통협력센터",
    category: "culture",
    featuredRole: "workation-main-hub",
    aliases,
  };
  let inserted = false;
  return value.flatMap((place) => {
    if (!isMainHubPersistenceTarget(place)) return [place];
    if (inserted) return [];
    inserted = true;
    return [stablePlace];
  });
}

function defaultMainHubElement(document) {
  const place = mainHubDirectoryPlace(document);
  const x = finiteNumber(place?.x, 45, 0, 100);
  const y = finiteNumber(place?.y, 59, 0, 100);
  const z = Array.isArray(document.elements)
    ? document.elements.reduce((highest, item) => Math.max(highest, finiteNumber(item?.z, 0, -100000, 100000)), 0) + 1
    : 1;
  return {
    id: "system-main-hub-sotong",
    directoryId: typeof place?.id === "string" && place.id.trim() ? place.id.trim() : MAIN_HUB_DIRECTORY_ID,
    name: "제주시소통협력센터",
    category: "landmark",
    x,
    y,
    anchorX: x,
    anchorY: y,
    size: MAIN_HUB_DEFAULT_SIZE,
    z,
    labelVisible: true,
    labelLocked: false,
    labelPosition: "bottom",
    labelGap: MAIN_HUB_DEFAULT_LABEL_GAP,
    labelOffsetX: 0,
    labelOffsetY: 0,
    opacity: 100,
    connectorVisible: false,
    connectorColor: "#537b74",
    connectorWidth: 1.5,
    assetId: MAIN_HUB_ASSET_ID,
    status: "approved",
    locked: false,
    mapVisible: true,
    memo: "",
    address: typeof place?.address === "string" ? place.address : "제주특별자치도 제주시 관덕로 44",
    addressSourceUrl: "",
  };
}

export function stabilizeMainHubDocument(value) {
  if (!isRecord(value) || !Array.isArray(value.elements)) return value;
  const directoryPlaces = consolidateMainHubDirectoryPlaces(value.directoryPlaces);
  const stableValue = Array.isArray(directoryPlaces) ? { ...value, directoryPlaces } : value;
  const candidates = stableValue.elements.filter((element) => isMainHubPersistenceTarget(element));
  const existing = candidates[0] ?? null;
  const fallback = defaultMainHubElement(stableValue);
  const stableHub = existing ? {
    ...existing,
    directoryId: MAIN_HUB_DIRECTORY_ID,
    name: "제주시소통협력센터",
    category: "landmark",
    size: stableMainHubResourceSize(existing.size),
    labelVisible: true,
    labelPosition: ["top", "bottom", "left", "right"].includes(existing.labelPosition) ? existing.labelPosition : "bottom",
    labelGap: finiteNumber(existing.labelGap, MAIN_HUB_DEFAULT_LABEL_GAP, 0, 80),
    assetId: MAIN_HUB_ASSET_ID,
    status: "approved",
    mapVisible: true,
  } : fallback;
  let inserted = false;
  const elements = stableValue.elements.flatMap((element) => {
    if (!isMainHubPersistenceTarget(element)) return [element];
    if (inserted) return [];
    inserted = true;
    return [stableHub];
  });
  if (!inserted) elements.push(stableHub);
  return {
    ...stableValue,
    elements,
    ...(Object.prototype.hasOwnProperty.call(stableValue, "placementOverrides")
      ? { placementOverrides: withoutMainHubPlacementOverrides(stableValue.placementOverrides) }
      : {}),
  };
}
