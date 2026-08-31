const CATEGORY_LABELS = {
  exterior: '외관/간판',
  interior: '내부/좌석',
  menuboard: '메뉴판',
  etc: '기타',
};

const state = {
  posts: [],
  activeId: null,
  categoryPhotos: { exterior: [], interior: [], menuboard: [], etc: [] },
  menuItemSeq: 0,
};

const el = {
  postList: document.getElementById('post-list'),
  editorPanel: document.getElementById('editor-panel'),
  editTitle: document.getElementById('edit-title'),
  editContent: document.getElementById('edit-content'),
  editTags: document.getElementById('edit-tags'),
  editStatus: document.getElementById('edit-status'),
  saveBtn: document.getElementById('save-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  copyBtn: document.getElementById('copy-btn'),
  copyRichBtn: document.getElementById('copy-rich-btn'),
  richCopySplit: document.getElementById('rich-copy-split'),
  richCopySplitHint: document.getElementById('rich-copy-split-hint'),
  previewTitle: document.getElementById('preview-title'),
  previewContent: document.getElementById('preview-content'),
  previewView: document.getElementById('preview-view'),
  editView: document.getElementById('edit-view'),

  experienceForm: document.getElementById('experience-form'),
  experienceStatus: document.getElementById('experience-status'),
  experienceBtn: document.getElementById('experience-generate-btn'),
  menuItemsContainer: document.getElementById('menu-items'),
  addMenuItemBtn: document.getElementById('add-menu-item'),

  manualPromptBtn: document.getElementById('manual-prompt-btn'),
  manualSection: document.getElementById('manual-section'),
  manualPromptText: document.getElementById('manual-prompt-text'),
  copyPromptBtn: document.getElementById('copy-prompt-btn'),
  manualResponseText: document.getElementById('manual-response-text'),
  manualSaveBtn: document.getElementById('manual-save-btn'),
  manualStatus: document.getElementById('manual-status'),

  naverMapUrl: document.getElementById('ex-naverMapUrl'),
  naverMapFillBtn: document.getElementById('naver-map-fill-btn'),
  naverMapStatus: document.getElementById('naver-map-status'),
  optionalDetails: document.getElementById('optional-details'),
};

/* ---------- 목록 ---------- */
async function fetchPosts() {
  const res = await fetch('/api/posts');
  state.posts = await res.json();
  renderList();
}

function renderList() {
  el.postList.innerHTML = '';

  if (state.posts.length === 0) {
    el.postList.innerHTML = '<li class="empty-hint">아직 생성된 글이 없어요. 왼쪽에서 정보를 입력해보세요.</li>';
    return;
  }

  for (const post of state.posts) {
    const li = document.createElement('li');
    li.className = 'post-item' + (post.id === state.activeId ? ' active' : '');
    li.innerHTML = `
      <div class="post-title">${post.type === 'experience' ? '🎁 ' : ''}${escapeHtml(post.title)}</div>
      <div class="post-meta">
        <span class="badge ${post.status}">${statusLabel(post.status)}</span>
        <span>${post.created_at}</span>
      </div>
    `;
    li.addEventListener('click', () => openPost(post.id));
    el.postList.appendChild(li);
  }
}

function statusLabel(status) {
  return { draft: '초안', ready: '발행 준비', published: '발행됨' }[status] || status;
}

/* ---------- 에디터 / 미리보기 ---------- */
document.querySelectorAll('.view-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    el.previewView.hidden = view !== 'preview';
    el.editView.hidden = view !== 'edit';
    if (view === 'preview') renderPreview();
  });
});

function photoMap(post) {
  const map = {};
  (post.photos || []).forEach((p) => (map[p.id] = p));
  return map;
}

function renderPreview() {
  const post = state.posts.find((p) => p.id === state.activeId);
  if (!post) return;

  el.previewTitle.textContent = post.title;
  const photos = photoMap(post);
  const tokenRe = /\[\[PHOTO:([a-zA-Z0-9-]+)\]\]/g;

  let html = '';
  let lastIndex = 0;
  let match;
  const content = post.content || '';

  while ((match = tokenRe.exec(content))) {
    html += `<span class="text-chunk">${escapeHtml(content.slice(lastIndex, match.index))}</span>`;
    const photo = photos[match[1]];
    if (photo) {
      html += `<img src="${photo.url}" alt="${escapeHtml(photo.label || '')}" />`;
    }
    lastIndex = tokenRe.lastIndex;
  }
  html += `<span class="text-chunk">${escapeHtml(content.slice(lastIndex))}</span>`;

  el.previewContent.innerHTML = html;
}

