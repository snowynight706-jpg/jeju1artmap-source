export type BundledLandmarkAsset = {
  id: string;
  name: string;
  placeName: string;
  status: "approved" | "review";
  src: string;
  fileName: string;
  sourceUrl: string;
};

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=drivesdk`;

export const bundledLandmarkAssets: BundledLandmarkAsset[] = [
  { id: "jeju-art-platform-c01", name: "제주아트플랫폼 C-01", placeName: "제주아트플랫폼", status: "approved", src: "/landmarks/jeju-art-platform-c01.png", fileName: "Jeju_Art_Platform_C-01_128px.png", sourceUrl: drive("1baQIFKjm3gQ94Qj_3CC22hCwWsW_A2lO") },
  { id: "jeju-art-platform-a01", name: "제주아트플랫폼 A-01", placeName: "제주아트플랫폼", status: "review", src: "/landmarks/jeju-art-platform-a01.png", fileName: "Jeju_Art_Platform_A-01_128px.png", sourceUrl: drive("1lh4BJ-2YRPXwQs6EvuQIuLCC6YCY26cc") },
  { id: "kim-memorial-front03", name: "김만덕기념관 정면형 03", placeName: "김만덕기념관", status: "review", src: "/landmarks/kim-memorial-front03.png", fileName: "수정_정면형_Kim_Man_Deok_Memorial_03_128px.png", sourceUrl: drive("1apntxgA9UZQUP5JC5C9I0vV-W5tR1qVr") },
  { id: "kim-memorial-quarter03", name: "김만덕기념관 3/4형 03", placeName: "김만덕기념관", status: "review", src: "/landmarks/kim-memorial-quarter03.png", fileName: "초기_3quarter_Kim_Man_Deok_Memorial_03_128px.png", sourceUrl: drive("1MtIPpRnzSDEl_-4NKtna5nfqQZfc_HKE") },
  { id: "artspace-ia-01", name: "예술공간 이아 01", placeName: "예술공간 이아", status: "review", src: "/landmarks/artspace-ia-01.png", fileName: "Artspace_IAa_01.png", sourceUrl: drive("10Pqmb2F5zw24-BnOSizIJfh5ZAHiWCjx") },
  { id: "artspace-ia-03", name: "예술공간 이아 03", placeName: "예술공간 이아", status: "review", src: "/landmarks/artspace-ia-03.png", fileName: "Artspace_IAa_03.png", sourceUrl: drive("1WTwGaRJQO4SaPXcalh1pOGCTNVul3wyf") },
  { id: "arario-01", name: "아라리오뮤지엄 탑동시네마 01", placeName: "아라리오뮤지엄 탑동시네마", status: "review", src: "/landmarks/arario-01.png", fileName: "Arario_Tapdong_Cinema_01_128px.png", sourceUrl: drive("1Ba66IBP23-St6kfz2CcipXr5YZkYPgVG") },
  { id: "arario-03", name: "아라리오뮤지엄 탑동시네마 03", placeName: "아라리오뮤지엄 탑동시네마", status: "review", src: "/landmarks/arario-03.png", fileName: "Arario_Tapdong_Cinema_03_128px.png", sourceUrl: drive("1DnwSxYxBWFIln3cvgvInbvQA393ddGfQ") },
  { id: "guesthouse-01", name: "김만덕객주 01", placeName: "김만덕객주", status: "review", src: "/landmarks/guesthouse-01.png", fileName: "김만덕객주_01_128px_20260803.png", sourceUrl: drive("1oZ08LndTj4W-7XloU_bAbnZLF6sWw5xb") },
  { id: "guesthouse-03", name: "김만덕객주 03", placeName: "김만덕객주", status: "review", src: "/landmarks/guesthouse-03.png", fileName: "김만덕객주_03_128px_20260803.png", sourceUrl: drive("1UijYjnAgwVs6Fafr5fhoWfiHIunOdfx_") },
  { id: "sanjicheon-01", name: "산지천갤러리 01", placeName: "산지천갤러리", status: "review", src: "/landmarks/sanjicheon-01.png", fileName: "Sanjicheon_Gallery_01_128px.png", sourceUrl: drive("1BMGZLABcEjdZiW3imT63lpouNPE3USof") },
  { id: "sanjicheon-03", name: "산지천갤러리 03", placeName: "산지천갤러리", status: "review", src: "/landmarks/sanjicheon-03.png", fileName: "Sanjicheon_Gallery_03_128px.png", sourceUrl: drive("1cHP3KLSC9i8nlcA6UdMT6zVUks4YfJIE") },
  { id: "mokgwana-01", name: "제주목 관아 01", placeName: "제주목 관아", status: "review", src: "/landmarks/mokgwana-01.png", fileName: "제주목_관아_01_128px_20260803.png", sourceUrl: drive("1L1K0nFIb6vuIAMebyfyM9wPbXrIIOIU-") },
  { id: "mokgwana-03", name: "제주목 관아 03", placeName: "제주목 관아", status: "review", src: "/landmarks/mokgwana-03.png", fileName: "제주목_관아_03_128px_20260803.png", sourceUrl: drive("1IaSI1s9XeeXUcCeDqmgyjhN1ZG3PZqEz") },
  { id: "gwandeokjeong-01", name: "관덕정 01", placeName: "관덕정", status: "review", src: "/landmarks/gwandeokjeong-01.png", fileName: "관덕정_01_128px_20260803.png", sourceUrl: drive("1gRmTi_QvSj3hdJZHFev_P_U2ms4RTZi6") },
  { id: "gwandeokjeong-03", name: "관덕정 03", placeName: "관덕정", status: "review", src: "/landmarks/gwandeokjeong-03.png", fileName: "관덕정_03_128px_20260803.png", sourceUrl: drive("12VLUqvBjPuQeERJR8kVvcucNT4t1ZKPJ") },
  { id: "chilsungro", name: "칠성로 실사교정 컴팩트", placeName: "칠성로", status: "approved", src: "/landmarks/chilsungro.png", fileName: "칠성로_실사교정_128px.png", sourceUrl: drive("1a6_YW1RWXM-q_7SPSUGelVdlJujY9Yao") },
  { id: "dongmun-01", name: "동문시장 01 컴팩트본체", placeName: "동문시장", status: "review", src: "/landmarks/dongmun-01.png", fileName: "동문시장_01_128px.png", sourceUrl: drive("1XOFYEKl9Wns3vePaVsEGdN6kQaPZk8wq") },
  { id: "dongmun-03", name: "동문시장 03 캐노피", placeName: "동문시장", status: "review", src: "/landmarks/dongmun-03.png", fileName: "동문시장_03_128px.png", sourceUrl: drive("1omOH3BsHTNaW1vfGsjlcPP5tWSmPHQZ2") },
  { id: "buksugu-01", name: "북수구광장 01", placeName: "북수구광장", status: "review", src: "/landmarks/buksugu-01.png", fileName: "Buksugu_Square_01_128px.png", sourceUrl: drive("1Ve6miAIXwFwrV_5p5ef34m9pU6bnGPGD") },
  { id: "buksugu-03", name: "북수구광장 03", placeName: "북수구광장", status: "review", src: "/landmarks/buksugu-03.png", fileName: "Buksugu_Square_03_128px.png", sourceUrl: drive("1ZGYipbE0KECFHvs0gYOdXipOUPBL0bWr") },
  { id: "tapdong-square-01", name: "탑동광장 01 파도형", placeName: "탑동광장", status: "review", src: "/landmarks/tapdong-square-01.png", fileName: "탑동광장_01_파도형_128px.png", sourceUrl: drive("1Y-uEFAYbcagXLJNgi73UzTHKlgSStzru") },
  { id: "tapdong-square-03", name: "탑동광장 03 쌍돌고래", placeName: "탑동광장", status: "approved", src: "/landmarks/tapdong-square-03.png", fileName: "탑동광장_03_파도형_타공메움_128px.png", sourceUrl: drive("1Zt7947hKrwcB_Kjs-S7-d10UApgw_KAa") },
];
