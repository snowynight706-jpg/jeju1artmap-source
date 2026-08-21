"use client";
/* eslint-disable @next/next/no-img-element */

export type ExplorerStory = {
  id: string;
  placeKey: string;
  placeName: string;
  authorName: string;
  reviewText: string;
  photoUrl: string | null;
  status: "published" | "hidden";
  reportCount?: number;
  reportSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExplorerEventPlace = {
  placeKey: string;
  placeName: string;
};

export type ExplorerEvent = {
  id: string;
  placeKey: string;
  placeName: string;
  places: ExplorerEventPlace[];
  eventName: string;
  eventInfo: string;
  photoUrl: string;
  startsAt: string;
  endsAt: string;
  visibleFrom: string;
  visibleUntil: string;
  status: "active" | "hidden";
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
};

type PublicExplorerActivityContentProps = {
  tab: "reviews" | "events";
  access: "editor" | "viewer";
  stories: ExplorerStory[];
  storiesLoading: boolean;
  storiesError: boolean;
  storiesCanModerate: boolean;
  reportedStoryIds: ReadonlySet<string>;
  storyActionId: string | null;
  events: ExplorerEvent[];
  eventsLoading: boolean;
  eventsError: boolean;
  eventsCanManage: boolean;
  eventActionId: string | null;
  onRetryStories: () => void;
  onOpenStoryPlace: (story: ExplorerStory) => void;
  onReportStory: (story: ExplorerStory) => void;
  onModerateStory: (story: ExplorerStory, status: "published" | "hidden") => void | Promise<void>;
  onDeleteStory: (story: ExplorerStory) => void | Promise<void>;
  onRetryEvents: () => void;
  onOpenEventPlace: (place: ExplorerEventPlace) => void;
  onEditEvent: (event: ExplorerEvent) => void;
  onModerateEvent: (event: ExplorerEvent, status: "active" | "hidden") => void | Promise<void>;
  onDeleteEvent: (event: ExplorerEvent) => void | Promise<void>;
};

function dateTimeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 미상" : date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventScheduleLabel(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "행사 일시 확인 필요";
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  if (!sameDay) return `${dateTimeLabel(startsAt)} ~ ${dateTimeLabel(endsAt)}`;
  const day = start.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  const time = (date: Date) => date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time(start)} ~ ${time(end)}`;
}

function eventPlaces(event: ExplorerEvent): ExplorerEventPlace[] {
  return Array.isArray(event.places) && event.places.length
    ? event.places
    : event.placeKey && event.placeName ? [{ placeKey: event.placeKey, placeName: event.placeName }] : [];
}

function eventVisibility(event: ExplorerEvent) {
  if (event.status === "hidden") return "숨김";
  const now = Date.now();
  const start = Date.parse(event.visibleFrom);
  const end = Date.parse(event.visibleUntil);
  if (Number.isFinite(start) && start > now) return "노출 예정";
  if (Number.isFinite(end) && end <= now) return "기간 종료";
  return "노출 중";
}

export default function PublicExplorerActivityContent({
  tab,
  access,
  stories,
  storiesLoading,
  storiesError,
  storiesCanModerate,
  reportedStoryIds,
  storyActionId,
  events,
  eventsLoading,
  eventsError,
  eventsCanManage,
  eventActionId,
  onRetryStories,
  onOpenStoryPlace,
  onReportStory,
  onModerateStory,
  onDeleteStory,
  onRetryEvents,
  onOpenEventPlace,
  onEditEvent,
  onModerateEvent,
  onDeleteEvent,
}: PublicExplorerActivityContentProps) {
  if (tab === "reviews") {
    return <section className="global-activity-tab" data-tab="reviews">
      {storiesLoading ? <div className="global-story-state"><span className="global-story-spinner" /><strong>최신 리뷰를 불러오는 중입니다.</strong></div>
        : storiesError ? <div className="global-story-state error"><strong>리뷰를 불러오지 못했습니다.</strong><button type="button" onClick={onRetryStories}>다시 시도</button></div>
          : stories.length ? <div className="global-story-list">{stories.map((story) => <article className={`global-story-card ${story.photoUrl ? "has-photo" : ""} ${story.status === "hidden" ? "hidden" : ""}`} key={story.id}>
            {story.photoUrl && <img src={story.photoUrl} alt={`${story.placeName}에 등록된 사진`} loading="lazy" decoding="async" />}
            <div><button type="button" className="global-story-place-link" onClick={() => onOpenStoryPlace(story)}>{story.placeName}<span>지도에서 보기</span></button><div className="global-story-meta"><strong>{story.authorName}{story.status === "hidden" && <em>숨김</em>}</strong><time dateTime={story.createdAt}>{dateTimeLabel(story.createdAt)}</time></div><p>{story.reviewText}</p>{storiesCanModerate && story.reportSummary && <details className="story-report-admin-detail"><summary>신고 내용 보기</summary><p>{story.reportSummary}</p></details>}{!storiesCanModerate && <footer className="global-story-report-action"><button type="button" disabled={reportedStoryIds.has(story.id)} onClick={() => onReportStory(story)}>{reportedStoryIds.has(story.id) ? "신고 접수됨" : "후기·사진 신고"}</button></footer>}{storiesCanModerate && <footer className="global-story-admin-actions">{Boolean(story.reportCount) && <span className="story-report-count">신고 {story.reportCount}건</span>}<button type="button" disabled={storyActionId !== null} onClick={() => void onModerateStory(story, story.status === "hidden" ? "published" : "hidden")}>{storyActionId === story.id ? "처리 중…" : story.status === "hidden" ? "다시 공개" : "숨기기"}</button><button type="button" className="danger" disabled={storyActionId !== null} onClick={() => void onDeleteStory(story)}>영구 삭제</button></footer>}</div>
          </article>)}</div> : <div className="global-story-state"><strong>{access === "editor" ? "아직 등록된 리뷰가 없습니다." : "아직 공개된 리뷰가 없습니다."}</strong><span>{access === "editor" ? "새 리뷰가 등록되면 이곳에서 바로 관리할 수 있습니다." : "장소 마커를 눌러 첫 기록을 남겨보세요."}</span></div>}
    </section>;
  }

  return <section className="global-activity-tab" data-tab="events">
    {eventsLoading ? <div className="global-story-state"><span className="global-story-spinner" /><strong>행사를 불러오는 중입니다.</strong></div>
      : eventsError ? <div className="global-story-state error"><strong>행사를 불러오지 못했습니다.</strong><button type="button" onClick={onRetryEvents}>다시 시도</button></div>
        : events.length ? <div className="global-story-list">{events.map((event) => {
          const visibility = eventVisibility(event);
          const places = eventPlaces(event);
          return <article className={`global-story-card event-card has-photo ${!event.isVisible ? "hidden" : ""}`} key={event.id}><img src={event.photoUrl} alt={`${event.eventName} 행사 이미지`} loading="lazy" decoding="async" /><div><div className="global-event-place-links" aria-label="행사 장소">{places.length ? places.map((place) => <button type="button" key={place.placeKey} onClick={() => onOpenEventPlace(place)}>{place.placeName}<span>지도 보기</span></button>) : <span className="global-event-unassigned">원도심 공통 행사 · 장소 지정 없음</span>}</div><div className="global-story-meta"><strong>{event.eventName}<em className={`event-visibility ${event.isVisible ? "visible" : ""}`}>{visibility}</em></strong><time dateTime={event.startsAt}>{eventScheduleLabel(event.startsAt, event.endsAt)}</time></div><p>{event.eventInfo}</p>{eventsCanManage && <div className="event-admin-visibility-period">화면 노출 {dateTimeLabel(event.visibleFrom)} ~ {dateTimeLabel(event.visibleUntil)}</div>}{eventsCanManage && <footer className="global-story-admin-actions"><button type="button" disabled={eventActionId !== null} onClick={() => onEditEvent(event)}>수정</button>{visibility !== "기간 종료" && <button type="button" disabled={eventActionId !== null} onClick={() => void onModerateEvent(event, event.status === "hidden" ? "active" : "hidden")}>{eventActionId === event.id ? "처리 중…" : event.status === "hidden" ? "다시 활성화" : "숨기기"}</button>}<button type="button" className="danger" disabled={eventActionId !== null} onClick={() => void onDeleteEvent(event)}>영구 삭제</button></footer>}</div></article>;
        })}</div> : <div className="global-story-state"><strong>{access === "editor" ? "아직 등록된 행사가 없습니다." : "현재 노출 중인 행사가 없습니다."}</strong><span>{access === "editor" ? "위 등록 버튼에서 장소 지정 여부와 노출 기간을 정할 수 있습니다." : "새 행사가 등록되면 이곳에 표시됩니다."}</span></div>}
  </section>;
}
