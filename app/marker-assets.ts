export type BundledMarkerCategory = "culture" | "cafe" | "food" | "shop" | "parking" | "park" | "utility";
export type BundledMarkerStyle = "01" | "02" | "03" | "v2";
export type BundledMarkerVariant = BundledMarkerCategory | "restroom" | "information";

export type BundledMarkerAsset = {
  id: string;
  name: string;
  category: BundledMarkerCategory;
  variant: BundledMarkerVariant;
  style: BundledMarkerStyle;
  status: "approved" | "review";
  src: string;
  fileName: string;
  sourceUrl: string;
};

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;

const labels: Record<BundledMarkerVariant, string> = {
  culture: "문화시설",
  cafe: "카페",
  food: "음식점",
  shop: "소품샵",
  parking: "주차장",
  park: "공원·광장",
  utility: "편의시설",
  restroom: "화장실",
  information: "안내소",
};

const sourceIds: Partial<Record<`${BundledMarkerStyle}-${BundledMarkerVariant}`, string>> = {
  "01-culture": "11uZ2NNRPPxvvEFm3XzrhHnsvGc_a8Lbx",
  "01-cafe": "1yUUC-aI16laDGM-8m3guPwV_fvTdEbVK",
  "01-food": "1pVZYVC0D7TKA7MFaJHZGtNlzAy96ZtWi",
  "01-shop": "1UVbCHUOkJuhC2FldgqNspHrDQLrHFJh0",
  "01-parking": "1hh5kg2gAOQbuczclwmqU2QyeHatZpmpa",
  "02-culture": "1GXlPLC00EQfTjtj48EUmYAi1Yut4tAM-",
  "02-cafe": "1zSSIOkLjqxjJJcYzb72JP_Q09IPAPtpA",
  "02-food": "1B6hRb5BbdGcIGHB8F5MiuzxuhBXTOmmv",
  "02-shop": "1wRb_M4wTx5qEIoMERWZtZZLlHB6SBHVO",
  "02-parking": "1tGM-BBEN0oVkzvaMsy-bCKL5HWlMdcDG",
  "03-culture": "1LsCIKQm2muMwB2KvTZswRvkm1VgVXnx2",
  "03-cafe": "1jcHO1YPCzyh-0i3X1nRskTCj4KRcrtPy",
  "03-food": "1R5JM5HwAYYWhK3BIpU25r9Q5N9i3WbNC",
  "03-shop": "12xzRRVoun9-cPhgABGGoDp8PBbOVhFYh",
  "03-parking": "15yDh-MGGGyX7ZVMS2R15M-AFbZ2gwh2t",
  "v2-culture": "1Ex5GncCy25mMmIo3C_BlJM9woYh-HhIC",
  "v2-food": "1JLAA2VNY9BUOMpPnQ54QRj0TDYsoUzL9",
  "v2-cafe": "1L268OfvR-DdbvA_Qn8yB263g8cnHb21n",
  "v2-shop": "1y-VWl1eyZqK9WP3ctRcERN9VM_12ZvQH",
  "v2-park": "1KAMD9V_VE4p4JBmevZUwtzx54VI9pTZT",
  "v2-parking": "1y0WVdeSKl9BvECqlLCIVCoRYpxO2JcvR",
  "v2-utility": "1TqsoSAXQfPB4nSbdsvQRZ_7m_pEvwRj5",
  "v2-restroom": "1G4WiWr-PJjYN5hpVaX_xv_lU-89JnAfo",
  "v2-information": "1lI51_yRi-HE8RqSahTIViMClApzB2du8",
};

const styles: BundledMarkerStyle[] = ["v2", "01", "02", "03"];
const categories: BundledMarkerCategory[] = ["culture", "cafe", "food", "shop", "parking", "park", "utility"];

function markerFileName(style: BundledMarkerStyle, variant: BundledMarkerVariant) {
  return style === "v2"
    ? `범용마커_v2_${variant}_approved-final.svg`
    : `범용마커_${style}_${variant}.svg`;
}

function markerAsset(style: BundledMarkerStyle, variant: BundledMarkerVariant, category: BundledMarkerCategory): BundledMarkerAsset {
  const key = `${style}-${variant}` as const;
  const fileName = markerFileName(style, variant);
  const approved = style === "v2";
  return {
    id: `generic-marker-${style}-${variant}`,
    name: approved ? `범용 마커 리뉴얼 최종 · ${labels[variant]}` : `범용 마커 ${style} · ${labels[variant]}`,
    category,
    variant,
    style,
    status: approved ? "approved" : "review",
    src: `/markers/${fileName}`,
    fileName,
    sourceUrl: sourceIds[key] ? drive(sourceIds[key]!) : "",
  };
}

export const bundledMarkerAssets: BundledMarkerAsset[] = [
  ...styles.flatMap((style) => categories.map((category) => markerAsset(style, category, category))),
  markerAsset("v2", "restroom", "utility"),
  markerAsset("v2", "information", "utility"),
];

export const recommendedMarkerStyle: BundledMarkerStyle = "v2";

export function markerAssetId(style: BundledMarkerStyle, category: BundledMarkerCategory) {
  return `generic-marker-${style}-${category}`;
}

export function markerAssetSrc(style: BundledMarkerStyle, category: BundledMarkerCategory) {
  return `/markers/${markerFileName(style, category)}`;
}

export function markerAssetStatus(style: BundledMarkerStyle) {
  return style === "v2" ? "approved" as const : "review" as const;
}

export function markerAssetIdForPlace(style: BundledMarkerStyle, category: BundledMarkerCategory, descriptor = "") {
  if (style === "v2" && category === "utility") {
    if (/화장실/.test(descriptor)) return "generic-marker-v2-restroom";
    if (/안내소|관광안내/.test(descriptor)) return "generic-marker-v2-information";
  }
  return markerAssetId(style, category);
}
