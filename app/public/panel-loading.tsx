"use client";

export function PublicPlaceSheetLoading({
  expanded,
  placeName,
}: {
  expanded: boolean;
  placeName: string;
}) {
  return <aside
    className={`public-place-sheet ${expanded ? "expanded" : ""}`}
    aria-label={`${placeName} 장소 정보 불러오는 중`}
    aria-busy="true"
  >
    <div className="public-place-detail-loading" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <strong>장소 화면을 준비하는 중입니다.</strong>
    </div>
  </aside>;
}

export function PublicExplorerPanelLoading({
  access,
  expanded,
}: {
  access: "editor" | "viewer";
  expanded: boolean;
}) {
  return <aside
    id="global-story-panel"
    className={`global-story-panel ${access === "editor" ? "moderation" : "public-explorer-panel"} ${access === "viewer" && expanded ? "expanded" : ""}`}
    aria-label="원도심 탐색 화면 불러오는 중"
    aria-busy="true"
  >
    <div className="global-story-state" role="status">
      <span className="global-story-spinner" />
      <strong>원도심 탐색 화면을 준비하는 중입니다.</strong>
    </div>
  </aside>;
}

export function PublicDialogLoading() {
  return <div className="admin-login-backdrop" role="status" aria-live="polite">
    <div className="admin-module-loading">
      <span className="global-story-spinner" />
      <strong>요청한 화면을 준비하는 중입니다.</strong>
    </div>
  </div>;
}
