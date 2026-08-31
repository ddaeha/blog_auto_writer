const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const STYLE_GUIDE_PATH = path.join(__dirname, 'style-guide.md');

const CATEGORY_LABELS = {
  exterior: '외관/간판',
  interior: '내부/좌석',
  menuboard: '메뉴판',
  etc: '기타',
};

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }
  return new Anthropic({ apiKey });
}

function loadStyleGuide() {
  try {
    return fs.readFileSync(STYLE_GUIDE_PATH, 'utf-8');
  } catch {
    return '';
  }
}

function buildExperiencePrompt(input) {
  const styleGuide = loadStyleGuide();

  const {
    storeName,
    area,
    category,
    address,
    hours,
    reservation,
    phone,
    parking,
    breakTime,
    visitDate,
    companion,
    visitReason,
    sponsorship,
    photoCategories = {},
    menuItems = [],
    episodeNotes,
    recommendFor = [],
    closing,
    hashtags,
    disclosure,
  } = input;

  const allPhotos = [
    ...Object.entries(photoCategories).flatMap(([key, photos]) =>
      (photos || []).map((p) => ({ ...p, section: CATEGORY_LABELS[key] || key }))
    ),
    ...menuItems.flatMap((item, i) =>
      (item.photos || []).map((p) => ({
        ...p,
        section: '메뉴',
        label: item.name || `메뉴 ${i + 1}`,
      }))
    ),
  ];

  const photoListText = allPhotos.length
    ? allPhotos
        .map((p, i) => `${i + 1}. id="${p.id}" | 종류: ${p.section} | 설명: ${p.label || '(설명 없음)'}`)
        .join('\n')
    : '(업로드된 사진 없음)';

  const menuText = menuItems.length
    ? menuItems
        .map((item, i) => `${i + 1}. ${item.name || '(이름 미입력 → 사진/문맥으로 그럴듯하게 지어낼 것)'}${item.price ? ` - ${item.price}` : ' (가격 미입력 → 구체적 숫자를 지어내지 말 것)'}`)
        .join('\n')
    : '(입력된 메뉴 없음, 업종에 맞게 그럴듯한 메뉴 1~3개를 이름만 지어내서 소개, 가격은 언급하지 말 것)';

  const recommendText = recommendFor.length
    ? recommendFor.map((r) => `- ${r}`).join('\n')
    : '(입력 없음, 업체 특성에 맞게 2~3개 자연스럽게 추론해서 작성)';

  const infoBlockItems = [`🚩 위치 및 주소\n${address}`];
  let hoursBlock = `🕐 영업시간\n${hours}`;
  if (breakTime && breakTime.trim() && breakTime.trim() !== '없음') {
    hoursBlock += `\n${breakTime.trim()}`;
  }
  infoBlockItems.push(hoursBlock);
  if (reservation) infoBlockItems.push(`📅 예약 방법\n${reservation}`);
  if (phone) infoBlockItems.push(`📞 전화번호\n${phone}`);
  if (parking) infoBlockItems.push(`🅿 주차\n${parking}`);
  const infoBlock = infoBlockItems.join('\n\n');

  const prompt = `너는 아래 스타일가이드에 정의된 말투를 그대로 흉내내서 체험단 블로그 글을 쓰는 작가야.
스타일가이드를 최우선으로 따르고, 형식적 규칙(제목 공식, 종결어미, 구두점 버릇, 강조 습관, 문단 리듬, 해시태그 스타일, 체크리스트)을 전부 지켜야 해.

===== 스타일가이드 시작 =====
${styleGuide}
===== 스타일가이드 끝 =====

이제 아래 체험단 방문 정보를 바탕으로 글을 써줘.

[반드시 정확하게 그대로 써야 하는 사실 정보 - 절대 바꾸거나 지어내지 말 것]
상호명: ${storeName}
주소/위치: ${address}
영업시간: ${hours}
브레이크타임: ${breakTime}

[나머지 정보 - 입력이 없으면 아래 지침대로 네가 자연스럽게 지어내]
지역/동네: ${area || '(미입력 → 위 주소에서 "구"(자치구) 이름을 추출해서 사용. 예: "서울 용산구 서빙고로 4-8" → "용산". 구 정보가 없을 때만 동/역 이름 사용)'}
업종: ${category || '(미입력 → 상호명/주소로 미루어 자연스럽게 추정)'}
방문일: ${visitDate || '(미입력 → 언급하지 않거나 "최근에" 정도로만 표현)'}
동행자: ${companion || '(미입력 → 자연스럽게 지어내, 예: 친구랑/혼자)'}

(예약 방법/전화번호/주차 정보는 아래 정보 블록에서만 다루고 본문에서 따로 반복하지 마)

[방문 계기]
${visitReason || '(미입력 → 자연스럽게 지어내)'}

[체험단 제공 내역]
${sponsorship || '(미입력 → "메뉴/서비스를 체험단으로 제공받아" 정도로 자연스럽게 서술)'}

[메뉴/상품 목록]
${menuText}

[개인 에피소드/비교 메모]
${episodeNotes || '(미입력 → 이전 방문 비교나 개인 취향 고백 등을 네가 자연스럽게 하나 지어내)'}

[추천 대상]
${recommendText}

[마무리 인사 선호]
${closing || '(스타일가이드 9번 항목 중 하나를 자연스럽게 선택)'}

[해시태그 힌트]
${hashtags || '(미입력, 스타일가이드 10번 규칙대로 5~16개 자동 생성)'}

[업로드된 사진 목록 - 본문에 반드시 자연스러운 위치에 배치할 것]
${photoListText}

사진 배치 규칙:
- 각 사진은 본문에서 해당 내용을 설명하는 문장 바로 다음에 단독 줄로 [[PHOTO:id값]] 토큰을 넣어서 표시해.
- 토큰 앞뒤에 사진 설명을 다시 글로 풀어쓰지 말고, 자연스러운 문장 흐름 안에 토큰만 삽입해.
- 목록에 있는 사진은 전부 최소 1번씩 사용해야 해. 사진이 없으면 토큰을 넣지 마.
- 종류가 "외관/간판"이면 도입부 근처, "내부/좌석"이면 공간 설명 부분, "메뉴판"이면 메뉴 소개 시작 부분, "메뉴"면 해당 메뉴 소개 문장 옆에 배치해.
- 종류가 "기타"면 설명(라벨)에 적힌 내용에 맞는 자연스러운 위치에 배치해. 예를 들어 설명이 반찬 이름이면 메뉴/음식 소개 근처에서 "반찬으로는 ~도 같이 나왔어요" 식으로 자연스럽게 언급하며 배치해.
- 메뉴 사진이 있는데 이름이 "메뉴 N" 형태로만 되어 있으면(사용자가 이름을 안 적은 것), 그럴듯한 메뉴명을 지어내서 자연스럽게 소개해.

[스타일가이드 예외 사항 - 아래는 스타일가이드보다 우선함]
1. 상호명을 소개하는 첫 줄 바로 다음, 도입 인사말이 나오기 전에 아래 정보 블록을 거의 그대로(문구는 다듬어도 되지만 이모지와 항목 구성은 유지) 삽입해. 이 블록 안에서만 예외적으로 이모지를 사용해도 돼 (스타일가이드 5번의 "이모지 사용 안 함" 규칙은 이 블록에는 적용하지 않음). 블록 앞뒤로 빈 줄을 하나씩 둬서 나머지 본문과 구분되게 해:

${infoBlock}

정보 블록이 끝난 바로 다음 줄에 단독으로 [[DIVIDER]] 토큰을 넣어서, 정보 블록과 본문 인사말 사이에 구분선이 들어갈 자리를 표시해. (토큰만 단독으로 한 줄에 넣고, 다른 글자와 섞지 마)

2. 스타일가이드 7번의 "사진/메뉴 설명 앞에 이름만 단독으로 한 줄 배치(소제목처럼)"는 이번 글에서는 쓰지 마. "내부공간", "메뉴판 구경", "감자탕"처럼 사진 앞에 단어 하나만 뚝 떼어놓는 소제목 줄을 만들지 말고, 사진 소개도 자연스러운 문장 흐름 안에서 이어서 설명해.

아래 형식 그대로 응답해 (앞뒤에 다른 설명이나 인사말, 코드블록 표시(\`\`\`) 없이 이 형식만):

<<<TITLE>>>
스타일가이드 제목 공식을 따른 제목 (한 줄)
<<<CONTENT>>>
본문 전체 (사진 토큰 [[PHOTO:id]] 포함, 문단은 빈 줄로 구분, 따옴표나 특수문자 자유롭게 사용 가능)
<<<TAGS>>>
쉼표로 구분된 해시태그 목록 (# 포함)
<<<END>>>

${disclosure ? '본문 도입부 근처(기본 정보 나열 다음)에 "이 글은 체험단으로 선정되어 업체로부터 소정의 제품/서비스를 무상으로 제공받아 작성되었습니다." 문구를 자연스러운 말투로 한 번 포함시켜.' : ''}
맛 평가, 분위기 묘사, 개인 에피소드, 추천 이유 같은 주관적인 내용은 망설이지 말고 실제로 경험한 것처럼 자신 있게, 구체적으로 지어내서 써. 다만 위에서 "반드시 정확하게" 표시된 사실 정보와 모순되면 안 되고, 메뉴 가격처럼 사용자가 직접 입력하지 않은 구체적 수치·평점·통계는 지어내지 마.`;

  return { prompt, photos: allPhotos };
}

