"use client";
/* eslint-disable @next/next/no-img-element */

import { memo } from "react";
import type { PlaceRegistrationRequest } from "./content/types";
import {
  markerAssetSrc,
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "./marker-assets";

export type AdminPlaceRequestRecord = PlaceRegistrationRequest;

type LinkedMarkerPosition = { x: number; y: number };

export type AdminPlaceRequestListProps = {
  loading: boolean;
  error: boolean;
  requests: AdminPlaceRequestRecord[];
  actionId: string | null;
  areaOptions: string[];
  linkedMarkers: ReadonlyMap<string, LinkedMarkerPosition>;
  formatDateTime: (value: string) => string;
  onRetry: () => void;
  onUpdate: (id: string, patch: Partial<AdminPlaceRequestRecord>) => void;
  onStartReview: (request: AdminPlaceRequestRecord) => void | Promise<void>;
  onSave: (request: AdminPlaceRequestRecord) => void | Promise<void>;
  onApprove: (request: AdminPlaceRequestRecord) => void | Promise<void>;
  onReject: (request: AdminPlaceRequestRecord) => void | Promise<void>;
  onDelete: (request: AdminPlaceRequestRecord) => void | Promise<void>;
};

const categoryOptions: ReadonlyArray<{ id: BundledMarkerCategory; name: string }> = [
  { id: "culture", name: "일반 문화시설" },
  { id: "cafe", name: "카페" },
  { id: "food", name: "음식점" },
  { id: "shop", name: "소품샵" },
  { id: "parking", name: "주차장" },
  { id: "park", name: "공원·광장" },
  { id: "utility", name: "기타 편의시설" },
];

function statusLabel(status: AdminPlaceRequestRecord["status"]) {
  if (status === "pending") return "검수 대기";
  if (status === "reviewing") return "지도 검수 중";
  if (status === "approved") return "승인 완료";
  return "반려";
}

function AdminPlaceRequestList({
  loading,
  error,
  requests,
  actionId,
  areaOptions,
  linkedMarkers,
  formatDateTime,
  onRetry,
  onUpdate,
  onStartReview,
  onSave,
  onApprove,
  onReject,
  onDelete,
}: AdminPlaceRequestListProps) {
  if (loading) return <div className="global-story-state"><span className="global-story-spinner" /><strong>장소 등록 요청을 불러오는 중입니다.</strong></div>;
  if (error) return <div className="global-story-state error"><strong>장소 등록 요청을 불러오지 못했습니다.</strong><button type="button" onClick={onRetry}>다시 시도</button></div>;
  if (!requests.length) return <div className="global-story-state"><strong>대기 중인 장소 등록 요청이 없습니다.</strong><span>방문자가 요청을 보내면 이 목록에서 수정·검수하고 편집 초안에 반영할 수 있습니다.</span></div>;

  return <div className="place-request-admin-list">{requests.map((request) => {
    const closed = request.status === "approved" || request.status === "rejected";
    const disabled = closed || actionId !== null;
    const linkedMarker = linkedMarkers.get(request.id);
    const availableAreas = [...new Set([request.area, ...areaOptions])].filter(Boolean);
    const submittedChanged = request.submittedName !== request.name
      || request.submittedArea !== request.area
      || request.submittedAddress !== request.address
      || request.submittedDescription !== request.description
      || request.submittedCategory !== request.category
      || request.submittedMarkerStyle !== request.markerStyle;
    return <article className={`place-request-admin-card ${request.status}`} key={request.id}>
      <header><div><span className={`place-request-status ${request.status}`}>{statusLabel(request.status)}</span><time dateTime={request.createdAt}>{formatDateTime(request.createdAt)}</time></div><img src={markerAssetSrc(request.markerStyle, request.category)} alt="요청 마커 미리보기" loading="lazy" decoding="async" /></header>
      <label>장소명<input value={request.name} maxLength={120} disabled={closed} onChange={(event) => onUpdate(request.id, { name: event.target.value })} /></label>
      <div className="place-request-admin-row"><label>마커 분류<select value={request.category} disabled={closed} onChange={(event) => onUpdate(request.id, { category: event.target.value as BundledMarkerCategory })}>{categoryOptions.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>형태<select value={request.markerStyle} disabled={closed} onChange={(event) => onUpdate(request.id, { markerStyle: event.target.value as BundledMarkerStyle })}><option value="v2">리뉴얼 최종</option><option value="01">형태 01</option><option value="02">형태 02</option><option value="03">형태 03</option></select></label></div>
      <label>권역·세부지역<select value={request.area} disabled={closed} onChange={(event) => onUpdate(request.id, { area: event.target.value })}><option value="">선택해 주세요</option>{availableAreas.map((area) => <option value={area} key={area}>{area}</option>)}</select></label>
      <label>주소<input value={request.address} maxLength={260} disabled={closed} onChange={(event) => onUpdate(request.id, { address: event.target.value })} /></label>
      <label>설명<textarea value={request.description} maxLength={800} disabled={closed} onChange={(event) => onUpdate(request.id, { description: event.target.value })} /></label>
      <div className="place-request-coordinate-summary"><span>요청 위치</span><strong>{typeof request.submittedX === "number" && typeof request.submittedY === "number" ? `${request.submittedX.toFixed(2)}, ${request.submittedY.toFixed(2)}` : "기존 요청 · 위치 정보 없음"}</strong>{linkedMarker && <em>현재 검수 위치 {linkedMarker.x.toFixed(2)}, {linkedMarker.y.toFixed(2)}</em>}</div>
      {submittedChanged && <details><summary>요청자가 보낸 원문 보기</summary><p><b>{request.submittedName}</b><br />{request.submittedArea || "권역 미선택"}<br />{request.submittedAddress}<br />{request.submittedDescription}</p></details>}
      {request.rejectionNote && <p className="place-request-rejection-note"><b>반려 메모</b>{request.rejectionNote}</p>}
      {request.status === "approved" && <p className="place-request-approved-note">장소 DB와 검수한 지도 위치 반영 완료</p>}
      <footer><button type="button" className="review-start" disabled={disabled} onClick={() => void onStartReview(request)}>{actionId === request.id ? "처리 중…" : request.status === "reviewing" ? "지도 검수 계속" : "검수 시작"}</button><button type="button" disabled={disabled} onClick={() => void onSave(request)}>수정 저장</button><button type="button" className="approve" disabled={disabled || request.status !== "reviewing" || !linkedMarker} onClick={() => void onApprove(request)}>검수 완료·DB 반영</button><button type="button" disabled={disabled} onClick={() => void onReject(request)}>반려</button><button type="button" className="danger" disabled={actionId !== null} onClick={() => void onDelete(request)}>기록 삭제</button></footer>
    </article>;
  })}</div>;
}

export default memo(AdminPlaceRequestList);