function openPost(id) {
  const post = state.posts.find((p) => p.id === id);
  if (!post) return;
  state.activeId = id;

  el.editorPanel.hidden = false;
  el.editTitle.value = post.title;
  el.editContent.value = post.content;
  el.editTags.value = post.tags;
  el.editStatus.value = post.status;

  document.querySelectorAll('.view-tab').forEach((b) => b.classList.remove('active'));
  document.querySelector('.view-tab[data-view="preview"]').classList.add('active');
  el.previewView.hidden = false;
  el.editView.hidden = true;
  renderPreview();
  resetRichCopyUI();

  renderList();
}

/* ---------- 체험단 글: 네이버지도 링크로 자동 채우기 ---------- */
el.naverMapFillBtn.addEventListener('click', async () => {
  const url = el.naverMapUrl.value.trim();
  if (!url) {
    el.naverMapStatus.textContent = '네이버지도 링크를 먼저 붙여넣어주세요.';
    el.naverMapStatus.classList.add('error');
    return;
  }

  el.naverMapFillBtn.disabled = true;
  el.naverMapStatus.textContent = '네이버지도에서 정보를 가져오는 중...';
  el.naverMapStatus.classList.remove('error');

  try {
    const res = await fetch('/api/parse-naver-map', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '정보를 가져오지 못했습니다.');

    document.getElementById('ex-storeName').value = data.storeName || '';
    document.getElementById('ex-address').value = data.address || '';
    document.getElementById('ex-phone').value = data.phone || '';
    document.getElementById('ex-category').value = data.category || '';
    if (data.phone || data.category) el.optionalDetails.open = true;

    if (data.hoursFound) {
      document.getElementById('ex-hours').value = data.hours || '';
      document.getElementById('ex-breakTime').value = data.breakTime || '';
      el.naverMapStatus.textContent = '상호명/주소/전화번호/업종/영업시간/브레이크타임까지 채웠어요. 실제와 맞는지 한 번 확인해주세요.';
    } else {
      el.naverMapStatus.textContent = '상호명/주소/전화번호/업종을 채웠어요. 영업시간은 네이버지도에 등록되어 있지 않아서 직접 입력해주세요.';
    }
  } catch (err) {
    el.naverMapStatus.textContent = err.message;
    el.naverMapStatus.classList.add('error');
  } finally {
    el.naverMapFillBtn.disabled = false;
  }
});

/* ---------- 체험단 글: 카테고리별 사진 업로드 ---------- */
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '업로드 실패');
  return data; // { id, filename, url }
}

function renderThumbs(photos, container, options = {}) {
  const { editableLabel = false } = options;
  container.innerHTML = '';

  photos.forEach((p, index) => {
    if (editableLabel) {
      const wrap = document.createElement('div');
      wrap.className = 'thumb-wrap';
      wrap.innerHTML = `
        <div class="thumb">
          <img src="${p.url}" alt="${escapeHtml(p.label)}" />
          <button type="button" class="remove-thumb" title="삭제">✕</button>
        </div>
        <input type="text" class="thumb-label" value="${escapeHtml(p.label)}" placeholder="예: 계란찜" />
      `;
      wrap.querySelector('.remove-thumb').addEventListener('click', () => {
        photos.splice(index, 1);
        renderThumbs(photos, container, options);
      });
      wrap.querySelector('.thumb-label').addEventListener('input', (e) => {
        p.label = e.target.value;
      });
      container.appendChild(wrap);
    } else {
      const div = document.createElement('div');
      div.className = 'thumb';
      div.innerHTML = `
        <img src="${p.url}" alt="${escapeHtml(p.label)}" />
        <button type="button" class="remove-thumb" title="삭제">✕</button>
      `;
      div.querySelector('.remove-thumb').addEventListener('click', () => {
        photos.splice(index, 1);
        renderThumbs(photos, container, options);
      });
      container.appendChild(div);
    }
  });
}

document.querySelectorAll('.photo-category').forEach((section) => {
  const category = section.dataset.category;
  const input = section.querySelector('.category-photos-input');
  const preview = section.querySelector('.photo-preview');
  const editableLabel = category === 'etc';

  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    for (const file of files) {
      const uploaded = await uploadFile(file);
      const photos = state.categoryPhotos[category];
      photos.push({
        id: uploaded.id,
        url: uploaded.url,
        label: editableLabel ? '' : `${CATEGORY_LABELS[category]} 사진 ${photos.length + 1}`,
      });
      renderThumbs(photos, preview, { editableLabel });
    }
    input.value = '';
  });
});

