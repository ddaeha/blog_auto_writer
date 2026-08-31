const UA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
};

const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];

function extractPlaceId(url) {
  const m = url.match(/place\/(\d+)/) || url.match(/[?&]id=(\d+)/);
  return m ? m[1] : null;
}

function daySignature(entry) {
  if (!entry.businessHours) {
    return `closed:${entry.description || '휴무'}`;
  }
  const breaks = (entry.breakHours || []).map((b) => `${b.start}-${b.end}`).join(',');
  const lastOrders = (entry.lastOrderTimes || []).map((t) => t.time).join(',');
  return `open:${entry.businessHours.start}-${entry.businessHours.end}|brk:${breaks}|lo:${lastOrders}`;
}

// 같은 스케줄을 가진 요일끼리 묶는다 (연속 여부와 상관없이 묶고, 라벨을 만들 때만 연속 구간을 압축한다).
function groupBySignature(entries) {
  const groups = new Map();
  const order = [];
  for (const entry of entries) {
    const sig = daySignature(entry);
    if (!groups.has(sig)) {
      groups.set(sig, { entry, days: [] });
      order.push(sig);
    }
    groups.get(sig).days.push(entry.day);
  }
  return order.map((sig) => groups.get(sig));
}

// 예: ['월','수','목','금','토','일'] -> "월,수-일"
function dayRangeLabel(days) {
  const idxs = days.map((d) => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
  const runs = [];
  let start = idxs[0];
  let prev = idxs[0];

  for (let i = 1; i <= idxs.length; i++) {
    if (i < idxs.length && idxs[i] === prev + 1) {
      prev = idxs[i];
      continue;
    }
    runs.push(start === prev ? DAY_ORDER[start] : `${DAY_ORDER[start]}-${DAY_ORDER[prev]}`);
    if (i < idxs.length) {
      start = idxs[i];
      prev = idxs[i];
    }
  }
  return runs.join(',');
}

function formatBusinessHours(businessHoursArr) {
  const sorted = [...businessHoursArr].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)
  );
  const groups = groupBySignature(sorted);

  const hoursLines = [];
  const breakGroups = new Map(); // "start-end" -> Set(days)

  for (const g of groups) {
    const label = dayRangeLabel(g.days);
    const entry = g.entry;

    if (!entry.businessHours) {
      hoursLines.push(`${label} ${entry.description || '휴무'}`);
      continue;
    }

    let line = `${label} ${entry.businessHours.start}-${entry.businessHours.end}`;
    const lastOrders = (entry.lastOrderTimes || []).map((t) => t.time);
    if (lastOrders.length) line += ` (라스트오더 ${lastOrders.join(', ')})`;
    hoursLines.push(line);

    (entry.breakHours || []).forEach((b) => {
      const key = `${b.start}-${b.end}`;
      if (!breakGroups.has(key)) breakGroups.set(key, []);
      breakGroups.get(key).push(...g.days);
    });
  }

  const breakLines = Array.from(breakGroups.entries()).map(
    ([range, days]) => `${dayRangeLabel(days)} ${range} 브레이크타임`
  );

  return {
    hours: hoursLines.join(' / '),
    breakTime: breakLines.length ? breakLines.join(' / ') : '없음',
  };
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

  const result = {
    storeName: base.name || '',
    address: base.roadAddress || base.address || '',
    phone: base.phone || '',
    category: base.category || '',
    hours: '',
    breakTime: '',
    hoursFound: false,
  };

  const rootQuery = state.ROOT_QUERY || {};
  const placeDetailKey = Object.keys(rootQuery).find((k) => k.startsWith('placeDetail('));
  const newBusinessHours = placeDetailKey && rootQuery[placeDetailKey].newBusinessHours;

  if (Array.isArray(newBusinessHours) && newBusinessHours.length && newBusinessHours[0].businessHours) {
    try {
      const { hours, breakTime } = formatBusinessHours(newBusinessHours[0].businessHours);
      result.hours = hours;
      result.breakTime = breakTime;
      result.hoursFound = true;
    } catch {
      // 영업시간 형식을 못 알아봤을 때는 그냥 못 가져온 것으로 처리한다(잘못된 값을 채우지 않음).
    }
  }

  return result;
}

module.exports = { parseNaverMapPlace };
