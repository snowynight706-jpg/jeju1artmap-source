"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const UI_THEME_STORAGE_KEY = "jeju-wondosim-map-review:ui-theme:v1";

const uiThemes = [
  { id: "stormy", name: "스토미 미니멀", shortName: "스토미", colors: ["#FAFAFA", "#E1E2E5", "#B9BBC1", "#70737C", "#2B2D33"] },
  { id: "nordic-sand", name: "노르딕 샌드", shortName: "샌드", colors: ["#F6F3EF", "#DED9D2", "#B4AEA6", "#7A746D", "#3A3835"] },
  { id: "lilac", name: "라일락", shortName: "라일락", colors: ["#F4F2F7", "#D6D2DF", "#A59DB6", "#5D556F", "#26222F"] },
  { id: "urban-blush", name: "어반 블러시", shortName: "블러시", colors: ["#F6F2F4", "#DED5DA", "#B7A4AC", "#6E5B63", "#C07B8F"] },
  { id: "harbor-morning", name: "항구의 아침", shortName: "항구", colors: ["#F0F3F7", "#C8D2E0", "#8EA2BB", "#4E647A", "#26313B"] },
] as const;

export type UiThemeId = (typeof uiThemes)[number]["id"];

function isUiThemeId(value: unknown): value is UiThemeId {
  return typeof value === "string" && uiThemes.some((theme) => theme.id === value);
}

export function UiThemeSwatch({ colors }: { colors: readonly string[] }) {
  return <span className="ui-theme-swatch" aria-hidden="true">{colors.map((color, index) => (
    <i style={{ background: color }} key={`${color}-${index}`} />
  ))}</span>;
}

export function UiThemePicker({ activeTheme, compact = false, onSelect }: {
  activeTheme: UiThemeId;
  compact?: boolean;
  onSelect: (theme: UiThemeId) => void;
}) {
  return <div className={`ui-theme-picker ${compact ? "compact" : ""}`} role="group" aria-label="화면 테마 선택">
    {uiThemes.map((theme) => <button
      type="button"
      className={activeTheme === theme.id ? "active" : ""}
      aria-pressed={activeTheme === theme.id}
      aria-label={`${theme.name} 테마`}
      title={theme.name}
      onClick={() => onSelect(theme.id)}
      key={theme.id}
    >
      <UiThemeSwatch colors={theme.colors} />
      {!compact && <span>{theme.shortName}</span>}
    </button>)}
  </div>;
}

export function useUiTheme() {
  const [uiTheme, setUiTheme] = useState<UiThemeId>("stormy");

  const selectUiTheme = useCallback((theme: UiThemeId) => {
    setUiTheme(theme);
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
    } catch {
      // 테마 선택은 저장소가 차단된 환경에서도 현재 화면에 바로 적용합니다.
    }
  }, []);

  useEffect(() => {
    let restoreFrame = 0;
    try {
      const savedTheme = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
      if (isUiThemeId(savedTheme)) {
        restoreFrame = window.requestAnimationFrame(() => setUiTheme(savedTheme));
      }
    } catch {
      // 스토리지 사용이 불가능하면 기본 테마를 유지합니다.
    }
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  const activeUiTheme = useMemo(
    () => uiThemes.find((theme) => theme.id === uiTheme) ?? uiThemes[0],
    [uiTheme],
  );

  return { uiTheme, activeUiTheme, selectUiTheme };
}
