"use client";

import {
  lazy,
  Suspense,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import type { PublicPlaceDetailContentProps } from "./place-detail-content";

const PublicPlaceDetailContent = lazy(() => import("./place-detail-content"));

type PublicPlaceSheetProps = {
  panelRef: RefObject<HTMLElement | null>;
  expanded: boolean;
  dragging: boolean;
  dragOffsetY: number;
  placeName: string;
  categoryName: string;
  categoryColor: string;
  detail: Omit<PublicPlaceDetailContentProps, "themePicker">;
  themePicker?: ReactNode;
  onDragPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onDragPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onOpenPlaceList: () => void;
  onClose: () => void;
};

export default function PublicPlaceSheet({
  panelRef,
  expanded,
  dragging,
  dragOffsetY,
  placeName,
  categoryName,
  categoryColor,
  detail,
  themePicker,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerEnd,
  onOpenPlaceList,
  onClose,
}: PublicPlaceSheetProps) {
  return <aside
    ref={panelRef}
    className={`public-place-sheet ${expanded ? "expanded" : ""} ${dragging ? "dragging" : ""}`}
    style={{ "--panel-drag-y": `${dragOffsetY}px` } as CSSProperties}
    aria-label={`${placeName} 장소 정보`}
    aria-busy={detail.loading}
  >
    <div
      className="public-panel-drag-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="위아래로 끌어 장소 정보 패널 높이 조절"
      onPointerDown={onDragPointerDown}
      onPointerMove={onDragPointerMove}
      onPointerUp={onDragPointerEnd}
      onPointerCancel={onDragPointerEnd}
    ><span /></div>
    <header className="public-place-sheet-head">
      <div><span style={{ color: categoryColor }}>{categoryName}</span><strong>{placeName}</strong></div>
      <div className="public-place-sheet-actions"><button type="button" className="public-place-list-back" onClick={onOpenPlaceList} aria-label="장소 목록으로 돌아가기">목록</button><button type="button" onClick={onClose} aria-label="장소 정보 닫기">×</button></div>
    </header>
    <div className="public-place-sheet-scroll">
      <Suspense fallback={<div className="public-place-detail-loading" role="status" aria-live="polite"><span aria-hidden="true" /><strong>장소 화면을 준비하는 중입니다.</strong></div>}>
        <PublicPlaceDetailContent {...detail} themePicker={themePicker} />
      </Suspense>
    </div>
  </aside>;
}
