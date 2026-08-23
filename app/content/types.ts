import type {
  BundledMarkerCategory,
  BundledMarkerStyle,
} from "../marker-assets";
import type { CategoryId } from "../map/core/model";
import type {
  AdditionalCategoryId,
  ConvenienceAttributeId,
} from "../place-taxonomy";

export type GlobalContentTab = "places" | "reviews" | "events" | "place-requests";
export type StoryReportReason = "inappropriate" | "privacy" | "copyright" | "spam" | "other";
export type StoryCameraPermissionState = "unknown" | "requesting" | "granted" | "denied" | "unavailable";

export type PlaceDirectoryRecord = {
  id: string;
  name: string;
  category: CategoryId;
  area: string;
  address: string;
  subtype: string;
  priority: string;
  description: string;
  operatingInfo: string;
  notes: string;
  sourceUrl: string;
  mapUrl: string;
  checkedAt: string;
  additionalCategories: AdditionalCategoryId[];
  convenienceAttributes: ConvenienceAttributeId[];
  locationGroupId: string;
  mapAnchorId: string;
  featuredRole: string;
  aliases: string[];
};

export type PlaceStory = {
  id: string;
  placeKey: string;
  placeName: string;
  authorName: string;
  reviewText: string;
  photoUrl: string | null;
  status: "published" | "hidden";
  reportCount?: number;
  reportSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlaceStoriesPayload = {
  stories?: PlaceStory[];
  story?: PlaceStory;
  canModerate?: boolean;
  persistent?: boolean;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};

export type PlaceStoryUploadDiagnostic = {
  id: string;
  placeKey: string;
  stage: "prepare" | "request" | "response" | "unknown";
  errorCode: string;
  responseStatus: number;
  sourceSize: number;
  preparedSize: number | null;
  sourceType: string;
  preparedType: string | null;
  online: number;
  userAgent: string;
  createdAt: string;
};

export type PlaceStoryDiagnosticsPayload = {
  diagnostics?: PlaceStoryUploadDiagnostic[];
  error?: string;
};

export type PerformanceDiagnostic = {
  id: string;
  metric: "startup" | "pan-settle" | "pinch-settle";
  durationMs: number;
  elementCount: number;
  labelCount: number;
  viewportWidth: number;
  viewportHeight: number;
  deviceMemory: number | null;
  hardwareConcurrency: number;
  connectionType: string;
  standalone: number;
  online: number;
  createdAt: string;
};

export type PerformanceDiagnosticsPayload = {
  diagnostics?: PerformanceDiagnostic[];
  error?: string;
};

export type PlaceEventPlace = {
  placeKey: string;
  placeName: string;
};

export type PlaceReviewCount = PlaceEventPlace & {
  count: number;
  latestCreatedAt: string | null;
};

export type PlaceEvent = {
  id: string;
  placeKey: string;
  placeName: string;
  places: PlaceEventPlace[];
  eventName: string;
  eventInfo: string;
  photoUrl: string;
  startsAt: string;
  endsAt: string;
  visibleFrom: string;
  visibleUntil: string;
  status: "active" | "hidden";
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlaceEventsPayload = {
  events?: PlaceEvent[];
  event?: PlaceEvent;
  linkedPlaces?: PlaceEventPlace[];
  canManage?: boolean;
  persistent?: boolean;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};

export type PlaceRegistrationRequest = {
  id: string;
  submittedName: string;
  submittedArea: string;
  submittedAddress: string;
  submittedDescription: string;
  submittedCategory: BundledMarkerCategory;
  submittedMarkerStyle: BundledMarkerStyle;
  submittedX: number | null;
  submittedY: number | null;
  name: string;
  area: string;
  address: string;
  description: string;
  category: BundledMarkerCategory;
  markerStyle: BundledMarkerStyle;
  markerX: number | null;
  markerY: number | null;
  status: "pending" | "reviewing" | "approved" | "rejected";
  directoryId: string | null;
  rejectionNote: string;
  createdAt: string;
  updatedAt: string;
  reviewStartedAt: string | null;
  reviewedAt: string | null;
};

export type PlaceRegistrationRequestsPayload = {
  requests?: PlaceRegistrationRequest[];
  request?: PlaceRegistrationRequest;
  directory?: PlaceDirectoryRecord;
  canManage?: boolean;
  persistent?: boolean;
  page?: number;
  pageSize?: number;
  pageCount?: number;
  total?: number;
  error?: string;
};
