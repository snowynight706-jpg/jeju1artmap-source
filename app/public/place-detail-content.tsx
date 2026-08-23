"use client";
/* eslint-disable @next/next/no-img-element */

import type { ReactNode } from "react";

type LocationPlace = {
  id: string;
  name: string;
  active: boolean;
};

type PlaceEvent = {
  id: string;
  photoUrl: string;
  eventName: string;
  eventInfo: string;
  scheduleLabel: string;
};

type PlaceStory = {
  id: string;
  authorName: string;
  reviewText: string;
  photoUrl: string | null;
  createdAt: string;
  dateLabel: string;
  reported: boolean;
};

export type PublicPlaceDetailContentProps = {
  loading: boolean;
  placeName: string;
  locationPlaces: LocationPlace[];
  address: string;
  convenienceNames: string[];
  description: string;
  operatingInfo: string;
  notes: string;
  directionsUrl: string;
  events: PlaceEvent[];
  stories: PlaceStory[];
  storiesLoading: boolean;
  storyFormOpen: boolean;
  storyAuthor: string;
  storyText: string;
  cameraPermissionClass: string;
  cameraPermissionLabel: string;
  cameraPermissionRequesting: boolean;
  cameraPermissionGranted: boolean;
  photoRetaining: boolean;
  photoSelected: boolean;
  photoPreview: string;
  storySubmitting: boolean;
  storyCanSubmit: boolean;
  themePicker?: ReactNode;
  onLocationSelect: (placeId: string) => void;
  onCopyAddress: () => void;
  onShare: () => void;
  onToggleStoryForm: () => void;
  onStoryAuthorChange: (value: string) => void;
  onStoryTextChange: (value: string) => void;
  onRequestCameraPermission: () => void;
  onPhotoSelected: (file: File | null) => void;
  onRemovePhoto: () => void;
  onSubmitStory: () => void;
  onReportStory: (storyId: string) => void;
};

function LoadingState() {
  return <div className="public-place-detail-loading" role="status" aria-live="polite">
    <span aria-hidden="true" />
    <strong>장소 정보를 확인하는 중입니다.</strong>
    <p>행사와 장소 기록을 함께 준비한 뒤 한 번에 보여드립니다.</p>
  </div>;
}

