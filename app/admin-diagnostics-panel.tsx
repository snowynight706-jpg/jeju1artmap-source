"use client";

type UploadDiagnostic = {
  id: string;
  placeKey: string;
  stage: "prepare" | "request" | "response" | "unknown";
  errorCode: string;
  responseStatus: number;
  sourceSize: number;
  preparedSize: number | null;
  sourceType: string;
  preparedType: string | null;
  online: number;
  userAgent: string;
  createdAt: string;
};

type PerformanceDiagnostic = {
  id: string;
  metric: "startup" | "pan-settle" | "pinch-settle";
  durationMs: number;
  elementCount: number;
  labelCount: number;
  viewportWidth: number;
  viewportHeight: number;
  deviceMemory: number | null;
  hardwareConcurrency: number;
  connectionType: string;
  standalone: number;
  online: number;
  createdAt: string;
};

type Props = {
  uploadDiagnostics: UploadDiagnostic[];
  uploadLoading: boolean;
  uploadError: boolean;
  uploadActionId: string | null;
  onRefreshUploads: () => void;
  onDeleteUpload: (id: string) => void;
  onClearUploads: () => void;
  performanceDiagnostics: PerformanceDiagnostic[];
  performanceLoading: boolean;
  performanceError: boolean;
  performanceActionId: string | null;
  onRefreshPerformance: () => void;
  onDeletePerformance: (id: string) => void;
  onClearPerformance: () => void;
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

function sizeLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 1024 * 1024) return `${Math.max(0, Math.round(value / 1024))}KB`;
  return `${(value / (1024 * 1024)).toFixed(2)}MB`;
}

function uploadStageLabel(stage: UploadDiagnostic["stage"]) {
  return stage === "prepare" ? "사진 준비" : stage === "request" ? "서버 전송" : stage === "response" ? "서버 응답" : "단계 불명";
}

function uploadErrorLabel(code: string, status: number) {
  if (code === "offline") return "오프라인 상태";
  if (code === "network-error") return "네트워크 전송 실패";
  if (code === "photo-read-failed") return "선택 사진 임시 복사 실패";
  if (code === "photo-decode-failed") return "기기 사진 열기 실패";
  if (code === "photo-encode-failed") return "기기 사진 변환 실패";
  if (code === "photo-compression-target-failed") return "목표 용량 압축 실패";
  if (code === "request-too-large" || status === 413) return "요청 용량 제한";
  if (code === "photo-too-large") return "기기 압축 실패";
  if (code === "photo-unsupported" || status === 415) return "지원하지 않는 사진 형식";
  if (code === "place-not-found" || status === 404) return "장소 연결 불일치";
  if (code === "entry-invalid" || status === 400) return "입력값 검증 실패";
  if (code === "rate-limit" || status === 429) return "등록 횟수 제한";
  if (code === "storage-unavailable" || status === 503) return "저장소 일시 중단";
  if (code === "server-error" || status >= 500) return "서버 처리 오류";
  return "분류되지 않은 업로드 오류";
}

function deviceLabel(userAgent: string) {
  const platform = /iPhone/i.test(userAgent) ? "iPhone" : /iPad/i.test(userAgent) ? "iPad" : /Android/i.test(userAgent) ? "Android" : "기타 기기";
  const browser = /EdgA|EdgiOS/i.test(userAgent) ? "Edge" : /CriOS|Chrome/i.test(userAgent) ? "Chrome" : /FxiOS|Firefox/i.test(userAgent) ? "Firefox" : /Safari/i.test(userAgent) ? "Safari" : "브라우저 불명";
  return `${platform} · ${browser}`;
}

function performanceMetricLabel(metric: PerformanceDiagnostic["metric"]) {
  if (metric === "startup") return "첫 화면 준비";
  if (metric === "pinch-settle") return "확대·축소 후 안정화";
  return "지도 이동 후 안정화";
}

function performanceGrade(durationMs: number, metric: PerformanceDiagnostic["metric"]) {
  const slow = metric === "startup" ? 5000 : 120;
  const warning = metric === "startup" ? 2800 : 64;
  return durationMs >= slow ? "느림" : durationMs >= warning ? "확인 필요" : "양호";
}

