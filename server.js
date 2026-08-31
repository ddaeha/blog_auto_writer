require('dotenv').config();

// AI 호출 중 예기치 못한 오류가 나도 서버 프로세스 전체가 죽지 않도록 방어.
// (Node 15+는 처리되지 않은 Promise 거부 시 기본적으로 프로세스를 종료시키는데,
//  그러면 클라이언트에서는 정상 에러 응답 대신 "Failed to fetch"만 보이게 된다.)
process.on('unhandledRejection', (err) => {
  console.error('[처리되지 않은 Promise 오류]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[처리되지 않은 예외]', err);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const store = require('./db');
const { generateExperiencePost, buildExperiencePrompt, parseAiResponse } = require('./generator');
const { parseNaverMapPlace } = require('./naver-map');

function requireExperienceFields(input, res) {
  const required = { storeName: '상호명', address: '장소/주소', hours: '영업시간', breakTime: '브레이크타임' };
  for (const [key, label] of Object.entries(required)) {
    if (!input[key] || !String(input[key]).trim()) {
      res.status(400).json({ error: `${label}을(를) 입력해주세요.` });
      return false;
    }
  }
  return true;
}

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    }
    cb(null, true);
  },
});

app.use(express.json({ limit: '5mb' }));
// 브라우저가 오래된 index.html/app.js/style.css를 계속 캐시해서 수정사항이
// 반영 안 되는 문제를 막기 위해, 매번 서버에 최신 여부를 확인하도록 강제한다.
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);
app.use('/uploads', express.static(UPLOAD_DIR));

// 사진 업로드 (체험단 글 작성용, 항목별로 개별 업로드)
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
  res.json({
    id: uuidv4(),
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
  });
});

// 네이버지도 링크로 상호명/주소/전화번호/업종 자동 채우기
app.post('/api/parse-naver-map', async (req, res) => {
  const { url } = req.body;
  if (!url || !String(url).trim()) {
    return res.status(400).json({ error: '네이버지도 링크를 입력해주세요.' });
  }

  try {
    const result = await parseNaverMapPlace(String(url).trim());
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || '네이버지도 정보를 가져오지 못했습니다.' });
  }
});

// 글 목록 조회
app.get('/api/posts', (req, res) => {
  res.json(store.all());
});

// 단일 글 조회
app.get('/api/posts/:id', (req, res) => {
  const post = store.get(req.params.id);
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  res.json(post);
});

// AI로 체험단 글 생성 (체크리스트 입력 + 사진 병합)
app.post('/api/generate-experience', async (req, res) => {
  const input = req.body;
  if (!requireExperienceFields(input, res)) return;

  try {
    const result = await generateExperiencePost(input);
    const post = store.create({
      type: 'experience',
      topic: input.storeName,
      title: result.title,
      content: result.content,
      tags: result.tags,
      status: 'draft',
      photos: result.photos,
      meta: input,
    });
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '체험단 글 생성 중 오류가 발생했습니다.' });
  }
});

// 무료 모드 1단계: API 키 없이 프롬프트 텍스트만 생성 (사용자가 직접 claude.ai에 붙여넣을 용도)
app.post('/api/experience-prompt', (req, res) => {
  const input = req.body;
  if (!requireExperienceFields(input, res)) return;

  try {
    const { prompt, photos } = buildExperiencePrompt(input);
    res.json({ prompt, photos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '프롬프트 생성 중 오류가 발생했습니다.' });
  }
});

// 무료 모드 2단계: claude.ai에서 받은 답변을 붙여넣으면 글로 저장
app.post('/api/experience-manual', (req, res) => {
  const { input, response } = req.body;
  if (!input || !response || !String(response).trim()) {
    return res.status(400).json({ error: 'Claude의 답변을 붙여넣어 주세요.' });
  }
  if (!requireExperienceFields(input, res)) return;

  try {
    const { photos } = buildExperiencePrompt(input);
    const result = parseAiResponse(response);
    const post = store.create({
      type: 'experience',
      topic: input.storeName,
      title: result.title,
      content: result.content,
      tags: result.tags,
      status: 'draft',
      photos,
      meta: input,
    });
    res.json(post);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || '답변을 처리하는 중 오류가 발생했습니다.' });
  }
});

// 글 수정 (제목/본문/태그 직접 편집)
app.put('/api/posts/:id', (req, res) => {
  const { title, content, tags, status } = req.body;
  const existing = store.get(req.params.id);
  if (!existing) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });

  const updated = store.update(req.params.id, {
    title: title ?? existing.title,
    content: content ?? existing.content,
    tags: tags ?? existing.tags,
    status: status ?? existing.status,
  });

  res.json(updated);
});

// 글 삭제
app.delete('/api/posts/:id', (req, res) => {
  store.remove(req.params.id);
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

app.listen(PORT, () => {
  console.log(`블로그 글 작성 봇 서버 실행 중: http://localhost:${PORT}`);
});
