import type { MapElement } from "./types";

export const elementDefaults: Omit<
  MapElement,
  "id" | "name" | "category" | "x" | "y" | "anchorX" | "anchorY" | "size" | "z"
> = {
  labelVisible: false,
  labelLocked: false,
  labelPosition: "bottom",
  labelGap: 8,
  labelOffsetX: 0,
  labelOffsetY: 0,
  opacity: 100,
  connectorVisible: false,
  connectorColor: "#537b74",
  connectorWidth: 1.5,
  assetId: null,
  status: "unchecked",
  locked: false,
  mapVisible: true,
  memo: "",
  address: "",
  addressSourceUrl: "",
};
