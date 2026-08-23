"use client";
/* eslint-disable @next/next/no-img-element */

import {
  lazy,
  Suspense,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import type { AdminDiagnosticsPanelProps } from "../admin-diagnostics-panel";
import type { AdminPlaceRequestListProps } from "../admin-place-request-list";
import type { PublicExplorerActivityContentProps } from "./explorer-activity-content";

const AdminDiagnosticsPanel = lazy(() => import("../admin-diagnostics-panel"));
const AdminPlaceRequestList = lazy(() => import("../admin-place-request-list"));
const PublicExplorerActivityContent = lazy(() => import("./explorer-activity-content"));

export type PublicExplorerTab = "places" | "reviews" | "events" | "place-requests";

export type PublicExplorerPlaceRow = {
  id: string;
  displayName: string;
  isMainHub: boolean;
  selected: boolean;
  eventListedInCulture: boolean;
  markerColor: string;
  primaryCategoryName: string;
  primaryCategoryColor: string;
  tagNames: string[];
};

type ExplorerCategory = {
  id: string;
  name: string;
  color: string;
  iconSrc: string;
  count: number;
};

type PaginationProps = {
  current: number;
  count: number;
  loading: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

type PublicExplorerPanelProps = {
  access: "editor" | "viewer";
  panelRef: RefObject<HTMLElement | null>;
  queryInputRef: RefObject<HTMLInputElement | null>;
  panel: {
    open: boolean;
    hasSelectedPlace: boolean;
    expanded: boolean;
    dragging: boolean;
    dragOffsetY: number;
    onToggle: () => void;
    onClose: () => void;
    onDragPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onDragPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onDragPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onOpenPlaceRequest: () => void;
  };
  tabs: {
    active: PublicExplorerTab;
    placeCount: number;
    reviewCount: number | null;
    eventCount: number | null;
    placeRequestCount: number | null;
    onSelect: (tab: PublicExplorerTab) => void;
  };
  places: {
    query: string;
    activeCategory: string;
    categories: readonly ExplorerCategory[];
    rows: PublicExplorerPlaceRow[];
    expandedAdditionalCategoryItemId: string | null;
    onQueryChange: (value: string) => void;
    onCategoryChange: (categoryId: string) => void;
    onResetFilters: () => void;
    onExpandedAdditionalCategoryChange: (itemId: string | null) => void;
    onFocusPlace: (itemId: string, showDetails: boolean) => void;
  };
  eventManagement: {
    canManage: boolean;
    onCreate: () => void;
  };
  diagnostics: AdminDiagnosticsPanelProps;
  activity: Omit<PublicExplorerActivityContentProps, "tab" | "access">;
  requests: AdminPlaceRequestListProps;
  pagination: {
    reviews: PaginationProps;
    events: PaginationProps;
    placeRequests: PaginationProps;
  };
};

function MagnifierIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="10.5" cy="10.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="m14.75 14.75 4.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
  </svg>;
}

function Pagination({ label, pagination }: { label: string; pagination: PaginationProps }) {
  if (pagination.count <= 1) return null;
  return <footer className="global-story-pagination" aria-label={`${label} 페이지 이동`}>
    <button type="button" disabled={pagination.current <= 1 || pagination.loading} onClick={pagination.onPrevious}>이전</button>
    <span><b>{pagination.current}</b> / {pagination.count}</span>
    <button type="button" disabled={pagination.current >= pagination.count || pagination.loading} onClick={pagination.onNext}>다음</button>
  </footer>;
}

export default function PublicExplorerPanel({
  access,
  panelRef,
  queryInputRef,
  panel,
  tabs,
  places,
  eventManagement,
  diagnostics,
  activity,
  requests,
  pagination,
}: PublicExplorerPanelProps) {
  return <>
    {access === "viewer" && !panel.hasSelectedPlace && <button type="button" className={`global-story-toggle ${panel.open ? "active" : ""}`} onClick={panel.onToggle} aria-expanded={panel.open} aria-controls="global-story-panel">
      <span aria-hidden="true">⌖</span><strong>{panel.open ? "탐색 닫기" : "장소 · 리뷰 · 행사"}</strong>{tabs.placeCount > 0 && <em>{tabs.placeCount}</em>}
    </button>}
    {panel.open && <aside
      ref={panelRef}
      id="global-story-panel"
      className={`global-story-panel ${access === "editor" ? "moderation" : "public-explorer-panel"} ${access === "viewer" && panel.expanded ? "expanded" : ""} ${panel.dragging ? "dragging" : ""}`}
      style={{ "--panel-drag-y": `${panel.dragOffsetY}px` } as CSSProperties}
      aria-label={access === "editor" ? "전체 장소 리뷰와 행사 관리" : "원도심 장소·리뷰·행사 탐색"}
    >
      {access === "viewer" && <div
        className="public-panel-drag-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="위아래로 끌어 장소·리뷰·행사 패널 높이 조절"
        onPointerDown={panel.onDragPointerDown}
        onPointerMove={panel.onDragPointerMove}
        onPointerUp={panel.onDragPointerEnd}
        onPointerCancel={panel.onDragPointerEnd}
      ><span /></div>}
      <header className="global-story-panel-head">
        <div><strong>{access === "editor" ? "리뷰·행사 관리" : "원도심 탐색"}</strong><span>{access === "editor" ? "전체 장소의 최신 기록과 현재 행사" : "목록을 보면서 지도 위치를 바로 확인하세요."}</span></div>
        <div className="global-story-panel-head-actions">
          {access === "viewer" && <button type="button" className="place-request-open-button" onClick={panel.onOpenPlaceRequest}>＋ 장소 등록 요청</button>}
          <button type="button" className="global-panel-close" onClick={panel.onClose} aria-label="탐색 패널 닫기">×</button>
        </div>
      </header>
      <div className={`global-content-tabs ${access === "editor" ? "admin" : "public"}`} role="tablist" aria-label="장소와 리뷰, 행사 선택">
        {access === "viewer" && <button type="button" role="tab" aria-selected={tabs.active === "places"} className={tabs.active === "places" ? "active" : ""} onClick={() => tabs.onSelect("places")}>장소 <span>{tabs.placeCount}</span></button>}
        <button type="button" role="tab" aria-selected={tabs.active === "reviews"} className={tabs.active === "reviews" ? "active" : ""} onClick={() => tabs.onSelect("reviews")}>최신 리뷰 <span>{tabs.reviewCount ?? "—"}</span></button>
        <button type="button" role="tab" aria-selected={tabs.active === "events"} className={tabs.active === "events" ? "active" : ""} onClick={() => tabs.onSelect("events")}>행사 <span>{tabs.eventCount ?? "—"}</span></button>
        {access === "editor" && <button type="button" role="tab" aria-selected={tabs.active === "place-requests"} className={tabs.active === "place-requests" ? "active" : ""} onClick={() => tabs.onSelect("place-requests")}>장소 요청 <span>{tabs.placeRequestCount ?? "—"}</span></button>}
      </div>
      <div className="global-story-panel-scroll" aria-live="polite">
        {access === "editor" && tabs.active === "events" && <div className="global-event-management-toolbar">
          <div><strong>새 행사 등록</strong><span>장소 연결 없이 원도심 공통 행사로 등록할 수도 있습니다.</span></div>
          <button type="button" disabled={!eventManagement.canManage} onClick={eventManagement.onCreate}>{eventManagement.canManage ? "＋ 행사 등록" : "권한 확인 중…"}</button>
        </div>}
        {access === "editor" && tabs.active === "reviews" && <Suspense fallback={<div className="upload-diagnostic-state"><span className="global-story-spinner" /><strong>관리자 진단 도구를 불러오는 중입니다.</strong></div>}>
          <AdminDiagnosticsPanel {...diagnostics} />
        </Suspense>}
        {tabs.active === "places" ? <section className="public-place-explorer">
          <div className="public-place-search-row">
            <button type="button" className={`public-place-all-button ${places.activeCategory === "all" ? "active" : ""}`} onClick={() => places.onCategoryChange("all")} aria-pressed={places.activeCategory === "all"}>전체 <em>{tabs.placeCount}</em></button>
            <div className="public-place-search"><span aria-hidden="true">⌕</span><input ref={queryInputRef} value={places.query} onChange={(event) => places.onQueryChange(event.target.value)} placeholder="장소명·주소·분류 검색" aria-label="공개 장소 검색" />{places.query && <button type="button" onClick={() => places.onQueryChange("")} aria-label="장소 검색어 지우기">×</button>}</div>
          </div>
          <div className="public-place-filter-summary">
            <span role="status">검색 결과 <strong>{places.rows.length}</strong>곳</span>
            {(places.activeCategory !== "all" || places.query) && <button type="button" className="public-place-filter-reset" onClick={places.onResetFilters}>조건 초기화</button>}
          </div>
          <div className="public-place-category-chips" role="list" aria-label="장소 카테고리">{places.categories.map((category) => <button type="button" role="listitem" className={places.activeCategory === category.id ? "active" : ""} style={{ "--category-color": category.color } as CSSProperties} onClick={() => places.onCategoryChange(category.id)} key={category.id}><img src={category.iconSrc} width={96} height={96} alt="" aria-hidden="true" /><span>{category.name}</span><em>{category.count}</em></button>)}</div>
          <div className="public-place-list-header" aria-hidden="true"><span>장소명</span><span>대분류</span><span>추가분류</span><span className="public-place-detail-heading" title="상세보기"><MagnifierIcon /></span></div>
          <div className="public-place-list" role="list" aria-label={`${places.activeCategory === "all" ? "전체 장소" : places.categories.find((category) => category.id === places.activeCategory)?.name ?? "장소"} 목록`}>
            {places.rows.map((item) => {
              const tagLabel = item.tagNames.length ? item.tagNames.join(" · ") : "—";
              const representativeTagNames = item.tagNames.slice(0, 2);
              const remainingTagNames = item.tagNames.slice(2);
              return <article className={`${item.selected ? "selected" : ""} ${item.isMainHub ? "main-hub" : ""} ${item.eventListedInCulture ? "event-linked" : ""}`} key={item.id} role="listitem">
                <button type="button" className="public-place-row-action" onClick={() => places.onFocusPlace(item.id, false)} aria-label={`${item.displayName} 지도에서 찾기`} aria-current={item.selected ? "location" : undefined} />
                <span className="public-place-identity"><i className="public-place-marker-key" style={{ background: item.markerColor }} aria-hidden="true" /><strong title={item.displayName}>{item.displayName}</strong>{item.eventListedInCulture && <em className="public-place-event-badge">행사</em>}</span>
                <span className="public-place-primary-category" style={{ color: item.primaryCategoryColor }} title={item.primaryCategoryName}>{item.primaryCategoryName}</span>
                <div className={`public-place-additional-category ${remainingTagNames.length ? "has-more" : ""} ${places.expandedAdditionalCategoryItemId === item.id ? "is-expanded" : ""}`} title={remainingTagNames.length ? undefined : item.tagNames.length ? tagLabel : "추가분류 없음"} onPointerEnter={() => {
                  if (places.expandedAdditionalCategoryItemId && places.expandedAdditionalCategoryItemId !== item.id) places.onExpandedAdditionalCategoryChange(null);
                }} onPointerLeave={(event) => {
                  if (event.pointerType === "mouse" && places.expandedAdditionalCategoryItemId === item.id) places.onExpandedAdditionalCategoryChange(null);
                }}>
                  {remainingTagNames.length > 0 ? <>
                    <button type="button" className="public-place-additional-category-disclosure" aria-expanded={places.expandedAdditionalCategoryItemId === item.id} aria-label={`${representativeTagNames.join(", ")} 외 추가분류 ${remainingTagNames.length}개 더 보기`} title={`추가분류 ${remainingTagNames.length}개 더 보기`} onClick={() => places.onExpandedAdditionalCategoryChange(places.expandedAdditionalCategoryItemId === item.id ? null : item.id)}>
                      <span className="public-place-additional-category-preview">{representativeTagNames.join(" · ")}</span>
                      <span className="public-place-additional-category-count" aria-hidden="true">+{remainingTagNames.length}</span>
                    </button>
                    <div className="public-place-additional-category-popover" data-density={remainingTagNames.length <= 2 ? "compact" : "adaptive"} role="list" aria-label="나머지 추가분류">
                      {remainingTagNames.map((tagName) => <span role="listitem" key={tagName}>{tagName}</span>)}
                    </div>
                  </> : <span className="public-place-additional-category-preview">{representativeTagNames.length ? representativeTagNames.join(" · ") : "—"}</span>}
                </div>
                <button type="button" className="public-place-open-action" onClick={() => places.onFocusPlace(item.id, true)} aria-label={`${item.displayName} 상세보기`} title="상세보기" aria-current={item.selected ? "true" : undefined}><MagnifierIcon /></button>
              </article>;
            })}
            {!places.rows.length && <div className="public-place-empty"><strong>조건에 맞는 장소가 없습니다.</strong><span>검색어나 카테고리를 바꿔보세요.</span></div>}
          </div>
        </section> : tabs.active === "reviews" || tabs.active === "events" ? <Suspense fallback={<div className="global-story-state"><span className="global-story-spinner" /><strong>{tabs.active === "reviews" ? "리뷰 화면을 준비하는 중입니다." : "행사 화면을 준비하는 중입니다."}</strong></div>}>
          <PublicExplorerActivityContent {...activity} key={tabs.active} tab={tabs.active} access={access} />
        </Suspense> : <Suspense fallback={<div className="global-story-state"><span className="global-story-spinner" /><strong>장소 요청 관리 화면을 준비하는 중입니다.</strong></div>}>
          <AdminPlaceRequestList {...requests} />
        </Suspense>}
      </div>
      {tabs.active === "places" ? null : tabs.active === "reviews" ? <Pagination label="최신 리뷰" pagination={pagination.reviews} />
        : tabs.active === "events" ? <Pagination label="행사" pagination={pagination.events} />
          : <Pagination label="장소 등록 요청" pagination={pagination.placeRequests} />}
    </aside>}
  </>;
}
