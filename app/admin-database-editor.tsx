"use client";

import type { RefObject } from "react";
import {
  MAIN_HUB_ROLE,
  additionalCategoryDefinitions,
  convenienceAttributeDefinitions,
  sanitizeAdditionalCategories,
  sanitizeConvenienceAttributes,
  type AdditionalCategoryId,
  type ConvenienceAttributeId,
} from "./place-taxonomy";

export type DatabaseEditorCategoryFilter = "all" | "culture" | "food" | "cafe" | "shop" | "other";

export type AdminDatabasePlace = {
  id: string;
  name: string;
  category: string;
  area: string;
  address: string;
  x: number;
  y: number;
  coordinateStatus: "landmark" | "review" | "geocoded" | "unresolved";
  sourceLabel: string;
  sourceUrl?: string;
  subtype?: string;
  priority?: string;
  description?: string;
  operatingInfo?: string;
  notes?: string;
  mapUrl?: string;
  checkedAt?: string;
  additionalCategories?: AdditionalCategoryId[];
  convenienceAttributes?: ConvenienceAttributeId[];
  locationGroupId?: string;
  mapAnchorId?: string;
  featuredRole?: string;
  aliases?: string[];
};

type CategoryOption = { id: string; name: string; color: string };

const categoryFilters: ReadonlyArray<{ id: DatabaseEditorCategoryFilter; name: string }> = [
  { id: "all", name: "전체" },
  { id: "culture", name: "문화공간" },
  { id: "food", name: "음식점" },
  { id: "cafe", name: "카페" },
  { id: "shop", name: "소품샵" },
  { id: "other", name: "기타" },
];

type Props = {
  places: AdminDatabasePlace[];
  filteredPlaces: AdminDatabasePlace[];
  selectedPlace: AdminDatabasePlace | null;
  selectedId: string | null;
  query: string;
  queryInputRef: RefObject<HTMLInputElement | null>;
  categoryFilter: DatabaseEditorCategoryFilter;
  categoryCounts: Record<DatabaseEditorCategoryFilter, number>;
  categoryOptions: ReadonlyArray<CategoryOption>;
  areaOptions: string[];
  dirty: boolean;
  saving: boolean;
  storageSummary: string;
  isCoreLandmark: (name: string) => boolean;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onAdd: () => void;
  onSelectCategory: (category: DatabaseEditorCategoryFilter) => void;
  onSelectPlace: (id: string) => void;
  onUpdatePlace: (id: string, patch: Partial<AdminDatabasePlace>) => void;
  onToggleAdditionalCategory: (id: string, category: AdditionalCategoryId) => void;
  onToggleConvenienceAttribute: (id: string, attribute: ConvenienceAttributeId) => void;
  onRemovePlace: (place: AdminDatabasePlace) => void;
  onBackup: () => void;
  onSave: () => void;
};

