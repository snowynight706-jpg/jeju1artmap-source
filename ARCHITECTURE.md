# 프로젝트 구조

- `app/page.tsx`: 공개 지도, 관리자 편집기, 지도 조작, 장소 상세·후기·행사 UI의 중심 상태와 화면
- `app/globals.css`: 지도·패널·모바일 PWA 반응형 스타일
- `app/admin-*.tsx`: 지연 로딩되는 관리자 전용 화면
- `app/api/`: 공개 배치, 장소 DB, 행사, 후기, 사진, 진단 기록 API
- `app/*density*.mjs`, `app/*placement*.mjs`: 라벨 밀집도·배치 계산
- `public/`: 지도·랜드마크·마커 자산과 PWA manifest/service worker
- `db/`, `drizzle/`: 영구 저장 스키마와 마이그레이션
- `worker/`: 배포 Worker 진입점과 정적 자산 캐시 정책
- `tests/`: 기능·회귀·PWA·성능 정적 검증

지도 조작은 제스처 중 합성 변형을 사용하고, 종료 후 실제 확대율과 라벨 배치를 한 번 확정한다. 공개 패널 이동은 History API 상태와 지도 선택 상태를 함께 관리한다.