/* ---------- 체험단 글: 메뉴 항목(메뉴명/가격/사진) ---------- */
function addMenuItemRow() {
  const seq = state.menuItemSeq++;
  const row = document.createElement('div');
  row.className = 'menu-item-row';
  row.dataset.seq = seq;
  row.innerHTML = `
    <button type="button" class="remove-menu-item" title="삭제">✕</button>
    <div class="menu-item-fields">
      <label>메뉴명
        <input type="text" class="menu-name" placeholder="예: 육회 비빔밥" />
      </label>
      <label>가격
        <input type="text" class="menu-price" placeholder="예: 12,000원" />
      </label>
    </div>
    <label>사진
      <input type="file" class="menu-photos-input" accept="image/*" multiple />
    </label>
    <div class="photo-preview menu-photo-preview"></div>
  `;
  row.__photos = [];

  row.querySelector('.remove-menu-item').addEventListener('click', () => row.remove());

  row.querySelector('.menu-photos-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      const uploaded = await uploadFile(file);
      row.__photos.push({ id: uploaded.id, url: uploaded.url, label: '' });
      renderThumbs(row.__photos, row.querySelector('.menu-photo-preview'));
    }
    e.target.value = '';
  });

  el.menuItemsContainer.appendChild(row);
}

el.addMenuItemBtn.addEventListener('click', addMenuItemRow);
addMenuItemRow(); // 기본 1개 행 제공

/* ---------- 체험단 글 생성: 입력값 수집 ---------- */
function collectExperiencePayload() {
  const storeName = document.getElementById('ex-storeName').value.trim();
  const address = document.getElementById('ex-address').value.trim();
  const hours = document.getElementById('ex-hours').value.trim();
  const breakTime = document.getElementById('ex-breakTime').value.trim();
  if (!storeName || !address || !hours || !breakTime) return null;

  const menuItems = Array.from(el.menuItemsContainer.querySelectorAll('.menu-item-row'))
    .map((row) => ({
      name: row.querySelector('.menu-name').value.trim(),
      price: row.querySelector('.menu-price').value.trim(),
      photos: row.__photos || [],
    }))
    .filter((item) => item.name || item.price || item.photos.length);

  const recommendFor = document
    .getElementById('ex-recommendFor')
    .value.split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    storeName,
    address,
    hours,
    breakTime,
    area: document.getElementById('ex-area').value.trim(),
    category: document.getElementById('ex-category').value.trim(),
    reservation: document.getElementById('ex-reservation').value.trim(),
    phone: document.getElementById('ex-phone').value.trim(),
    parking: document.getElementById('ex-parking').value.trim(),
    visitDate: document.getElementById('ex-visitDate').value,
    companion: document.getElementById('ex-companion').value.trim(),
    visitReason: document.getElementById('ex-visitReason').value.trim(),
    sponsorship: document.getElementById('ex-sponsorship').value.trim(),
    disclosure: document.getElementById('ex-disclosure').checked,
    photoCategories: state.categoryPhotos,
    menuItems,
    episodeNotes: document.getElementById('ex-episodeNotes').value.trim(),
    recommendFor,
    closing: document.getElementById('ex-closing').value,
    hashtags: document.getElementById('ex-hashtags').value.trim(),
  };
}

/* ---------- 체험단 글 생성: API 자동 생성 ---------- */
el.experienceForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = collectExperiencePayload();
  if (!payload) return;

  el.experienceBtn.disabled = true;
  el.experienceStatus.textContent = 'AI가 스타일가이드를 참고해 글을 작성하는 중입니다... (20~40초 소요)';
  el.experienceStatus.classList.remove('error');

  try {
    const res = await fetch('/api/generate-experience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '체험단 글 생성에 실패했습니다.');

    el.experienceStatus.textContent = '완성! 목록에서 확인하세요.';
    await fetchPosts();
    openPost(data.id);
  } catch (err) {
    el.experienceStatus.textContent = err.message;
    el.experienceStatus.classList.add('error');
  } finally {
    el.experienceBtn.disabled = false;
  }
});