export default function PublicPlaceDetailContent(props: PublicPlaceDetailContentProps) {
  if (props.loading) return <LoadingState />;

  return <>
    {props.locationPlaces.length > 1 && <section className="public-location-group" aria-label="이 건물의 시설">
      <div><strong>제주아트플랫폼 건물</strong><span>{props.locationPlaces.length}개 시설</span></div>
      <div>{props.locationPlaces.map((place) => <button type="button" className={place.active ? "active" : ""} key={place.id} onClick={() => props.onLocationSelect(place.id)}>{place.name}</button>)}</div>
    </section>}
    <section className="public-place-summary">
      {props.address && <p className="public-place-address">{props.address}</p>}
      {!!props.convenienceNames.length && <div className="public-place-conveniences" aria-label="편의정보">{props.convenienceNames.map((name) => <span key={name}>{name}</span>)}</div>}
      {(props.description || props.operatingInfo || props.notes) && <div className="public-place-information">
        {props.description && <p>{props.description}</p>}
        {props.operatingInfo && <p><b>이용 안내</b> {props.operatingInfo}</p>}
        {props.notes && <p><b>비고·주의사항</b> {props.notes}</p>}
      </div>}
      <div className="public-place-quick-actions" aria-label="장소 빠른 작업">
        <a className="public-place-map-link" href={props.directionsUrl} target="_blank" rel="noreferrer">길찾기 ↗</a>
        {props.address && <button type="button" onClick={props.onCopyAddress}>주소 복사</button>}
        <button type="button" onClick={props.onShare}>공유</button>
      </div>
    </section>
    {props.events.length > 0 && <section className="public-place-events" aria-label={`${props.placeName} 행사`}>
      <div className="public-place-events-title"><strong>지금 볼 수 있는 행사</strong><span>{props.events.length}개</span></div>
      <div className="place-event-list">{props.events.map((event) => <article className="place-event-card" key={event.id}>
        <img src={event.photoUrl} alt={`${event.eventName} 행사 이미지`} loading="lazy" decoding="async" />
        <div><strong>{event.eventName}</strong><p>{event.eventInfo}</p><span className="event-schedule-label">{event.scheduleLabel}</span></div>
      </article>)}</div>
    </section>}
    <section className="public-place-archive">
      <div className="public-place-archive-title"><div><strong>함께 만든 장소 기록</strong><span>사진과 짧은 후기 {props.stories.length}개</span></div><button type="button" onClick={props.onToggleStoryForm}>{props.storyFormOpen ? "작성 닫기" : "＋ 기록 남기기"}</button></div>
      {props.storyFormOpen && <div className="place-story-form">
        <label>닉네임<input value={props.storyAuthor} maxLength={20} onChange={(event) => props.onStoryAuthorChange(event.target.value)} placeholder="20자 이내" /></label>
        <label>짧은 후기<textarea value={props.storyText} maxLength={220} onChange={(event) => props.onStoryTextChange(event.target.value)} placeholder="이 장소에서 기억하고 싶은 순간을 남겨주세요." /><small>{props.storyText.length}/220</small></label>
        <div className="place-story-photo-permission"><span>선택한 사진 1장을 즉시 앱의 임시 메모리로 복사합니다. 임시 사본은 후기 등록 완료 후 자동 삭제됩니다. 카메라 <b className={props.cameraPermissionClass}>{props.cameraPermissionLabel}</b></span><button type="button" disabled={props.cameraPermissionRequesting} onClick={props.onRequestCameraPermission}>{props.cameraPermissionGranted ? "권한 다시 확인" : "카메라 권한 요청"}</button></div>
        <div className="place-story-photo-row" aria-busy={props.photoRetaining}><label className="place-story-photo-picker"><span>{props.photoRetaining ? "사진 가져오는 중…" : props.photoSelected ? "사진 바꾸기" : "사진 1장 선택"}</span><input type="file" disabled={props.photoRetaining} accept="image/*,.heic,.heif" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ""; props.onPhotoSelected(file); }} /></label><label className="place-story-photo-picker camera"><span>카메라 촬영</span><input type="file" disabled={props.photoRetaining} accept="image/*" capture="environment" onChange={(event) => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ""; props.onPhotoSelected(file); }} /></label>{props.photoSelected && <button type="button" className="remove" onClick={props.onRemovePhoto}>사진 빼기</button>}</div>
        {props.photoPreview && <img className="place-story-photo-preview" src={props.photoPreview} alt="등록할 사진 미리보기" />}
        <p>직접 촬영했거나 게시 권한이 있는 사진만 등록해 주세요. 등록한 내용은 다른 방문자에게 바로 공개됩니다.</p>
        <button type="button" className="place-story-submit" disabled={!props.storyCanSubmit} onClick={props.onSubmitStory}>{props.storySubmitting ? "저장 중…" : props.photoRetaining ? "사진 준비 중…" : "사진·후기 공개하기"}</button>
      </div>}
      {props.storiesLoading ? <div className="place-story-empty">장소 기록을 불러오는 중입니다.</div> : props.stories.length ? <div className="place-story-list">{props.stories.map((story) => <article className="place-story-card" key={story.id}>
        {story.photoUrl && <img src={story.photoUrl} alt={`${story.authorName}님이 남긴 ${props.placeName} 사진`} loading="lazy" decoding="async" />}
        <div><header><strong>{story.authorName}</strong><time dateTime={story.createdAt}>{story.dateLabel}</time></header><p>{story.reviewText}</p><footer className="place-story-card-actions"><button type="button" disabled={story.reported} onClick={() => props.onReportStory(story.id)}>{story.reported ? "신고 접수됨" : "후기·사진 신고"}</button></footer></div>
      </article>)}</div> : <div className="place-story-empty"><strong>아직 남겨진 기록이 없습니다.</strong><span>이 장소의 첫 사진이나 짧은 후기를 남겨보세요.</span></div>}
    </section>
    {props.themePicker && <section className="place-theme-easter-egg" aria-label="숨겨진 화면 테마 선택">
      <div><span aria-hidden="true">◇</span><div><strong>오늘의 화면 팔레트</strong><p>이 장소까지 내려온 분만 발견하는 작은 선택입니다.</p></div></div>
      {props.themePicker}
    </section>}
  </>;
}
