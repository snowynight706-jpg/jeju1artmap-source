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
const asset = (id: string, name: string, placeName: string, sourceId: string, status: "approved" | "review" = "review"): BundledLandmarkAsset => ({
  id,
  name,
  placeName,
  status,
  src: `/landmarks-hq/${id}.webp`,
  fileName: `${id}.webp`,
  sourceUrl: drive(sourceId),
});

export const bundledLandmarkAssets: BundledLandmarkAsset[] = [
  asset("jeju-communication-center-a02", "A-02 외곽선보강 최종", "제주시소통협력센터", "1n1G-0HbAOv9FavuBo54SdxDZWY276b3j", "approved"),
  asset("jeju-art-platform-c01", "C-01", "제주아트플랫폼", "1wtaceoB3q7UL9KUfwkLu-6SjT52zLW-j", "approved"),
  asset("jeju-art-platform-a01", "A-01", "제주아트플랫폼", "15pl0qSHrJEMqcKHaR9lr9k0lA-BJKaJz"),
  asset("jeju-art-platform-a02", "A-02", "제주아트플랫폼", "1hUxtGB9PSRNjNMoAtHdEaEz4vJ2YWEp5"),
  asset("jeju-art-platform-b01", "B-01", "제주아트플랫폼", "1RMFSlCLtAs3D4jleSQ3RGs9cncmHW6YY"),
  asset("jeju-art-platform-b02", "B-02", "제주아트플랫폼", "1nfzH78UF8UVhuGW-DhBwtvyc6eDkgvkW"),
  asset("jeju-art-platform-c02", "C-02", "제주아트플랫폼", "1sWoCzS7pTmljzc0SKyrtaK4n9mTtT7s1"),
  asset("kim-memorial-front01", "정면형 01", "김만덕기념관", "1TncaLfVVVKpo_9QWCUadDbL9ey7Xcv4k"),
  asset("kim-memorial-front02", "정면형 02", "김만덕기념관", "1tN2rU4UdyXpjKhSP9Q2iXSvHLTXOBs9t"),
  asset("kim-memorial-front03", "정면형 03", "김만덕기념관", "1ibKYrZI6AmglYZIrdV03tvWdPiCmIl_C"),
  asset("kim-memorial-quarter01", "3/4형 01", "김만덕기념관", "1XcWZBN6-A7afvlPq5Py02jkb-5pDa_SQ"),
  asset("kim-memorial-quarter02", "3/4형 02", "김만덕기념관", "1UkpS_YFo0h22uVLrC7-mE7R66gDTq4PF"),
  asset("kim-memorial-quarter03", "3/4형 03", "김만덕기념관", "1pyP_iOXVWC6rEtzQqzKc-yQfm8LpzFbu"),
  asset("artspace-ia-01", "01", "예술공간 이아", "1YUKunZFdvrxwRjrg34Ty95ka2ptbrPw4"),
  asset("artspace-ia-02", "02", "예술공간 이아", "1tIGnoC8X5g_fe_1l5IIR1pqteuO_ydg8"),
  asset("artspace-ia-03", "03", "예술공간 이아", "18AH81ITwD8FBJ-Qfh4YhTovuUuwQSeGi"),
  asset("arario-01", "01", "아라리오뮤지엄 탑동시네마", "1HG_1TowUiR5czlwnIqlc1jWI3780k2MH"),
  asset("arario-02", "02", "아라리오뮤지엄 탑동시네마", "1DEkKtQXNFIpQun_V7JFFDq5PGTRrqV56"),
  asset("arario-03", "03", "아라리오뮤지엄 탑동시네마", "10k_eX10r7cefYyNx0q9osSi5Osf00J5G"),
  asset("guesthouse-01", "01", "김만덕객주", "1LOkmVUKR3eG-_2Q1q-y8ChpQjNn-60Pl"),
  asset("guesthouse-02", "02", "김만덕객주", "1___MBqcwArzn1wyNMMGQUDx8-05B4aiZ"),
  asset("guesthouse-03", "03", "김만덕객주", "10ChBGh8STmYBtTyn5m56ef-Du-YXL6eH"),
  asset("sanjicheon-v04", "v04 하천 건너편 · 최신", "산지천갤러리", "1T3VlMGI44afFae5Kya8GM4PNUZgGQ9L5", "approved"),
  asset("sanjicheon-01", "01", "산지천갤러리", "1XUarDISkYCHVdQsP8piqnNCvNaOIaeFj"),
  asset("sanjicheon-02", "02", "산지천갤러리", "1Q7gI2PWrEBwaEdqobg3klkr8BIrJJ6b8"),
  asset("sanjicheon-03", "03", "산지천갤러리", "1EFoaiKmmta7p4Qe9ePxJ57t_tYEv2jer"),
  asset("mokgwana-01", "01", "제주목 관아", "1tG7KM7sXw4R4-74yGbFyfNJuIlrKxP8V"),
  asset("mokgwana-02", "02", "제주목 관아", "1ToM4JNnqgDEPruCl5DcKh3-mteiPPQq_"),
  asset("mokgwana-03", "03", "제주목 관아", "1MPY-AiEONI4xeqak-jmVl64NX6jEd0ZU"),
  asset("gwandeokjeong-01", "01", "관덕정", "16NrEyRrLjfBAImyMZoMz2BIxoSPd6bX8"),
  asset("gwandeokjeong-02", "02", "관덕정", "1wbEOAFrHcNDd2uofLkaUMPGTqdS03jkG"),
  asset("gwandeokjeong-03", "03", "관덕정", "1BAwJbmSCauZ55GAhl4nmiA5BhR_YbSn-"),
  asset("chilsungro", "아치프레임 두께보강 v2", "칠성로", "1qQO5eaUSUgdw1BxHpl9fXymBFgLjN5zW", "approved"),
  asset("dongmun-01", "01 컴팩트본체", "동문시장", "1DXNEpcJSaJNcd34W8QJ8uP7qyfi6I26x"),
  asset("dongmun-02", "02", "동문시장", "1T4FBW7DcqE7W8T1uCX3FNyxkDTGfUFST"),
  asset("dongmun-03", "03 캐노피", "동문시장", "1R9vy-yTJr3QjeSQ2QzETYmO5FpnAPYqQ"),
  asset("buksugu-01", "01", "북수구광장", "13zmz0Hn_SP8ZdWuKBzlHmfvTfBUnDDB5"),
  asset("buksugu-02", "02", "북수구광장", "1U0zkvSggextTVdWPa_PVM5B79ZSPSkOi"),
  asset("buksugu-03", "03", "북수구광장", "1oZuig-CniYawKLnf-oVscgVZjV1j6Vl5"),
  asset("tapdong-square-01", "01 파도형", "탑동광장", "1roVYb8KTXdwTpj1xtqp7EwCNAIgZmpVT"),
  asset("tapdong-square-02", "02", "탑동광장", "1yvxmEjXSFPEn13TyYzL7dSGRyy31Op_i"),
  asset("tapdong-square-03", "03 쌍돌고래", "탑동광장", "1nEplMz-3gj_gqpleBTVTmvSjlAQdOAA8", "approved"),
  asset("tapdong-seaside-stage-02", "02 실사디테일형", "탑동해변공연장", "1yJFc_CSJpdFR0Q8nocCF55ryO57StvEf", "approved"),
  asset("tapdong-seaside-stage-03", "03", "탑동해변공연장", "142n3DD4XmaJXjve45jv_NDUhuCFLn0U0"),
];