/* ---------- 체험단 글 생성: 무료(수동 붙여넣기) 모드 ---------- */
el.manualPromptBtn.addEventListener('click', async () => {
  const payload = collectExperiencePayload();
  if (!payload) {
    el.experienceStatus.textContent = '필수 정보(상호명/주소/영업시간/브레이크타임)를 먼저 입력해주세요.';
    el.experienceStatus.classList.add('error');
    return;
  }

  el.manualPromptBtn.disabled = true;
  try {
    const res = await fetch('/api/experience-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '프롬프트 생성에 실패했습니다.');

    state.manualPayload = payload;
    el.manualPromptText.value = data.prompt;
    el.manualSection.hidden = false;
    el.manualStatus.textContent = '';
    el.manualStatus.classList.remove('error');
    el.manualSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    el.experienceStatus.textContent = err.message;
    el.experienceStatus.classList.add('error');
  } finally {
    el.manualPromptBtn.disabled = false;
  }
});

el.copyPromptBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.manualPromptText.value);
    flashButton(el.copyPromptBtn, '복사됨 ✓', '📋 프롬프트 복사하기');
  } catch {
    alert('복사에 실패했습니다. 직접 선택해서 복사해주세요.');
  }
});

el.manualSaveBtn.addEventListener('click', async () => {
  const response = el.manualResponseText.value.trim();
  if (!response) {
    el.manualStatus.textContent = 'Claude의 답변을 붙여넣어 주세요.';
    el.manualStatus.classList.add('error');
    return;
  }
  if (!state.manualPayload) {
    el.manualStatus.textContent = '먼저 위에서 프롬프트를 생성해주세요.';
    el.manualStatus.classList.add('error');
    return;
  }

  el.manualSaveBtn.disabled = true;
  el.manualStatus.textContent = '저장 중...';
  el.manualStatus.classList.remove('error');

  try {
    const res = await fetch('/api/experience-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: state.manualPayload, response }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장에 실패했습니다.');

    el.manualStatus.textContent = '완성! 목록에서 확인하세요.';
    await fetchPosts();
    openPost(data.id);
  } catch (err) {
    el.manualStatus.textContent = err.message;
    el.manualStatus.classList.add('error');
  } finally {
    el.manualSaveBtn.disabled = false;
  }
});

