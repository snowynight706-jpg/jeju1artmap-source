import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const primaryCalibrationSettings = sqliteTable("primary_calibration_settings", {
  name: text("name").primaryKey(),
  sourceX: real("source_x").notNull(),
  sourceY: real("source_y").notNull(),
  targetX: real("target_x").notNull(),
  targetY: real("target_y").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});
