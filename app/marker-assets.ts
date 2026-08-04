export type BundledMarkerCategory = "culture" | "cafe" | "food" | "shop" | "parking" | "park" | "utility";
export type BundledMarkerStyle = "01" | "02" | "03";

export type BundledMarkerAsset = {
  id: string;
  name: string;
  category: BundledMarkerCategory;
  style: BundledMarkerStyle;
  status: "review";
  src: string;
  fileName: string;
  sourceUrl: string;
};

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;

const labels: Record<BundledMarkerCategory, string> = {
  culture: "문화시설",
  cafe: "카페",
  food: "음식점",
  shop: "소품샵",
  parking: "주차장",
  park: "공원·광장",
  utility: "편의시설",
};

const sourceIds: Partial<Record<`${BundledMarkerStyle}-${BundledMarkerCategory}`, string>> = {
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
};

const styles: BundledMarkerStyle[] = ["01", "02", "03"];
const categories: BundledMarkerCategory[] = ["culture", "cafe", "food", "shop", "parking", "park", "utility"];

export const bundledMarkerAssets: BundledMarkerAsset[] = styles.flatMap((style) => (
  categories.map((category) => {
    const key = `${style}-${category}` as const;
    const fileName = `범용마커_${style}_${category}.svg`;
    return {
      id: `generic-marker-${style}-${category}`,
      name: `범용 마커 ${style} · ${labels[category]}`,
      category,
      style,
      status: "review" as const,
      src: `/markers/${fileName}`,
      fileName,
      sourceUrl: sourceIds[key] ? drive(sourceIds[key]!) : "",
    };
  })
));

export const recommendedMarkerStyle: BundledMarkerStyle = "01";

export function markerAssetId(style: BundledMarkerStyle, category: BundledMarkerCategory) {
  return `generic-marker-${style}-${category}`;
}
