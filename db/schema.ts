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
