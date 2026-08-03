"use client";
/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MAP_ASPECT = 8944 / 7324;
const MAP_SVG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_마스터벡터.svg";
const MAP_PNG = "/maps/제주원도심_랜드마크탐색_베이스맵_v15_골목추가정리_검수본_초고해상도.png";

const categories = [
  { id: "landmark", name: "핵심 랜드마크", color: "#df745c", glyph: "景" },
  { id: "culture", name: "일반 문화시설", color: "#4d9a91", glyph: "文" },
  { id: "cafe", name: "카페", color: "#b7835b", glyph: "珈" },
  { id: "food", name: "음식점", color: "#d8974f", glyph: "食" },
  { id: "parking", name: "주차장", color: "#667f8b", glyph: "P" },
  { id: "park", name: "공원·광장", color: "#69a56d", glyph: "休" },
  { id: "utility", name: "기타 편의시설", color: "#8f7ea7", glyph: "＋" },
] as const;

type CategoryId = (typeof categories)[number]["id"];
type AssetStatus = "approved" | "review" | "unchecked";
type LabelPosition = "top" | "bottom" | "left" | "right";

type MapAsset = {
  id: string;
  name: string;
  category: CategoryId;
  status: AssetStatus;
  src: string;
  fileType: "png" | "svg" | "image";
};

type MapElement = {
  id: string;
  name: string;
  category: CategoryId;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  size: number;
  z: number;
  labelVisible: boolean;
  labelPosition: LabelPosition;
  labelGap: number;
  opacity: number;
  connectorVisible: boolean;
  connectorColor: string;
  connectorWidth: number;
  assetId: string | null;
  status: AssetStatus;
  locked: boolean;
};

const initialElements: MapElement[] = [
  { id: "dummy-1", name: "아라리오뮤지엄", category: "landmark", x: 18, y: 24, anchorX: 17, anchorY: 25, size: 7, z: 1, labelVisible: true, labelPosition: "bottom", labelGap: 8, opacity: 100, connectorVisible: true, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "unchecked", locked: false },
  { id: "dummy-2", name: "관덕정", category: "landmark", x: 38, y: 59, anchorX: 39.5, anchorY: 60, size: 6.2, z: 2, labelVisible: true, labelPosition: "bottom", labelGap: 8, opacity: 100, connectorVisible: true, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "review", locked: false },
  { id: "dummy-3", name: "동문시장", category: "landmark", x: 66, y: 55, anchorX: 66, anchorY: 55, size: 6.8, z: 3, labelVisible: true, labelPosition: "bottom", labelGap: 8, opacity: 100, connectorVisible: false, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "review", locked: false },
  { id: "dummy-4", name: "문화시설 A", category: "culture", x: 52, y: 42, anchorX: 52, anchorY: 42, size: 3, z: 4, labelVisible: false, labelPosition: "right", labelGap: 8, opacity: 100, connectorVisible: false, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "unchecked", locked: false },
  { id: "dummy-5", name: "카페 A", category: "cafe", x: 56, y: 46, anchorX: 56, anchorY: 46, size: 1.7, z: 5, labelVisible: false, labelPosition: "right", labelGap: 8, opacity: 100, connectorVisible: false, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "unchecked", locked: false },
  { id: "dummy-6", name: "음식점 A", category: "food", x: 60, y: 48, anchorX: 60, anchorY: 48, size: 1.7, z: 6, labelVisible: false, labelPosition: "right", labelGap: 8, opacity: 100, connectorVisible: false, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "unchecked", locked: false },
  { id: "dummy-7", name: "주차장 A", category: "parking", x: 43, y: 67, anchorX: 43, anchorY: 67, size: 1.6, z: 7, labelVisible: false, labelPosition: "right", labelGap: 8, opacity: 100, connectorVisible: false, connectorColor: "#537b74", connectorWidth: 1.5, assetId: null, status: "unchecked", locked: false },
];

