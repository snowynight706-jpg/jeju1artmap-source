"use client";
/* eslint-disable @next/next/no-img-element */

import { type PointerEventHandler, useRef } from "react";

type EventPlace = {
  placeKey: string;
  placeName: string;
};

type AdminPlaceEventDialogProps = {
  editingId: string | null;
  dialogOffset: { x: number; y: number };
  name: string;
  info: string;
  startsAt: string;
  endsAt: string;
  visibleFrom: string;
  visibleUntil: string;
  noPlace: boolean;
  multiPlace: boolean;
  places: EventPlace[];
  photo: File | null;
  existingPhotoUrl: string | null;
  photoPreview: string | null;
  submitting: boolean;
  onDialogPointerDown: PointerEventHandler<HTMLElement>;
  onDialogPointerMove: PointerEventHandler<HTMLElement>;
  onDialogPointerUp: PointerEventHandler<HTMLElement>;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onInfoChange: (value: string) => void;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onVisibleFromChange: (value: string) => void;
  onVisibleUntilChange: (value: string) => void;
  onNoPlaceChange: (checked: boolean) => void;
  onMultiPlaceChange: (checked: boolean) => void;
  onRemovePlace: (placeKey: string) => void;
  onPhotoChange: (file: File | null) => void;
  onSubmit: () => void;
};

export default function AdminPlaceEventDialog({
  editingId,
  dialogOffset,
  name,
  info,
  startsAt,
  endsAt,
  visibleFrom,
  visibleUntil,
  noPlace,
  multiPlace,
  places,
  photo,
  existingPhotoUrl,
  photoPreview,
  submitting,
  onDialogPointerDown,
  onDialogPointerMove,
  onDialogPointerUp,
  onClose,
  onNameChange,
  onInfoChange,
  onStartsAtChange,
  onEndsAtChange,
  onVisibleFromChange,
  onVisibleUntilChange,
  onNoPlaceChange,
  onMultiPlaceChange,
  onRemovePlace,
  onPhotoChange,
  onSubmit,
}: AdminPlaceEventDialogProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const submitDisabled = submitting
    || name.trim().length < 2
    || info.trim().length < 2
    || (!noPlace && !places.length)
    || (!photo && !existingPhotoUrl)
    || !startsAt
    || !endsAt
    || !visibleFrom
    || !visibleUntil;

  return <div className="place-event-dialog-layer" role="presentation">
    <section className="place-event-dialog" role="dialog" aria-modal="false" aria-labelledby="place-event-dialog-title" style={{ transform: `translate(calc(-50% + ${dialogOffset.x}px), calc(-50% + ${dialogOffset.y}px))` }}>
      <header className="place-event-dialog-head" onPointerDown={onDialogPointerDown} onPointerMove={onDialogPointerMove} onPointerUp={onDialogPointerUp} onPointerCancel={onDialogPointerUp}>
        <div><strong id="place-event-dialog-title">{editingId ? "행사 수정" : "행사 등록"}</strong><span>상단을 끌어 창을 옮길 수 있습니다.</span></div>
        <button type="button" onClick={onClose} aria-label="행사 창 닫기">×</button>
      </header>
      <div className="place-event-dialog-scroll">
        <label>행사명<input value={name} maxLength={100} onChange={(event) => onNameChange(event.target.value)} placeholder="100자 이내" /></label>
        <label>행사정보<textarea value={info} maxLength={1200} onChange={(event) => onInfoChange(event.target.value)} placeholder="일정·관람 방법·참여 대상 등 필요한 안내를 적어주세요." /><small>{info.length}/1200</small></label>
        <section className="event-period-section event-schedule-fields"><div className="event-period-heading"><strong>실제 행사 일시</strong><span>방문자 화면에 일정으로 표시됩니다.</span></div><div className="event-visibility-row"><label>행사 시작<input type="datetime-local" value={startsAt} onChange={(event) => onStartsAtChange(event.target.value)} /></label><label>행사 종료<input type="datetime-local" value={endsAt} onChange={(event) => onEndsAtChange(event.target.value)} /></label></div></section>
        <section className="event-period-section event-visibility-fields"><div className="event-period-heading"><strong>화면 노출 기간</strong><span>행사 카드가 공개 화면에 나타나는 기간입니다.</span></div><div className="event-visibility-row"><label>노출 시작<input type="datetime-local" value={visibleFrom} onChange={(event) => onVisibleFromChange(event.target.value)} /></label><label>노출 종료<input type="datetime-local" value={visibleUntil} onChange={(event) => onVisibleUntilChange(event.target.value)} /></label></div></section>
        <section className={`event-place-picker ${noPlace ? "unassigned" : multiPlace ? "active" : ""}`}>
          <div className="event-place-mode-heading"><strong>장소 연결</strong><span>행사 성격에 따라 지정하지 않아도 됩니다.</span></div>
          <label className="event-place-no-place-toggle"><input type="checkbox" checked={noPlace} onChange={(event) => onNoPlaceChange(event.target.checked)} /><span><b>장소 지정 안 함</b><small>전체 행사 목록에만 표시하고 특정 장소 상세에는 연결하지 않습니다.</small></span></label>
          {!noPlace && <><label className="event-place-multi-toggle"><input type="checkbox" checked={multiPlace} onChange={(event) => onMultiPlaceChange(event.target.checked)} /><span><b>복수 장소 지정</b><small>{multiPlace ? "지도에서 마커를 눌러 장소를 함께 지정하세요." : places.length ? "선택한 한 장소에 등록합니다." : "장소를 추가하려면 복수 장소 지정을 켜고 지도 마커를 선택하세요."}</small></span></label>
            <div className="event-place-picked-list">{places.map((place) => <span key={place.placeKey}><b>{place.placeName}</b>{multiPlace && <button type="button" onClick={() => onRemovePlace(place.placeKey)} aria-label={`${place.placeName} 제외`}>×</button>}</span>)}</div>
            {multiPlace && <p>팝업을 옮긴 뒤 지도 마커를 클릭하면 이 목록에 추가되며, 다시 클릭하면 해제됩니다. 최대 20곳까지 지정할 수 있습니다.</p>}</>}
          {noPlace && <div className="event-place-unassigned-note"><strong>장소 미지정 행사</strong><span>원도심 전체 공지·순회 행사처럼 특정 마커에 묶이지 않는 행사에 적합합니다.</span></div>}
        </section>
        <div className="place-event-photo-row"><button type="button" onClick={() => photoInputRef.current?.click()}>{photo || existingPhotoUrl ? "행사 사진 교체" : "행사 사진 선택"}</button>{photo && <button type="button" className="remove" onClick={() => onPhotoChange(null)}>새 사진 취소</button>}<input ref={photoInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onPhotoChange(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></div>
        {(photoPreview || existingPhotoUrl) && <img className="place-event-photo-preview" src={photoPreview ?? existingPhotoUrl ?? ""} alt="행사 사진 미리보기" />}
        <p className="place-event-auto-hide-note">노출 종료 시각이 지나면 공개 화면에서 자동으로 숨겨집니다. 장소 미지정 행사는 전체 행사 목록에만, 장소 지정 행사는 해당 장소 상세에도 표시됩니다.</p>
      </div>
      <footer><button type="button" onClick={onClose}>취소</button><button type="button" className="primary" disabled={submitDisabled} onClick={onSubmit}>{submitting ? "저장 중…" : editingId ? "수정 내용 저장" : "행사 저장"}</button></footer>
    </section>
  </div>;
}