export default function AdminDatabaseEditor({
  places,
  filteredPlaces,
  selectedPlace,
  selectedId,
  query,
  queryInputRef,
  categoryFilter,
  categoryCounts,
  categoryOptions,
  areaOptions,
  dirty,
  saving,
  storageSummary,
  isCoreLandmark,
  onClose,
  onQueryChange,
  onAdd,
  onSelectCategory,
  onSelectPlace,
  onUpdatePlace,
  onToggleAdditionalCategory,
  onToggleConvenienceAttribute,
  onRemovePlace,
  onBackup,
  onSave,
}: Props) {
  const categoryMeta = (id: string) => categoryOptions.find((category) => category.id === id)
    ?? { id, name: "기타", color: "#8f7ea7" };
  const selectedIsCore = selectedPlace ? isCoreLandmark(selectedPlace.name) : false;

  return <div className="database-editor-backdrop" role="presentation">
    <section className="database-editor" role="dialog" aria-modal="true" aria-labelledby="database-editor-title">
      <header className="database-editor-header">
        <div><strong id="database-editor-title">내부 장소 DB 직접 편집</strong><span>{places.length}곳 · 좌표와 지도 배치는 별도 보존</span></div>
        <button type="button" onClick={onClose} aria-label="DB 편집 닫기">×</button>
      </header>
      <div className="database-editor-body">
        <aside className="database-editor-list-pane">
          <div className="database-editor-list-tools">
            <input ref={queryInputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="장소명·주소·권역 검색" aria-label="DB 장소 검색" />
            <button type="button" onClick={onAdd}>＋ 신규</button>
          </div>
          <div className="database-editor-category-filters" role="group" aria-label="DB 대분류 모아보기">
            {categoryFilters.map((filter) => <button
              type="button"
              className={categoryFilter === filter.id ? "active" : ""}
              aria-pressed={categoryFilter === filter.id}
              title={`${filter.name} ${categoryCounts[filter.id]}곳`}
              onClick={() => onSelectCategory(filter.id)}
              key={filter.id}
            ><span>{filter.name}</span><em>{categoryCounts[filter.id]}</em></button>)}
          </div>
          <div className="database-editor-list-columns" aria-hidden="true"><span /><span>장소명</span><span>분류</span><span>권역·세부지역</span></div>
          <div className="database-editor-list" role="listbox" aria-label="DB 장소 목록">
            {filteredPlaces.map((place) => {
              const category = categoryMeta(place.category);
              return <button type="button" key={place.id} className={selectedId === place.id ? "active" : ""} onClick={() => onSelectPlace(place.id)} role="option" aria-selected={selectedId === place.id}>
                <i style={{ background: category.color }} /><b title={place.name || "이름 없음"}>{place.name || "이름 없음"}</b><small title={category.name}>{category.name}</small><small title={place.area || "권역 미입력"}>{place.area || "권역 미입력"}</small>
              </button>;
            })}
            {!filteredPlaces.length && <p>{query.trim() ? "검색 결과가 없습니다." : "선택한 대분류에 장소가 없습니다."}</p>}
          </div>
        </aside>
        <div className="database-editor-form-pane">
          {selectedPlace ? <div className="database-editor-form">
            <div className="database-form-row primary-fields">
              <label>장소명 <em>필수</em><input value={selectedPlace.name} maxLength={160} onChange={(event) => onUpdatePlace(selectedPlace.id, { name: event.target.value })} /></label>
              <label>기본분류 <em>{selectedIsCore ? "핵심 랜드마크 고정" : "1개 필수"}</em><select value={selectedPlace.category} disabled={selectedIsCore} onChange={(event) => onUpdatePlace(selectedPlace.id, { category: event.target.value })}>{categoryOptions.filter((category) => selectedIsCore ? category.id === selectedPlace.category : (["culture", "cafe", "food", "shop"] as string[]).includes(category.id) || category.id === selectedPlace.category).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
            <div className="database-form-row">
              <label>권역·세부지역 <em>기존 값 선택</em><select value={selectedPlace.area} aria-label="권역·세부지역 선택" onChange={(event) => onUpdatePlace(selectedPlace.id, { area: event.target.value })}><option value="">미입력</option>{areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
              <label>기존 세부유형 <em>설명용</em><input value={selectedPlace.subtype ?? ""} maxLength={160} onChange={(event) => onUpdatePlace(selectedPlace.id, { subtype: event.target.value })} /></label>
            </div>
            <section className="database-additional-categories" aria-label="추가분류 복수 선택">
              <header><div><strong>추가분류 · 선택 제한 없음</strong><span>업종이 아니라 이 장소에서 할 수 있는 활동과 부가 기능을 선택합니다.</span></div><em>{sanitizeAdditionalCategories(selectedPlace.additionalCategories).length}개 선택</em></header>
              <div>{additionalCategoryDefinitions.map((definition) => {
                const checked = sanitizeAdditionalCategories(selectedPlace.additionalCategories).includes(definition.id);
                return <label className={checked ? "active" : ""} key={definition.id}><input type="checkbox" checked={checked} onChange={() => onToggleAdditionalCategory(selectedPlace.id, definition.id)} /><span><b>{definition.name}</b></span></label>;
              })}</div>
              {(selectedPlace.locationGroupId || selectedPlace.featuredRole) && <p>{selectedPlace.featuredRole === MAIN_HUB_ROLE ? "워크케이션 메인 거점" : "동일 건물 시설 묶음"}{selectedPlace.locationGroupId ? ` · ${selectedPlace.locationGroupId}` : ""}</p>}
            </section>
            <section className="database-convenience-attributes" aria-label="편의정보 속성">
              <header><div><strong>편의정보 속성</strong><span>추가분류와 별도로 저장되며 공개 카테고리 수에는 포함되지 않습니다.</span></div><em>{sanitizeConvenienceAttributes(selectedPlace.convenienceAttributes).length}개</em></header>
              <div>{convenienceAttributeDefinitions.map((definition) => {
                const checked = sanitizeConvenienceAttributes(selectedPlace.convenienceAttributes).includes(definition.id);
                return <label className={checked ? "active" : ""} key={definition.id}><input type="checkbox" checked={checked} onChange={() => onToggleConvenienceAttribute(selectedPlace.id, definition.id)} /><span><b>{definition.name}</b></span></label>;
              })}</div>
              <p>추천·랜드마크·인쇄 출력 여부는 기존 우선도·핵심 랜드마크·출력 설정에서 각각 관리합니다.</p>
            </section>
            <label>주소<input value={selectedPlace.address} maxLength={260} onChange={(event) => onUpdatePlace(selectedPlace.id, { address: event.target.value })} /></label>
            <div className="database-form-row">
              <label>우선도<input value={selectedPlace.priority ?? ""} maxLength={80} placeholder="추천·참고·검토" onChange={(event) => onUpdatePlace(selectedPlace.id, { priority: event.target.value })} /></label>
              <label>확인일<input type="date" value={selectedPlace.checkedAt ?? ""} onChange={(event) => onUpdatePlace(selectedPlace.id, { checkedAt: event.target.value })} /></label>
            </div>
            <label>설명<textarea value={selectedPlace.description ?? ""} maxLength={1600} onChange={(event) => onUpdatePlace(selectedPlace.id, { description: event.target.value })} /></label>
            <label>운영정보<textarea value={selectedPlace.operatingInfo ?? ""} maxLength={1000} onChange={(event) => onUpdatePlace(selectedPlace.id, { operatingInfo: event.target.value })} /></label>
            <label>비고·주의사항<textarea value={selectedPlace.notes ?? ""} maxLength={1600} onChange={(event) => onUpdatePlace(selectedPlace.id, { notes: event.target.value })} /></label>
            <label>사진·소개 자료 URL<input type="url" value={selectedPlace.sourceUrl ?? ""} maxLength={1200} onChange={(event) => onUpdatePlace(selectedPlace.id, { sourceUrl: event.target.value })} /></label>
            <label>지도·코스 자료 URL<input type="url" value={selectedPlace.mapUrl ?? ""} maxLength={1200} onChange={(event) => onUpdatePlace(selectedPlace.id, { mapUrl: event.target.value })} /></label>
            <div className="database-record-meta"><span>ID {selectedPlace.id}</span><button type="button" className="danger" onClick={() => onRemovePlace(selectedPlace)}>DB 항목 삭제</button></div>
          </div> : <div className="database-editor-empty"><strong>편집할 장소를 선택하세요.</strong><p>신규 장소는 왼쪽의 ＋ 신규 버튼으로 추가할 수 있습니다.</p></div>}
        </div>
      </div>
      <footer className="database-editor-footer">
        <span>{dirty ? "저장하지 않은 변경 있음" : storageSummary}</span>
        <div><button type="button" onClick={onBackup}>JSON 백업</button><button type="button" onClick={onClose}>취소</button><button type="button" className="primary" disabled={!dirty || saving} onClick={onSave}>{saving ? "저장 중…" : "영구 DB 저장"}</button></div>
      </footer>
    </section>
  </div>;
}
