const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
};

function extractPlaceId(url) {
  const m = url.match(/place\/(\d+)/) || url.match(/[?&]id=(\d+)/);
  return m ? m[1] : null;
}

async function parseNaverMapPlace(inputUrl) {
  let placeId = extractPlaceId(inputUrl);

  if (!placeId) {
    // 짧은 링크(naver.me 등)는 실제 장소 페이지로 리다이렉트되므로 따라가서 ID를 찾는다.
    const resolved = await fetch(inputUrl, { redirect: 'follow', headers: UA_HEADERS });
    placeId = extractPlaceId(resolved.url);
  }

  if (!placeId) {
    throw new Error('링크에서 장소 정보를 찾을 수 없습니다. 네이버지도 상세 페이지 링크(장소를 눌러서 나온 링크)인지 확인해주세요.');
  }

  const pageRes = await fetch(`https://m.place.naver.com/place/${placeId}/home`, {
    headers: UA_HEADERS,
  });
  if (!pageRes.ok) {
    throw new Error('네이버지도 페이지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  const html = await pageRes.text();

  const stateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});\s*window\.__/);
  if (!stateMatch) {
    throw new Error('네이버지도 페이지 구조가 예상과 달라 정보를 추출하지 못했습니다.');
  }

  let state;
  try {
    state = JSON.parse(stateMatch[1]);
  } catch {
    throw new Error('네이버지도 데이터를 해석하지 못했습니다.');
  }

  const baseKey = Object.keys(state).find((k) => k.startsWith('PlaceDetailBase:'));
  const base = baseKey && state[baseKey];
  if (!base) {
    throw new Error('가게 정보를 찾지 못했습니다. 삭제되었거나 비공개 장소일 수 있습니다.');
  }

  return {
    storeName: base.name || '',
    address: base.roadAddress || base.address || '',
    phone: base.phone || '',
    category: base.category || '',
    // 영업시간은 네이버지도에도 등록이 안 되어 있는 경우가 많고, 형식이
    // 매장마다 달라 자동 추출이 부정확할 위험이 커서 일부러 채우지 않는다.
    // (사용자가 직접 확인 후 입력하도록 유도)
    hoursAvailableOnNaver: !!base.openingHours,
  };
}

module.exports = { parseNaverMapPlace };
