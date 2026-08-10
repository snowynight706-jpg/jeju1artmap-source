import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
