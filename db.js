const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { nextId: 1, posts: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { nextId: 1, posts: [] };
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function nowLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const store = {
  all() {
    const data = load();
    return [...data.posts].sort((a, b) => b.id - a.id);
  },

  get(id) {
    const data = load();
    return data.posts.find((p) => p.id === Number(id));
  },

  create(fields) {
    const data = load();
    const now = nowLocal();
    const post = {
      id: data.nextId,
      type: 'general',
      topic: '',
      title: '',
      content: '',
      tags: '',
      status: 'draft',
      ...fields,
      created_at: now,
      updated_at: now,
    };
    data.posts.push(post);
    data.nextId += 1;
    save(data);
    return post;
  },

  update(id, fields) {
    const data = load();
    const post = data.posts.find((p) => p.id === Number(id));
    if (!post) return null;
    Object.assign(post, fields, { updated_at: nowLocal() });
    save(data);
    return post;
  },

  remove(id) {
    const data = load();
    data.posts = data.posts.filter((p) => p.id !== Number(id));
    save(data);
  },
};

module.exports = store;
