import type { DocumentState } from "../../map/core/types";
import type { PlaceEventPlace, PlaceReviewCount } from "../../content/types";
import type { SiteIdentitySettings } from "../../site-identity";

export type { PlaceEventPlace, PlaceReviewCount } from "../../content/types";

const PUBLIC_LAYOUT_API = "/api/public-layout";

export type BaseMapMode = "svg" | "png" | "uploaded";

export type OptionalLabelScaleStep = {
  maximumRatio: number;
  limit: number;
};

export type PublicViewSettings = {
  baseMap: BaseMapMode;
  markerLabelsVisible: boolean;
  mergeDenseLabels: boolean;
  screenRecommendedOnly: boolean;
  defaultMarkerSize: number;
  optionalLabelScaleSteps?: OptionalLabelScaleStep[];
};

export type EditorDraftPayload = {
  document: DocumentState;
  view: PublicViewSettings;
  updatedAt: string;
  revision: number;
  hasPrevious: boolean;
};

export type LabelDensitySettingsPayload = {
  optionalLabelScaleSteps: OptionalLabelScaleStep[];
  updatedAt: string;
  revision: number;
};

export type PublicLayoutHistoryItem = {
  id: string;
  kind: "snapshot" | "published" | "restored" | "legacy";
  sourceRevision: number;
  elementCount: number;
  placedCount: number;
  createdAt: string;
  createdBy: string;
};

export type PublicLayoutHistoryEntry = PublicLayoutHistoryItem & {
  document: DocumentState;
  view: PublicViewSettings;
};

export type UploadedBaseMap = {
  available: boolean;
  canUpload?: boolean;
  name: string;
  width: number;
  height: number;
  uploadedAt: string;
  size: number;
  contentType: string;
  originalUrl?: string;
  screen2048Url?: string;
  screen4096Url?: string;
};

export type PublicLayoutPayload = {
  document?: DocumentState | null;
  view?: PublicViewSettings;
  draft?: EditorDraftPayload | null;
  labelDensitySettings?: LabelDensitySettingsPayload | null;
  siteIdentity?: SiteIdentitySettings;
  canEdit?: boolean;
  accessMethod?: "owner" | "shared" | null;
  persistent?: boolean;
  publishedAt?: string | null;
  revision?: number;
  hasPrevious?: boolean;
  history?: PublicLayoutHistoryItem[];
  historyEntry?: PublicLayoutHistoryItem | PublicLayoutHistoryEntry;
  reviewCompletedCount?: number;
  contentSummary?: {
    reviews: number;
    events: number;
    placeRequests: number;
    refreshedAt: string;
  } | null;
  eventLinkedPlaces?: PlaceEventPlace[];
  reviewCountsByPlace?: PlaceReviewCount[];
  uploadedBaseMap?: UploadedBaseMap | null;
  error?: string;
};

export type PublicLayoutResponse = {
  response: Response;
  payload: PublicLayoutPayload | null;
};

async function requestPublicLayout(url: string, init?: RequestInit): Promise<PublicLayoutResponse> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as PublicLayoutPayload | null;
  return { response, payload };
}

export function loadPublicLayout(cache: RequestCache = "no-cache") {
  return requestPublicLayout(PUBLIC_LAYOUT_API, { cache });
}

export function saveLabelDensitySettings(
  optionalLabelScaleSteps: OptionalLabelScaleStep[],
  baseRevision: number,
) {
  return requestPublicLayout(PUBLIC_LAYOUT_API, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save-label-density-settings", optionalLabelScaleSteps, baseRevision }),
  });
}

export function saveSiteIdentitySettings(displayName: string, baseRevision: number) {
  return requestPublicLayout(PUBLIC_LAYOUT_API, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save-site-identity", displayName, baseRevision }),
  });
}

export function saveEditorHistory(document: DocumentState, view: PublicViewSettings) {
  return requestPublicLayout(PUBLIC_LAYOUT_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save-history", document, view }),
  });
}

export function publishPublicLayout(document: DocumentState, view: PublicViewSettings, baseRevision: number) {
  return requestPublicLayout(PUBLIC_LAYOUT_API, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ document, view, baseRevision }),
  });
}

export function fetchPublicHistoryEntry(historyId: string) {
  return requestPublicLayout(`${PUBLIC_LAYOUT_API}?historyId=${encodeURIComponent(historyId)}`, { cache: "no-store" });
}