export default function AdminDiagnosticsPanel(props: Props) {
  return <div className="admin-diagnostics-stack">
    <details className="upload-diagnostic-panel">
      <summary><span><strong>모바일 후기 업로드 오류</strong><small>사진·후기 내용과 닉네임은 기록하지 않습니다.</small></span><em>{props.uploadLoading ? "확인 중" : `${props.uploadDiagnostics.length}건`}</em></summary>
      <div className="upload-diagnostic-body">
        <header><p>최근 오류 최대 100건 · 단계·용량·형식·기기 환경만 표시</p><div className="upload-diagnostic-toolbar"><button type="button" disabled={props.uploadLoading || props.uploadActionId !== null} onClick={props.onRefreshUploads}>새로고침</button><button type="button" className="danger" disabled={!props.uploadDiagnostics.length || props.uploadActionId !== null} onClick={props.onClearUploads}>{props.uploadActionId === "all" ? "정리 중…" : "전체 정리"}</button></div></header>
        {props.uploadLoading ? <div className="upload-diagnostic-state"><span className="global-story-spinner" /><strong>오류 로그를 불러오는 중입니다.</strong></div>
          : props.uploadError ? <div className="upload-diagnostic-state error"><strong>오류 로그를 불러오지 못했습니다.</strong><button type="button" onClick={props.onRefreshUploads}>다시 시도</button></div>
            : props.uploadDiagnostics.length ? <div className="upload-diagnostic-list">{props.uploadDiagnostics.map((diagnostic) => <article key={diagnostic.id}>
              <header><div><strong>{uploadErrorLabel(diagnostic.errorCode, diagnostic.responseStatus)}</strong><code>{diagnostic.errorCode}</code></div><div className="upload-diagnostic-card-actions"><time dateTime={diagnostic.createdAt}>{dateTimeLabel(diagnostic.createdAt)}</time><button type="button" disabled={props.uploadActionId !== null} onClick={() => props.onDeleteUpload(diagnostic.id)}>{props.uploadActionId === diagnostic.id ? "삭제 중…" : "삭제"}</button></div></header>
              <dl><div><dt>실패 단계</dt><dd>{uploadStageLabel(diagnostic.stage)}</dd></div><div><dt>서버 응답</dt><dd>{diagnostic.responseStatus || "없음"}</dd></div><div><dt>파일 용량</dt><dd>{sizeLabel(diagnostic.sourceSize)} → {sizeLabel(diagnostic.preparedSize)}</dd></div><div><dt>기기 환경</dt><dd>{deviceLabel(diagnostic.userAgent)}</dd></div><div><dt>연결 상태</dt><dd>{diagnostic.online ? "온라인" : "오프라인"}</dd></div><div><dt>사진 형식</dt><dd>{diagnostic.sourceType || "불명"} → {diagnostic.preparedType || "변환 안 됨"}</dd></div></dl>
              <details><summary>기술 정보</summary><p><b>장소 키</b> {diagnostic.placeKey}</p><p><b>User-Agent</b> {diagnostic.userAgent}</p></details>
            </article>)}</div>
              : <div className="upload-diagnostic-state empty"><strong>수집된 업로드 오류가 없습니다.</strong><span>모바일 업로드가 실패하면 오류 ID와 함께 이곳에 기록됩니다.</span></div>}
      </div>
    </details>

    <details className="upload-diagnostic-panel performance-diagnostic-panel">
      <summary><span><strong>PWA 성능 기록</strong><small>사진·후기·장소 정보 없이 처리 시간과 기기 등급만 기록합니다.</small></span><em>{props.performanceLoading ? "확인 중" : `${props.performanceDiagnostics.length}건`}</em></summary>
      <div className="upload-diagnostic-body">
        <header><p>첫 화면과 지도 조작 안정화 시간 · 최근 100건</p><div className="upload-diagnostic-toolbar"><button type="button" disabled={props.performanceLoading || props.performanceActionId !== null} onClick={props.onRefreshPerformance}>새로고침</button><button type="button" className="danger" disabled={!props.performanceDiagnostics.length || props.performanceActionId !== null} onClick={props.onClearPerformance}>{props.performanceActionId === "all" ? "정리 중…" : "전체 정리"}</button></div></header>
        {props.performanceLoading ? <div className="upload-diagnostic-state"><span className="global-story-spinner" /><strong>성능 기록을 불러오는 중입니다.</strong></div>
          : props.performanceError ? <div className="upload-diagnostic-state error"><strong>성능 기록을 불러오지 못했습니다.</strong><button type="button" onClick={props.onRefreshPerformance}>다시 시도</button></div>
            : props.performanceDiagnostics.length ? <div className="upload-diagnostic-list performance-diagnostic-list">{props.performanceDiagnostics.map((diagnostic) => <article key={diagnostic.id}>
              <header><div><strong>{performanceMetricLabel(diagnostic.metric)}</strong><code>{performanceGrade(diagnostic.durationMs, diagnostic.metric)}</code></div><div className="upload-diagnostic-card-actions"><time dateTime={diagnostic.createdAt}>{dateTimeLabel(diagnostic.createdAt)}</time><button type="button" disabled={props.performanceActionId !== null} onClick={() => props.onDeletePerformance(diagnostic.id)}>{props.performanceActionId === diagnostic.id ? "삭제 중…" : "삭제"}</button></div></header>
              <dl><div><dt>처리 시간</dt><dd>{diagnostic.durationMs}ms</dd></div><div><dt>지도 규모</dt><dd>마커 {diagnostic.elementCount} · 라벨 {diagnostic.labelCount}</dd></div><div><dt>화면</dt><dd>{diagnostic.viewportWidth}×{diagnostic.viewportHeight}</dd></div><div><dt>기기 등급</dt><dd>메모리 {diagnostic.deviceMemory ?? "불명"}GB · CPU {diagnostic.hardwareConcurrency || "불명"}</dd></div><div><dt>연결</dt><dd>{diagnostic.connectionType || "불명"} · {diagnostic.online ? "온라인" : "오프라인"}</dd></div><div><dt>실행 방식</dt><dd>{diagnostic.standalone ? "설치형 PWA" : "브라우저"}</dd></div></dl>
            </article>)}</div>
              : <div className="upload-diagnostic-state empty"><strong>수집된 성능 기록이 없습니다.</strong><span>공개 지도를 사용하면 첫 화면과 조작 안정화 시간이 이곳에 누적됩니다.</span></div>}
      </div>
    </details>
  </div>;
}