/* ---------- 저장 / 삭제 ---------- */
el.saveBtn.addEventListener('click', async () => {
  if (!state.activeId) return;

  const res = await fetch(`/api/posts/${state.activeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: el.editTitle.value,
      content: el.editContent.value,
      tags: el.editTags.value,
      status: el.editStatus.value,
    }),
  });

  if (res.ok) {
    await fetchPosts();
    renderPreview();
    el.saveBtn.textContent = '저장됨 ✓';
    setTimeout(() => (el.saveBtn.textContent = '저장'), 1200);
  }
});

el.deleteBtn.addEventListener('click', async () => {
  if (!state.activeId) return;
  if (!confirm('이 글을 삭제할까요?')) return;

  await fetch(`/api/posts/${state.activeId}`, { method: 'DELETE' });
  state.activeId = null;
  el.editorPanel.hidden = true;
  await fetchPosts();
});

/* ---------- 복사 ---------- */
el.copyBtn.addEventListener('click', async () => {
  const post = state.posts.find((p) => p.id === state.activeId);
  const photos = post ? photoMap(post) : {};
  const plainContent = el.editContent.value.replace(/\[\[PHOTO:([a-zA-Z0-9-]+)\]\]/g, (m, id) => {
    const photo = photos[id];
    return `(사진: ${photo ? photo.label : '이미지'})`;
  });
  const text = `${el.editTitle.value}\n\n${plainContent}\n\n태그: ${el.editTags.value}`;
  try {
    await navigator.clipboard.writeText(text);
    flashButton(el.copyBtn, '복사됨 ✓', '📋 텍스트만 복사하기');
  } catch {
    alert('클립보드 복사에 실패했습니다. 직접 선택해서 복사해주세요.');
  }
});

const NAVER_MAX_BYTES = 4.5 * 1024 * 1024; // 네이버 본문 붙여넣기 5MB 제한에 여유를 둔 안전 기준

// 제목/본문(사진 토큰 포함)/태그를 순서대로 나열한 (html, plain) 조각 목록으로 만든다.
// 조각 단위로 나눠두면, 용량이 너무 클 때 조각 경계에서 여러 번 복사로 쪼갤 수 있다.
function buildRichParts(post) {
  const photos = photoMap(post);
  const tokenRe = /\[\[PHOTO:([a-zA-Z0-9-]+)\]\]/g;
  const content = el.editContent.value;
  const parts = [{ html: `<h2>${escapeHtml(el.editTitle.value)}</h2>`, plain: `${el.editTitle.value}\n\n` }];

  let lastIndex = 0;
  let match;

  while ((match = tokenRe.exec(content))) {
    const textChunk = content.slice(lastIndex, match.index);
    const textHtml = textToHtml(textChunk);
    if (textHtml) parts.push({ html: textHtml, plain: textChunk });

    const photo = photos[match[1]];
    if (photo) {
      // data URI 대신 실제 웹 주소를 넣는다 - 네이버 에디터는 data: 형태의
      // 이미지를 인식하지 못하고, 붙여넣을 때 진짜 이미지 URL을 다시
      // 자기 서버로 가져가서(fetch) 업로드하는 방식으로 동작하기 때문.
      const absoluteUrl = new URL(photo.url, location.origin).href;
      parts.push({
        html: `<img src="${absoluteUrl}" alt="${escapeHtml(photo.label || '')}" style="max-width:100%;" />`,
        plain: '(사진)',
      });
    }
    lastIndex = tokenRe.lastIndex;
  }

  const tailHtml = textToHtml(content.slice(lastIndex));
  if (tailHtml) parts.push({ html: tailHtml, plain: content.slice(lastIndex) });

  parts.push({ html: `<p>${escapeHtml(el.editTags.value)}</p>`, plain: `\n\n${el.editTags.value}` });

  return parts;
}

// 조각들을 순서대로 합치되, maxBytes를 넘기 직전에 새 묶음으로 끊는다.
function chunkParts(parts, maxBytes) {
  const chunks = [];
  let current = [];
  let currentBytes = 0;

  for (const part of parts) {
    const size = new Blob([part.html]).size;
    if (current.length && currentBytes + size > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(part);
    currentBytes += size;
  }
  if (current.length) chunks.push(current);

  return chunks;
}

async function copyChunkToClipboard(chunkParts, btn, restoreLabel) {
  btn.disabled = true;
  btn.textContent = '복사 중...';
  try {
    const html = chunkParts.map((p) => p.html).join('');
    const plain = chunkParts.map((p) => p.plain).join('');
    const blobHtml = new Blob([html], { type: 'text/html' });
    const blobText = new Blob([plain], { type: 'text/plain' });
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText }),
    ]);
    flashButton(btn, '복사됨 ✓', restoreLabel);
  } catch (err) {
    console.error(err);
    alert(err.message || '복사에 실패했습니다.');
    btn.textContent = restoreLabel;
  } finally {
    btn.disabled = false;
  }
}

function resetRichCopyUI() {
  el.copyRichBtn.hidden = false;
  el.richCopySplit.hidden = true;
  el.richCopySplit.innerHTML = '';
  el.richCopySplitHint.hidden = true;
}

el.copyRichBtn.addEventListener('click', async () => {
  const post = state.posts.find((p) => p.id === state.activeId);
  if (!post) return;

  const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(location.origin);
  const photos = photoMap(post);
  if (isLocalOrigin && Object.keys(photos).length > 0) {
    alert('지금은 로컬 주소(localhost)로 접속 중이라, 네이버가 사진 링크를 가져갈 수 없어요. 배포된 주소(예: onrender.com)로 접속해서 시도해주세요.');
    return;
  }

  const parts = buildRichParts(post);
  const chunks = chunkParts(parts, NAVER_MAX_BYTES);

  if (chunks.length <= 1) {
    resetRichCopyUI();
    await copyChunkToClipboard(parts, el.copyRichBtn, '🖼️ 이미지 포함 복사하기');
    return;
  }

  // 압축해도 용량이 너무 큰 경우: "복사1", "복사2" ... 버튼으로 나눠서 순서대로 붙여넣게 함
  el.copyRichBtn.hidden = true;
  el.richCopySplitHint.hidden = false;
  el.richCopySplit.hidden = false;
  el.richCopySplit.innerHTML = '';

  chunks.forEach((chunk, i) => {
    const label = `복사${i + 1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', () => copyChunkToClipboard(chunk, btn, label));
    el.richCopySplit.appendChild(btn);
  });
});

function textToHtml(text) {
  return text
    .split('\n\n')
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function flashButton(btn, tempText, originalText) {
  btn.textContent = tempText;
  setTimeout(() => (btn.textContent = originalText), 1200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

fetchPosts();

/* ---------- PWA: 서비스워커 정리 ----------
   과거 버전에서 등록한 서비스워커가 오래된 app.js/index.html을 캐시에 물고
   있어서 수정 사항이 반영되지 않는 문제가 있었다. 이 앱은 계속 바뀌는 로컬
   도구라 오프라인 캐싱의 이득보다 "업데이트가 안 보이는" 부작용이 크므로,
   서비스워커 자체를 쓰지 않기로 하고 기존에 설치된 것이 있으면 해제한다.
   (홈 화면 추가 기능은 manifest.json만으로 그대로 동작한다.) */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
}
