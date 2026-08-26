"use client";
/* eslint-disable @next/next/no-img-element */

import type { FormEvent } from "react";

import {
  markerAssetSrc,
  type BundledMarkerCategory,
  type BundledMarkerStyle,
} from "../marker-assets";
import { categories } from "../map/core/model";
import type { StoryReportReason } from "../content/types";

const storyReportReasons: Array<{ id: StoryReportReason; label: string }> = [
  { id: "inappropriate", label: "부적절한 내용" },
  { id: "privacy", label: "개인정보 노출" },
  { id: "copyright", label: "사진·저작권 문제" },
  { id: "spam", label: "광고·도배" },
  { id: "other", label: "기타" },
];

const markerStyles: BundledMarkerStyle[] = ["v2", "01", "02", "03"];

type PublicViewerDialogsProps = {
  storyReport: {
    target: { placeName: string; authorName: string; reviewText: string } | null;
    reason: StoryReportReason;
    detail: string;
    submitting: boolean;
    onClose: () => void;
    onReasonChange: (reason: StoryReportReason) => void;
    onDetailChange: (detail: string) => void;
    onSubmit: () => void;
  };
  placeRequest: {
    open: boolean;
    category: BundledMarkerCategory;
    markerStyle: BundledMarkerStyle;
    location: { x: number; y: number } | null;
    area: string;
    areaOptions: string[];
    name: string;
    address: string;
    description: string;
    submitting: boolean;
    canSubmit: boolean;
    onClose: () => void;
    onCategoryChange: (category: BundledMarkerCategory) => void;
    onMarkerStyleChange: (style: BundledMarkerStyle) => void;
    onChooseLocation: () => void;
    onAreaChange: (area: string) => void;
    onNameChange: (name: string) => void;
    onAddressChange: (address: string) => void;
    onDescriptionChange: (description: string) => void;
    onSubmit: () => void;
  };
  adminLogin: {
    open: boolean;
    password: string;
    error: string;
    submitting: boolean;
    onClose: () => void;
    onPasswordChange: (password: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  };
};

export default function PublicViewerDialogs({
  storyReport,
  placeRequest,
  adminLogin,
}: PublicViewerDialogsProps) {
  return <>
    {storyReport.target && <div className="story-report-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) storyReport.onClose(); }}>
      <section className="story-report-dialog" role="dialog" aria-modal="true" aria-labelledby="story-report-title" aria-describedby="story-report-note">
        <header><div><strong id="story-report-title">후기·사진 신고</strong><span>{storyReport.target.placeName} · {storyReport.target.authorName}</span></div><button type="button" disabled={storyReport.submitting} onClick={storyReport.onClose} aria-label="신고 창 닫기">×</button></header>
        <div className="story-report-dialog-body">
          <p className="story-report-preview">{storyReport.target.reviewText}</p>
          <label>신고 사유<select value={storyReport.reason} onChange={(event) => storyReport.onReasonChange(event.target.value as StoryReportReason)}>{storyReportReasons.map((reason) => <option value={reason.id} key={reason.id}>{reason.label}</option>)}</select></label>
          <label>추가 설명 <span>선택</span><textarea value={storyReport.detail} maxLength={300} onChange={(event) => storyReport.onDetailChange(event.target.value)} placeholder="관리자가 확인할 내용을 적어주세요." /><small>{storyReport.detail.length}/300</small></label>
          <p id="story-report-note">신고 즉시 삭제되지는 않으며, 관리자 검수 후 숨김 또는 삭제됩니다. 같은 후기는 한 번만 신고할 수 있습니다.</p>
        </div>
        <footer><button type="button" disabled={storyReport.submitting} onClick={storyReport.onClose}>취소</button><button type="button" className="primary" disabled={storyReport.submitting} onClick={storyReport.onSubmit}>{storyReport.submitting ? "접수 중…" : "신고 접수"}</button></footer>
      </section>
    </div>}

    {placeRequest.open && <div className="place-request-backdrop" role="presentation">
      <section className="place-request-dialog" role="dialog" aria-modal="true" aria-labelledby="place-request-dialog-title">
        <header><div><strong id="place-request-dialog-title">장소 등록 요청</strong><span>지도에 추가되면 좋을 원도심 장소를 알려주세요.</span></div><button type="button" onClick={placeRequest.onClose} aria-label="장소 등록 요청 닫기">×</button></header>
        <div className="place-request-dialog-scroll">
          <div className="place-request-marker-section"><div><strong>마커 형태</strong><span>장소의 주된 운영 목적에 맞는 기본분류 하나를 선택해 주세요.</span></div><label>기본분류<select value={placeRequest.category} onChange={(event) => placeRequest.onCategoryChange(event.target.value as BundledMarkerCategory)}>{categories.filter((category) => (["culture", "cafe", "food", "shop"] as string[]).includes(category.id)).map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><div className="place-request-style-grid" role="radiogroup" aria-label="마커 형태 선택">{markerStyles.map((style) => <button type="button" role="radio" aria-checked={placeRequest.markerStyle === style} className={placeRequest.markerStyle === style ? "active" : ""} key={style} onClick={() => placeRequest.onMarkerStyleChange(style)}><img src={markerAssetSrc(style, placeRequest.category)} alt="" /><span>{style === "v2" ? "리뉴얼 최종" : `형태 ${style}`}</span></button>)}</div></div>
          <section className={`place-request-location-field ${placeRequest.location ? "selected" : ""}`}><div><img src={markerAssetSrc(placeRequest.markerStyle, placeRequest.category)} alt="" /><span><strong>지도에서 마커 위치 지정 <em>필수</em></strong><small>{placeRequest.location ? `위치 선택됨 · ${placeRequest.location.x.toFixed(2)}, ${placeRequest.location.y.toFixed(2)}` : "실제 장소가 있는 지점을 지도에서 눌러 주세요."}</small></span></div><button type="button" onClick={placeRequest.onChooseLocation}>{placeRequest.location ? "위치 다시 지정" : "지도에서 지정"}</button></section>
          <label>장소 이름 <em>필수</em><input value={placeRequest.name} maxLength={120} placeholder="예: 카페단단" onChange={(event) => placeRequest.onNameChange(event.target.value)} /></label>
          <label>권역·세부지역 <em>필수 · 기존 값 선택</em><select value={placeRequest.area} aria-label="장소 등록 요청 권역·세부지역 선택" onChange={(event) => placeRequest.onAreaChange(event.target.value)}><option value="">선택해 주세요</option>{placeRequest.areaOptions.map((area) => <option value={area} key={area}>{area}</option>)}</select></label>
          <label>주소 <em>필수</em><input value={placeRequest.address} maxLength={260} placeholder="도로명 주소를 적어주세요." onChange={(event) => placeRequest.onAddressChange(event.target.value)} /></label>
          <label>장소 설명 <em>필수</em><textarea value={placeRequest.description} maxLength={800} placeholder="어떤 장소인지, 지도에 소개할 핵심 내용을 짧게 적어주세요." onChange={(event) => placeRequest.onDescriptionChange(event.target.value)} /><small>{placeRequest.description.length}/800</small></label>
          <p>요청은 곧바로 공개되지 않습니다. 관리자가 장소 정보와 마커를 수정·검수한 뒤 지도 편집 초안에 반영합니다.</p>
        </div>
        <footer><button type="button" onClick={placeRequest.onClose}>취소</button><button type="button" className="primary" disabled={!placeRequest.canSubmit} onClick={placeRequest.onSubmit}>{placeRequest.submitting ? "요청 저장 중…" : "등록 요청 보내기"}</button></footer>
      </section>
    </div>}

    {adminLogin.open && <div className="admin-login-backdrop" role="presentation">
      <section className="admin-login-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-login-title">
        <header><div><strong id="admin-login-title">관리자 로그인</strong><span>지도 편집과 리뷰·행사·장소 요청 관리</span></div><button type="button" onClick={adminLogin.onClose} aria-label="관리자 로그인 닫기">×</button></header>
        <form onSubmit={(event) => { void adminLogin.onSubmit(event); }}>
          <label htmlFor="shared-admin-password">공유 관리자 비밀번호</label>
          <input id="shared-admin-password" type="password" value={adminLogin.password} autoComplete="current-password" autoFocus maxLength={200} onChange={(event) => adminLogin.onPasswordChange(event.target.value)} />
          {adminLogin.error && <p role="alert">{adminLogin.error}</p>}
          <button type="submit" disabled={adminLogin.submitting}>{adminLogin.submitting ? "확인 중…" : "관리자 화면 들어가기"}</button>
        </form>
        <footer><span>사이트 소유자는 기존 계정으로도 들어갈 수 있습니다.</span><a href="/signin-with-chatgpt?return_to=/">소유자 계정 로그인</a></footer>
      </section>
    </div>}
  </>;
}