const statusText: Record<AssetStatus, string> = {
  approved: "승인 완료",
  review: "검수 중",
  unchecked: "미검수",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function categoryOf(id: CategoryId) {
  return categories.find((category) => category.id === id) ?? categories[6];
}

function labelStyle(position: LabelPosition, gap: number) {
  if (position === "top") return { left: "50%", bottom: `calc(100% + ${gap}px)`, transform: "translateX(-50%)" };
  if (position === "bottom") return { left: "50%", top: `calc(100% + ${gap}px)`, transform: "translateX(-50%)" };
  if (position === "left") return { right: `calc(100% + ${gap}px)`, top: "50%", transform: "translateY(-50%)" };
  return { left: `calc(100% + ${gap}px)`, top: "50%", transform: "translateY(-50%)" };
}

export default function Home() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const baseMapImgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextIdRef = useRef(100);
  const nextAssetIdRef = useRef(0);
  const [elements, setElements] = useState(initialElements);
  const [assets, setAssets] = useState<MapAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialElements[0].id);
  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [baseMap, setBaseMap] = useState<"svg" | "png">("svg");
  const [activeCategory, setActiveCategory] = useState<CategoryId | "all">("all");
  const [viewMode, setViewMode] = useState<"all" | "landmarks" | "markers" | "anchors">("all");
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("unchecked");
  const [assetCategory, setAssetCategory] = useState<CategoryId>("landmark");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [interaction, setInteraction] = useState<
    | { type: "pan"; startX: number; startY: number; panX: number; panY: number }
    | { type: "drag"; id: string; offsetX: number; offsetY: number }
    | { type: "resize"; id: string; startX: number; startSize: number }
    | null
  >(null);

  const selected = elements.find((element) => element.id === selectedId) ?? null;

  const visibleElements = useMemo(() => {
    return [...elements]
      .filter((element) => activeCategory === "all" || element.category === activeCategory)
      .filter((element) => viewMode === "all" || viewMode === "anchors" || (viewMode === "landmarks" ? element.category === "landmark" : element.category !== "landmark"))
      .sort((a, b) => a.z - b.z);
  }, [activeCategory, elements, viewMode]);

  const updateElement = useCallback((id: string, patch: Partial<MapElement>) => {
    setElements((current) => current.map((element) => (element.id === id ? { ...element, ...patch } : element)));
  }, []);

  const clientToMap = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }, []);

  useEffect(() => {
    const image = baseMapImgRef.current;
    if (image?.complete && image.naturalWidth > 0) setMapLoaded(true);
  }, [baseMap]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!interaction) return;
      if (interaction.type === "pan") {
        setPan({
          x: interaction.panX + event.clientX - interaction.startX,
          y: interaction.panY + event.clientY - interaction.startY,
        });
        return;
      }
      if (interaction.type === "drag") {
        const point = clientToMap(event.clientX, event.clientY);
        updateElement(interaction.id, {
          x: clamp(point.x - interaction.offsetX, 0, 100),
          y: clamp(point.y - interaction.offsetY, 0, 100),
        });
        return;
      }
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const delta = ((event.clientX - interaction.startX) / rect.width) * 100;
      updateElement(interaction.id, { size: clamp(interaction.startSize + delta * 2, 0.8, 15) });
    };
    const handleUp = () => setInteraction(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [clientToMap, interaction, updateElement]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selectedId || ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const direction = directions[event.key];
      if (!direction) return;
      const element = elements.find((item) => item.id === selectedId);
      if (!element || element.locked) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.5 : 0.08;
      updateElement(selectedId, {
        x: clamp(element.x + direction[0] * step, 0, 100),
        y: clamp(element.y + direction[1] * step, 0, 100),
      });
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [elements, selectedId, updateElement]);

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current?.getBoundingClientRect();
    if (!viewport) return;
    const cursorX = event.clientX - viewport.left - viewport.width / 2;
    const cursorY = event.clientY - viewport.top - viewport.height / 2;
    const nextZoom = clamp(zoom * Math.exp(-event.deltaY * 0.0012), 0.22, 4);
    const ratio = nextZoom / zoom;
    setPan({
      x: cursorX - (cursorX - pan.x) * ratio,
      y: cursorY - (cursorY - pan.y) * ratio,
    });
    setZoom(nextZoom);
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    setSelectedId(null);
    setInteraction({ type: "pan", startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y });
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, element: MapElement) => {
    event.stopPropagation();
    setSelectedId(element.id);
    if (element.locked) return;
    const point = clientToMap(event.clientX, event.clientY);
    setInteraction({ type: "drag", id: element.id, offsetX: point.x - element.x, offsetY: point.y - element.y });
  };

  const addDummy = (category: CategoryId) => {
    const meta = categoryOf(category);
    const count = elements.filter((item) => item.category === category).length + 1;
    const size = category === "landmark" ? 6.4 : category === "culture" || category === "park" ? 3 : 1.7;
    const next: MapElement = {
      id: `element-${++nextIdRef.current}`,
      name: `${meta.name} ${count}`,
      category,
      x: 50,
      y: 50,
      anchorX: 50,
      anchorY: 50,
      size,
      z: Math.max(0, ...elements.map((item) => item.z)) + 1,
      labelVisible: category === "landmark",
      labelPosition: "bottom",
      labelGap: 8,
      opacity: 100,
      connectorVisible: false,
      connectorColor: "#537b74",
      connectorWidth: 1.5,
      assetId: null,
      status: "unchecked",
      locked: false,
    };
    setElements((current) => [...current, next]);
    setSelectedId(next.id);
  };

  const addAssetElement = (asset: MapAsset) => {
    const count = elements.filter((item) => item.assetId === asset.id).length + 1;
    const size = asset.category === "landmark" ? 6.4 : asset.category === "culture" || asset.category === "park" ? 3 : 1.7;
    const next: MapElement = {
      id: `element-${++nextIdRef.current}`,
      name: count > 1 ? `${asset.name} ${count}` : asset.name,
      category: asset.category,
      x: 50,
      y: 50,
      anchorX: 50,
      anchorY: 50,
      size,
      z: Math.max(0, ...elements.map((item) => item.z)) + 1,
      labelVisible: asset.category === "landmark",
      labelPosition: "bottom",
      labelGap: 8,
      opacity: 100,
      connectorVisible: false,
      connectorColor: "#537b74",
      connectorWidth: 1.5,
      assetId: asset.id,
      status: asset.status,
      locked: false,
    };
    setElements((current) => [...current, next]);
    setSelectedId(next.id);
  };

  const uploadAsset = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    files.forEach((file) => {
      if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".svg")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) return;
        const extension = file.name.split(".").pop()?.toLowerCase();
        const asset: MapAsset = {
          id: `asset-${++nextAssetIdRef.current}`,
          name: file.name.replace(/\.[^.]+$/, ""),
          category: assetCategory,
          status: assetStatus,
          src,
          fileType: extension === "svg" ? "svg" : extension === "png" ? "png" : "image",
        };
        setAssets((current) => [...current, asset]);
      };
      reader.readAsDataURL(file);
    });
    event.target.value = "";
  };

  const moveLayer = (direction: "front" | "back" | "forward" | "backward") => {
    if (!selected) return;
    const zs = elements.map((item) => item.z);
    let z = selected.z;
    if (direction === "front") z = Math.max(...zs) + 1;
    if (direction === "back") z = Math.min(...zs) - 1;
    if (direction === "forward") z += 1;
    if (direction === "backward") z -= 1;
    updateElement(selected.id, { z });
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const duplicate = {
      ...selected,
      id: `element-${++nextIdRef.current}`,
      name: `${selected.name} 복사본`,
      x: clamp(selected.x + 1.2, 0, 100),
      y: clamp(selected.y + 1.2, 0, 100),
      z: Math.max(0, ...elements.map((item) => item.z)) + 1,
    };
    setElements((current) => [...current, duplicate]);
    setSelectedId(duplicate.id);
  };

  const deleteSelected = () => {
    if (!selected || selected.locked) return;
    setElements((current) => current.filter((item) => item.id !== selected.id));
    setSelectedId(null);
  };

  const changeCategory = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!selected) return;
    updateElement(selected.id, { category: event.target.value as CategoryId });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">W</div>
          <div>
            <strong>원도심 지도 배치 검수</strong>
            <span>제주문화예술재단 · 내부 디자인 도구</span>
          </div>
        </div>
        <div className="toolbar-group muted-actions" aria-label="저장 도구 — 다음 구현 묶음">
          <button disabled title="2차 구현 예정">저장</button>
          <button disabled title="2차 구현 예정">불러오기</button>
          <span className="toolbar-separator" />
          <button disabled aria-label="실행 취소" title="2차 구현 예정">↶</button>
          <button disabled aria-label="다시 실행" title="2차 구현 예정">↷</button>
        </div>
        <div className="toolbar-group zoom-tools">
          <button onClick={() => setZoom((value) => clamp(value / 1.16, 0.22, 4))} aria-label="축소">−</button>
          <output>{Math.round(zoom * 100)}%</output>
          <button onClick={() => setZoom((value) => clamp(value * 1.16, 0.22, 4))} aria-label="확대">＋</button>
          <button onClick={() => { setZoom(0.72); setPan({ x: 0, y: 0 }); }}>맞춤</button>
        </div>
        <label className="select-control">
          <span>보기</span>
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value as typeof viewMode)}>
            <option value="all">전체 배치</option>
            <option value="landmarks">랜드마크만</option>
            <option value="markers">일반 마커만</option>
            <option value="anchors">앵커·연결선</option>
          </select>
        </label>
        <div className="toolbar-group muted-actions">
          <button disabled title="4차 구현 예정">내보내기</button>
        </div>
      </header>

      <section className={`workspace ${leftOpen ? "" : "left-closed"} ${rightOpen ? "" : "right-closed"}`}>
        <aside className="panel asset-panel" aria-label="자산 목록">
          <div className="panel-heading">
            <div><strong>자산</strong><span>{elements.length}개 배치</span></div>
            <button className="icon-button" onClick={() => setLeftOpen(false)} aria-label="왼쪽 패널 접기">‹</button>
          </div>
          <div className="panel-search">자산명 검색 <kbd>⌘ K</kbd></div>
          <div className="category-filter">
            <button className={activeCategory === "all" ? "active" : ""} onClick={() => setActiveCategory("all")}>
              <span className="category-dot all-dot" /> 전체 자산 <em>{elements.length}</em>
            </button>
            {categories.map((category) => (
              <button key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>
                <span className="category-dot" style={{ background: category.color }} /> {category.name}
                <em>{elements.filter((item) => item.category === category.id).length}</em>
              </button>
            ))}
          </div>
          <div className="asset-upload">
            <div className="asset-upload-row">
              <select aria-label="업로드 자산 카테고리" value={assetCategory} onChange={(event) => setAssetCategory(event.target.value as CategoryId)}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select aria-label="업로드 자산 검수 상태" value={assetStatus} onChange={(event) => setAssetStatus(event.target.value as AssetStatus)}>
                <option value="approved">승인 완료</option>
                <option value="review">검수 중</option>
                <option value="unchecked">미검수</option>
              </select>
            </div>
            <button className="upload-button" onClick={() => fileInputRef.current?.click()}>PNG·SVG 자산 불러오기</button>
            <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/webp,image/svg+xml,.svg" multiple onChange={uploadAsset} />
          </div>
          <div className="asset-list-header"><span>{assets.length ? "프로젝트 자산" : "더미 자산"}</span><small>클릭하여 중앙에 추가</small></div>
          <div className="asset-grid">
            {assets.map((asset) => (
              <button key={asset.id} className="asset-card uploaded" onClick={() => addAssetElement(asset)}>
                <span className="asset-preview image-preview"><img src={asset.src} alt="" /></span>
                <span><strong>{asset.name}</strong><small>{statusText[asset.status]} · {asset.fileType.toUpperCase()}</small></span>
                <i>＋</i>
              </button>
            ))}
            {categories.map((category) => (
              <button key={category.id} className="asset-card" onClick={() => addDummy(category.id)}>
                <span className="asset-preview" style={{ color: category.color, borderColor: `${category.color}55`, background: `${category.color}16` }}>{category.glyph}</span>
                <span><strong>{category.name}</strong><small>임시 도형</small></span>
                <i>＋</i>
              </button>
            ))}
          </div>
          <div className="asset-note"><span>!</span> 실제 승인 자산은 검수 기록 확인 후 적용합니다.</div>
        </aside>

        {!leftOpen && <button className="panel-reopen left" onClick={() => setLeftOpen(true)}>자산 ›</button>}

        <section className="canvas-column">
          <div className="canvas-toolbar">
            <div className="segmented">
              <button className={baseMap === "svg" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("svg"); }}>벡터</button>
              <button className={baseMap === "png" ? "active" : ""} onClick={() => { setMapLoaded(false); setBaseMap("png"); }}>원본 PNG</button>
            </div>
            <span className="map-file">v15 · 골목추가정리 검수본</span>
            <div className="canvas-hint">휠 확대 · 빈 공간 드래그 이동 · 방향키 미세 조정</div>
          </div>
          <div
            className={`map-viewport ${interaction?.type === "pan" ? "is-panning" : ""}`}
            ref={viewportRef}
            onWheel={onWheel}
            onPointerDown={startPan}
          >
            <div className="map-stage-wrap" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
              <div className="map-stage" ref={stageRef} style={{ aspectRatio: `${MAP_ASPECT}` }} onPointerDown={startPan}>
                {!mapLoaded && <div className="map-loading"><span />초고해상도 베이스맵 불러오는 중</div>}
                <img
                  ref={baseMapImgRef}
                  className="base-map"
                  src={baseMap === "svg" ? MAP_SVG : MAP_PNG}
                  alt="제주 원도심 v15 검수용 베이스맵"
                  draggable={false}
                  onLoad={() => setMapLoaded(true)}
                />
                <svg className="connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {visibleElements.map((element) => {
                    const showAnchor = viewMode === "anchors" || element.connectorVisible || selectedId === element.id;
                    if (!showAnchor) return null;
                    const showLine = element.connectorVisible && (Math.abs(element.x - element.anchorX) > 0.05 || Math.abs(element.y - element.anchorY) > 0.05);
                    return (
                      <g key={`anchor-${element.id}`} opacity={element.opacity / 100}>
                        {showLine && <line x1={element.anchorX} y1={element.anchorY} x2={element.x} y2={element.y} stroke={element.connectorColor} strokeWidth={element.connectorWidth / 10} vectorEffect="non-scaling-stroke" />}
                        <circle cx={element.anchorX} cy={element.anchorY} r="0.42" fill="white" stroke={element.connectorColor} strokeWidth="0.13" vectorEffect="non-scaling-stroke" />
                        <circle cx={element.anchorX} cy={element.anchorY} r="0.12" fill={element.connectorColor} />
                      </g>
                    );
                  })}
                </svg>
                <div className="element-layer">
                  {visibleElements.map((element) => {
                    const meta = categoryOf(element.category);
                    const isSelected = selectedId === element.id;
                    const asset = assets.find((item) => item.id === element.assetId);
                    return (
                      <div
                        key={element.id}
                        className={`map-element ${isSelected ? "selected" : ""} ${element.locked ? "locked" : ""}`}
                        style={{
                          left: `${element.x}%`, top: `${element.y}%`, width: `${element.size}%`,
                          zIndex: element.z, color: meta.color, opacity: element.opacity / 100,
                        }}
                        onPointerDown={(event) => startDrag(event, element)}
                      >
                        {asset ? <img className="placed-asset" src={asset.src} alt="" draggable={false} /> : (
                          <div className={`dummy-symbol ${element.category === "landmark" ? "landmark" : "marker"}`}>
                            <span>{meta.glyph}</span>
                          </div>
                        )}
                        {element.status !== "approved" && <span className="review-flag">{element.status === "review" ? "검수 중" : "미검수"}</span>}
                        {element.labelVisible && <div className="label" style={labelStyle(element.labelPosition, element.labelGap)}>{element.name}</div>}
                        {isSelected && !element.locked && (
                          <button
                            className="resize-handle"
                            aria-label="크기 조절"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setInteraction({ type: "resize", id: element.id, startX: event.clientX, startSize: element.size });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="map-scale"><span /> 정규화 좌표 0–100%</div>
            <div className="mobile-readonly">모바일에서는 확대·이동과 배치 열람을 지원합니다.</div>
          </div>
          <footer className="statusbar">
            <span className="status-ok"><i /> 베이스맵 연결됨</span>
            <span>8944 × 7324 px</span>
            <span>요소 {visibleElements.length} / {elements.length}</span>
            <span>{selected ? `선택: ${selected.name}` : "선택 없음"}</span>
            <span className="status-end">실제 위치 데이터 미적용</span>
          </footer>
        </section>

        {!rightOpen && <button className="panel-reopen right" onClick={() => setRightOpen(true)}>‹ 속성</button>}

        <aside className="panel properties-panel" aria-label="속성 편집">
          <div className="panel-heading">
            <div><strong>속성</strong><span>{selected ? selected.name : "요소를 선택하세요"}</span></div>
            <button className="icon-button" onClick={() => setRightOpen(false)} aria-label="오른쪽 패널 접기">›</button>
          </div>
          {!selected ? (
            <div className="empty-properties"><span>◇</span><strong>선택된 요소가 없습니다</strong><p>지도 위 요소를 클릭하면 위치와 크기를 편집할 수 있습니다.</p></div>
          ) : (
            <div className="property-form">
              <section>
                <div className="section-title"><strong>기본 정보</strong><span className={`status-pill ${selected.status}`}>{statusText[selected.status]}</span></div>
                <label>장소명<input value={selected.name} onChange={(event) => updateElement(selected.id, { name: event.target.value })} /></label>
                <label>카테고리<select value={selected.category} onChange={changeCategory}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label>사용 자산<select value={selected.assetId ?? ""} onChange={(event) => {
                  const asset = assets.find((item) => item.id === event.target.value);
                  updateElement(selected.id, asset ? { assetId: asset.id, status: asset.status, category: asset.category } : { assetId: null });
                }}><option value="">임시 색상 도형</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
                <label>검수 상태<select value={selected.status} onChange={(event) => updateElement(selected.id, { status: event.target.value as AssetStatus })}>
                  <option value="approved">승인 완료</option><option value="review">검수 중</option><option value="unchecked">미검수</option>
                </select></label>
              </section>
              <section>
                <div className="section-title"><strong>화면상 배치</strong><span>%</span></div>
                <div className="field-row">
                  <label>X<input type="number" step="0.1" value={selected.x.toFixed(2)} onChange={(event) => updateElement(selected.id, { x: clamp(Number(event.target.value), 0, 100) })} /></label>
                  <label>Y<input type="number" step="0.1" value={selected.y.toFixed(2)} onChange={(event) => updateElement(selected.id, { y: clamp(Number(event.target.value), 0, 100) })} /></label>
                </div>
                <label className="range-label"><span>크기 <b>{selected.size.toFixed(1)}%</b></span><input type="range" min="0.8" max="15" step="0.1" value={selected.size} onChange={(event) => updateElement(selected.id, { size: Number(event.target.value) })} /></label>
                <label className="range-label"><span>투명도 <b>{selected.opacity}%</b></span><input type="range" min="10" max="100" step="1" value={selected.opacity} onChange={(event) => updateElement(selected.id, { opacity: Number(event.target.value) })} /></label>
                <div className="layer-actions" aria-label="표시 순서">
                  <button onClick={() => moveLayer("back")}>맨 뒤</button><button onClick={() => moveLayer("backward")}>한 칸 뒤</button><button onClick={() => moveLayer("forward")}>한 칸 앞</button><button onClick={() => moveLayer("front")}>맨 앞</button>
                </div>
              </section>
              <section>
                <div className="section-title"><strong>실제 위치 앵커</strong><span>직접 편집</span></div>
                <div className="field-row">
                  <label>X<input type="number" step="0.1" value={selected.anchorX.toFixed(2)} onChange={(event) => updateElement(selected.id, { anchorX: clamp(Number(event.target.value), 0, 100) })} /></label>
                  <label>Y<input type="number" step="0.1" value={selected.anchorY.toFixed(2)} onChange={(event) => updateElement(selected.id, { anchorY: clamp(Number(event.target.value), 0, 100) })} /></label>
                </div>
                <button className="wide-secondary" onClick={() => updateElement(selected.id, { anchorX: selected.x, anchorY: selected.y })}>배치 위치를 앵커로 복사</button>
                <p className="field-help">현재 실제 좌표 DB가 없으므로 사용자가 지정한 정규화 좌표만 저장됩니다.</p>
              </section>
              <section>
                <div className="section-title"><strong>연결선</strong><label className="switch"><input type="checkbox" checked={selected.connectorVisible} onChange={(event) => updateElement(selected.id, { connectorVisible: event.target.checked })} /><span /></label></div>
                <div className="field-row compact-color-row">
                  <label>색상<input type="color" value={selected.connectorColor} onChange={(event) => updateElement(selected.id, { connectorColor: event.target.value })} /></label>
                  <label>굵기<input type="number" min="0.5" max="6" step="0.5" value={selected.connectorWidth} onChange={(event) => updateElement(selected.id, { connectorWidth: clamp(Number(event.target.value), 0.5, 6) })} /></label>
                </div>
              </section>
              <section>
                <div className="section-title"><strong>라벨</strong><label className="switch"><input type="checkbox" checked={selected.labelVisible} onChange={(event) => updateElement(selected.id, { labelVisible: event.target.checked })} /><span /></label></div>
                <div className="position-grid">
                  {(["top", "bottom", "left", "right"] as LabelPosition[]).map((position) => (
                    <button key={position} className={selected.labelPosition === position ? "active" : ""} onClick={() => updateElement(selected.id, { labelPosition: position })}>
                      {{ top: "위", bottom: "아래", left: "왼쪽", right: "오른쪽" }[position]}
                    </button>
                  ))}
                </div>
                <label className="range-label"><span>아이콘과 간격 <b>{selected.labelGap}px</b></span><input type="range" min="0" max="30" step="1" value={selected.labelGap} onChange={(event) => updateElement(selected.id, { labelGap: Number(event.target.value) })} /></label>
              </section>
              <section>
                <div className="section-title"><strong>빠른 작업</strong></div>
                <div className="quick-actions">
                  <button onClick={duplicateSelected}>복제</button>
                  <button onClick={() => updateElement(selected.id, { locked: !selected.locked })}>{selected.locked ? "잠금 해제" : "잠금"}</button>
                  <button className="danger" disabled={selected.locked} onClick={deleteSelected}>삭제</button>
                </div>
              </section>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