function parseAiResponse(text) {
  const titleMatch = text.match(/<<<TITLE>>>\s*([\s\S]*?)\s*<<<CONTENT>>>/);
  const contentMatch = text.match(/<<<CONTENT>>>\s*([\s\S]*?)\s*<<<TAGS>>>/);
  const tagsMatch = text.match(/<<<TAGS>>>\s*([\s\S]*?)\s*(?:<<<END>>>|$)/);

  if (!titleMatch || !contentMatch) {
    throw new Error(
      '응답 형식을 알아볼 수 없습니다. <<<TITLE>>>, <<<CONTENT>>>, <<<TAGS>>> 표시가 포함된 답변 전체를 그대로 복사했는지 확인해주세요.'
    );
  }

  const title = titleMatch[1].trim();
  const content = contentMatch[1].trim();
  const tags = tagsMatch ? tagsMatch[1].trim() : '';

  if (!title || !content) {
    throw new Error('응답에서 제목/본문 내용이 비어 있습니다.');
  }

  return { title, content, tags };
}

async function generateExperiencePost(input) {
  const client = getClient();
  const { prompt, photos } = buildExperiencePrompt(input);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const result = parseAiResponse(text);
  return { ...result, photos };
}

module.exports = { generateExperiencePost, buildExperiencePrompt, parseAiResponse };
