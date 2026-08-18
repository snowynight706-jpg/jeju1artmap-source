import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const primaryCalibrationSettings = sqliteTable("primary_calibration_settings", {
  name: text("name").primaryKey(),
  sourceX: real("source_x").notNull(),
  sourceY: real("source_y").notNull(),
  targetX: real("target_x").notNull(),
  targetY: real("target_y").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const lockedCoordinateSettings = sqliteTable("locked_coordinate_settings", {
  elementKey: text("element_key").primaryKey(),
  directoryId: text("directory_id"),
  name: text("name").notNull(),
  category: text("category").notNull(),
  anchorX: real("anchor_x").notNull(),
  anchorY: real("anchor_y").notNull(),
  outputX: real("output_x").notNull(),
  outputY: real("output_y").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const lockedCoordinateRevision = sqliteTable("locked_coordinate_revision", {
  id: integer("id").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const placeDirectory = sqliteTable("place_directory", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  area: text("area").notNull(),
  address: text("address").notNull(),
  subtype: text("subtype").notNull(),
  priority: text("priority").notNull(),
  description: text("description").notNull(),
  operatingInfo: text("operating_info").notNull(),
  notes: text("notes").notNull(),
  sourceUrl: text("source_url").notNull(),
  mapUrl: text("map_url").notNull(),
  checkedAt: text("checked_at").notNull(),
  additionalCategoriesJson: text("additional_categories_json").notNull().default("[]"),
  convenienceAttributesJson: text("convenience_attributes_json").notNull().default("[]"),
  locationGroupId: text("location_group_id").notNull().default(""),
  mapAnchorId: text("map_anchor_id").notNull().default(""),
  featuredRole: text("featured_role").notNull().default(""),
  aliasesJson: text("aliases_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const placeDirectoryRevision = sqliteTable("place_directory_revision", {
  id: integer("id").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const placeDirectorySourceState = sqliteTable("place_directory_source_state", {
  id: integer("id").primaryKey(),
  sourceVersion: text("source_version").notNull(),
  importedAt: text("imported_at").notNull(),
});

export const placePrintSettings = sqliteTable("place_print_settings", {
  placeKey: text("place_key").primaryKey(),
  directoryId: text("directory_id"),
  name: text("name").notNull(),
  recommended: integer("recommended", { mode: "boolean" }).notNull(),
  markerMode: text("marker_mode").notNull(),
  labelMode: text("label_mode").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const denseLabelSettings = sqliteTable("dense_label_settings", {
  id: integer("id").primaryKey(),
  positionsJson: text("positions_json").notNull(),
  excludedElementIdsJson: text("excluded_element_ids_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const placementSettings = sqliteTable("placement_settings", {
  placeKey: text("place_key").primaryKey(),
  directoryId: text("directory_id"),
  name: text("name").notNull(),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const placementRevision = sqliteTable("placement_revision", {
  id: integer("id").primaryKey(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const publicMapLayout = sqliteTable("public_map_layout", {
  id: integer("id").primaryKey(),
  documentJson: text("document_json").notNull(),
  viewSettingsJson: text("view_settings_json").notNull(),
  previousDocumentJson: text("previous_document_json"),
  previousViewSettingsJson: text("previous_view_settings_json"),
  publishedAt: text("published_at").notNull(),
  publishedBy: text("published_by").notNull(),
  revision: integer("revision").notNull(),
});

export const mapEditorDraft = sqliteTable("map_editor_draft", {
  id: integer("id").primaryKey(),
  documentJson: text("document_json").notNull(),
  viewSettingsJson: text("view_settings_json").notNull(),
  previousDocumentJson: text("previous_document_json"),
  previousViewSettingsJson: text("previous_view_settings_json"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  revision: integer("revision").notNull(),
});

export const placeStories = sqliteTable("place_stories", {
  id: text("id").primaryKey(),
  placeKey: text("place_key").notNull(),
  placeName: text("place_name").notNull(),
  authorName: text("author_name").notNull(),
  reviewText: text("review_text").notNull(),
  photoKey: text("photo_key"),
  photoContentType: text("photo_content_type"),
  photoSize: integer("photo_size"),
  status: text("status").notNull(),
  actorHash: text("actor_hash").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  moderatedBy: text("moderated_by"),
}, (table) => [
  index("place_stories_place_status_created_idx").on(table.placeKey, table.status, table.createdAt),
  index("place_stories_actor_created_idx").on(table.actorHash, table.createdAt),
  index("place_stories_status_created_idx").on(table.status, table.createdAt),
]);

export const placeEvents = sqliteTable("place_events", {
  id: text("id").primaryKey(),
  placeKey: text("place_key").notNull(),
  placeName: text("place_name").notNull(),
  eventName: text("event_name").notNull(),
  eventInfo: text("event_info").notNull(),
  photoKey: text("photo_key").notNull(),
  photoContentType: text("photo_content_type").notNull(),
  photoSize: integer("photo_size").notNull(),
  visibleFrom: text("visible_from").notNull(),
  visibleUntil: text("visible_until").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, (table) => [
  index("place_events_place_status_visibility_idx").on(table.placeKey, table.status, table.visibleFrom, table.visibleUntil),
  index("place_events_status_visibility_created_idx").on(table.status, table.visibleFrom, table.visibleUntil, table.createdAt),
]);

export const placeEventPlaces = sqliteTable("place_event_places", {
  eventId: text("event_id").notNull(),
  placeKey: text("place_key").notNull(),
  placeName: text("place_name").notNull(),
  position: integer("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.placeKey] }),
  index("place_event_places_place_event_idx").on(table.placeKey, table.eventId),
]);

export const placeRegistrationRequests = sqliteTable("place_registration_requests", {
  id: text("id").primaryKey(),
  submittedName: text("submitted_name").notNull(),
  submittedArea: text("submitted_area").notNull().default(""),
  submittedAddress: text("submitted_address").notNull(),
  submittedDescription: text("submitted_description").notNull(),
  submittedCategory: text("submitted_category").notNull(),
  submittedMarkerStyle: text("submitted_marker_style").notNull(),
  submittedX: real("submitted_x"),
  submittedY: real("submitted_y"),
  name: text("name").notNull(),
  area: text("area").notNull().default(""),
  address: text("address").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  markerStyle: text("marker_style").notNull(),
  markerX: real("marker_x"),
  markerY: real("marker_y"),
  status: text("status").notNull(),
  actorHash: text("actor_hash").notNull(),
  directoryId: text("directory_id"),
  rejectionNote: text("rejection_note").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  reviewStartedAt: text("review_started_at"),
  reviewStartedBy: text("review_started_by"),
  reviewedAt: text("reviewed_at"),
  reviewedBy: text("reviewed_by"),
}, (table) => [
  index("place_registration_requests_status_created_idx").on(table.status, table.createdAt),
  index("place_registration_requests_actor_created_idx").on(table.actorHash, table.createdAt),
]);

export const adminLoginAttempts = sqliteTable("admin_login_attempts", {
  actorHash: text("actor_hash").primaryKey(),
  failureCount: integer("failure_count").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
