import bcrypt from 'bcryptjs';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import {
  DB_PATH,
  db,
  id,
  initDb,
  now,
  toComment,
  toHtmlSite,
  toPost,
  toPostImage,
  toPublicUser,
  toWall,
  toWallFolder
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DEFAULT_PORT = Number(process.env.PORT || 47831);
const HOST = process.env.HOST || '0.0.0.0';
const CLIENT_DIR = fs.existsSync(DIST) ? DIST : ROOT;
const HTML_SITES_DIR = path.join(path.dirname(DB_PATH), 'html-sites');
const POST_IMAGES_DIR = path.join(path.dirname(DB_PATH), 'post-images');
const MAX_HTML_BYTES = 1024 * 1024 * 5;
const DEFAULT_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024 * 10;
const MAX_POST_IMAGES = 8;
const MAX_IMAGE_BYTES = 1024 * 1024 * 100;

initDb();
fs.mkdirSync(HTML_SITES_DIR, { recursive: true });
fs.mkdirSync(POST_IMAGES_DIR, { recursive: true });

const app = express();
const uploadPostImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_POST_IMAGES,
    fileSize: MAX_IMAGE_BYTES
  }
});
app.use(express.json({ limit: '6mb' }));
app.use('/uploads/post-images', express.static(POST_IMAGES_DIR));

function tokenFrom(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return '';
}

function userFrom(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT users.*
       FROM sessions
       JOIN users ON users.uid = sessions.uid
       WHERE sessions.token = ?`
    )
    .get(token);
  return row || null;
}

function requireUser(req, res, next) {
  const user = userFrom(req);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  req.user = user;
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).json({ error: 'forbidden' });
    return next();
  };
}

function requireTeacherOrAdmin(req, res, next) {
  if (!req.user || !['teacher', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
}

function requireHtmlHosting(req, res, next) {
  if (!req.user || req.user.role !== 'teacher' || !req.user.can_host_html) {
    return res.status(403).json({ error: 'html-hosting-not-enabled' });
  }
  return next();
}

function assertPassword(password) {
  if (String(password || '').length < 6) {
    const error = new Error('Password must be at least 6 characters.');
    error.status = 400;
    throw error;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function csvRow(values) {
  return values.map(csvCell).join(',');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFilename(value, fallback = 'wall') {
  return String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80) || fallback;
}

function imageDataUrl(image) {
  const filePath = storedPostImagePath(image.stored_name);
  if (!fs.existsSync(filePath)) return '';
  const base64 = fs.readFileSync(filePath).toString('base64');
  return `data:${image.mime_type || 'application/octet-stream'};base64,${base64}`;
}

function normalizePostTemplate(value) {
  const fields = Array.isArray(value?.fields) ? value.fields : [];
  return {
    fields: fields.slice(0, 10).map((field, index) => {
      const label = String(field?.label || '').trim().slice(0, 80);
      const type = ['shortText', 'longText', 'image'].includes(field?.type) ? field.type : 'shortText';
      return {
        id: String(field?.id || `field_${index + 1}`).replace(/[^\w-]/g, '').slice(0, 40) || `field_${index + 1}`,
        label: label || `질문 ${index + 1}`,
        type,
        required: field?.required !== false
      };
    })
  };
}

function normalizeFolderName(value) {
  return String(value || '').trim().slice(0, 20);
}

const FOLDER_COLOR_PRESETS = new Set([
  '#fde8ef',
  '#fdebd8',
  '#fff4c6',
  '#e8f3d8',
  '#def3e8',
  '#e3f0fb',
  '#eee8fb',
  '#f3ead8'
]);
const LEGACY_FOLDER_COLOR_MAP = {
  '#f9a8d4': '#fde8ef',
  '#fca5a5': '#fde8ef',
  '#fdba74': '#fdebd8',
  '#fde68a': '#fff4c6',
  '#bef264': '#e8f3d8',
  '#86efac': '#def3e8',
  '#7dd3fc': '#e3f0fb',
  '#c4b5fd': '#eee8fb'
};

function normalizeFolderColor(value) {
  const color = String(value || '').trim().toLowerCase();
  if (!color) return null;
  if (LEGACY_FOLDER_COLOR_MAP[color]) return LEGACY_FOLDER_COLOR_MAP[color];
  if (FOLDER_COLOR_PRESETS.has(color)) return color;
  const error = new Error('invalid-folder-color');
  error.status = 400;
  throw error;
}

function normalizeHtmlTitle(value) {
  return String(value || '').trim().slice(0, 80) || 'HTML 사이트';
}

function htmlSiteFile(siteId) {
  return path.join(HTML_SITES_DIR, siteId, 'index.html');
}

function writeHtmlSiteFile(siteId, html) {
  const filePath = htmlSiteFile(siteId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html, 'utf8');
}

function removeHtmlSiteFiles(siteId) {
  fs.rmSync(path.join(HTML_SITES_DIR, siteId), { recursive: true, force: true });
}

function makeSiteSlug() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = id('site_').replace(/^site_/, '').slice(0, 8);
    const exists = db.prepare('SELECT 1 FROM html_sites WHERE slug = ?').get(slug);
    if (!exists) return slug;
  }
  return id('site_').replace(/^site_/, '');
}

function normalizeHtml(value) {
  const html = String(value || '');
  if (!html.trim()) {
    const error = new Error('html-required');
    error.status = 400;
    throw error;
  }
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    const error = new Error('html-too-large');
    error.status = 400;
    throw error;
  }
  return html;
}

function normalizeStorageLimit(value, fallback = DEFAULT_STORAGE_LIMIT_BYTES) {
  if (value === null) return null;
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error('invalid-storage-limit');
    error.status = 400;
    throw error;
  }
  return Math.floor(number);
}

function parsePostBody(req) {
  if (req.is('multipart/form-data')) {
    const rawPayload = String(req.body.payload || '{}');
    try {
      return JSON.parse(rawPayload);
    } catch {
      const error = new Error('invalid-post-payload');
      error.status = 400;
      throw error;
    }
  }
  return req.body || {};
}

function safeUploadExtension(file) {
  const fromName = path.extname(file.originalname || '').toLowerCase().replace(/[^.\w]/g, '');
  if (fromName && fromName.length <= 12) return fromName;
  if (file.mimetype === 'image/jpeg') return '.jpg';
  if (file.mimetype === 'image/png') return '.png';
  if (file.mimetype === 'image/gif') return '.gif';
  if (file.mimetype === 'image/webp') return '.webp';
  if (file.mimetype === 'image/heic') return '.heic';
  if (file.mimetype === 'image/heif') return '.heif';
  return '';
}

function normalizePostImageFiles(files, user) {
  const images = (files || [])
    .filter((file) => file.fieldname === 'images' || file.fieldname.startsWith('images:'))
    .map((file) => ({
      file,
      fieldId: file.fieldname.startsWith('images:')
        ? file.fieldname.slice('images:'.length).replace(/[^\w-]/g, '').slice(0, 40) || null
        : null
    }));
  if (images.length > MAX_POST_IMAGES) {
    const error = new Error('too-many-images');
    error.status = 400;
    throw error;
  }
  if (images.length && !user) {
    const error = new Error('image-upload-requires-login');
    error.status = 401;
    throw error;
  }
  for (const image of images) {
    if (!String(image.file.mimetype || '').startsWith('image/')) {
      const error = new Error('image-file-required');
      error.status = 400;
      throw error;
    }
  }
  return images;
}

function assertStorageAvailable(user, files) {
  if (!files.length) return;
  const totalSize = files.reduce((sum, image) => sum + image.file.size, 0);
  const limit = user.storage_limit_bytes;
  if (limit == null) return;
  if ((user.storage_used_bytes || 0) + totalSize > limit) {
    const error = new Error('storage-limit-exceeded');
    error.status = 413;
    throw error;
  }
}

function storageOwnerForWall(wall) {
  const owner = db.prepare('SELECT * FROM users WHERE uid = ?').get(wall.ownerId);
  if (!owner) {
    const error = new Error('storage-owner-not-found');
    error.status = 404;
    throw error;
  }
  return owner;
}

function postImagesFor(postId) {
  return db
    .prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY created_at ASC')
    .all(postId)
    .map(toPostImage);
}

function postWithImages(row) {
  const post = toPost(row);
  if (!post) return null;
  return {
    ...post,
    images: postImagesFor(post.id)
  };
}

function postsForWall(wallId) {
  return db
    .prepare('SELECT * FROM posts WHERE wall_id = ? ORDER BY order_no ASC')
    .all(wallId)
    .map(postWithImages);
}

function storedPostImagePath(storedName) {
  return path.join(POST_IMAGES_DIR, storedName);
}

function removeImageFiles(imageRows) {
  for (const image of imageRows) {
    fs.rmSync(storedPostImagePath(image.stored_name), { force: true });
  }
}

function decrementStorageForImages(imageRows) {
  const byOwner = new Map();
  for (const image of imageRows) {
    byOwner.set(image.owner_id, (byOwner.get(image.owner_id) || 0) + Number(image.size_bytes || 0));
  }
  for (const [ownerId, bytes] of byOwner) {
    db.prepare(
      `UPDATE users
       SET storage_used_bytes = MAX(0, storage_used_bytes - ?), updated_at = ?
       WHERE uid = ?`
    ).run(bytes, now(), ownerId);
  }
}

function imagesForPostIds(postIds) {
  if (!postIds.length) return [];
  const placeholders = postIds.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM post_images WHERE post_id IN (${placeholders})`).all(...postIds);
}

function uniqueImages(imageRows) {
  const seen = new Set();
  const uniqueRows = [];
  for (const image of imageRows) {
    if (seen.has(image.id)) continue;
    seen.add(image.id);
    uniqueRows.push(image);
  }
  return uniqueRows;
}

function deletePostsWithImages(whereSql, params) {
  const posts = db.prepare(`SELECT id FROM posts ${whereSql}`).all(...params);
  const postIds = posts.map((post) => post.id);
  const images = imagesForPostIds(postIds);
  db.transaction(() => {
    decrementStorageForImages(images);
    db.prepare(`DELETE FROM posts ${whereSql}`).run(...params);
  })();
  removeImageFiles(images);
}

function deleteImageRows(imageRows) {
  const images = uniqueImages(imageRows);
  if (!images.length) return;
  db.transaction(() => {
    decrementStorageForImages(images);
    const removeImage = db.prepare('DELETE FROM post_images WHERE id = ?');
    for (const image of images) removeImage.run(image.id);
  })();
  removeImageFiles(images);
}

function imagesForPostFieldIds(postId, fieldIds) {
  const safeFieldIds = fieldIds.filter(Boolean);
  if (!safeFieldIds.length) return [];
  const placeholders = safeFieldIds.map(() => '?').join(',');
  return db
    .prepare(`SELECT * FROM post_images WHERE post_id = ? AND field_id IN (${placeholders})`)
    .all(postId, ...safeFieldIds);
}

function savePostImages(postId, ownerId, files) {
  const created = now();
  const rows = files.map((image) => {
    const file = image.file;
    const storedName = `${id('img_')}${safeUploadExtension(file)}`;
    return {
      id: id('pimg_'),
      postId,
      ownerId,
      fieldId: image.fieldId,
      storedName,
      originalName: String(file.originalname || 'image').slice(0, 180),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      createdAt: created,
      file
    };
  });

  try {
    for (const row of rows) {
      fs.writeFileSync(storedPostImagePath(row.storedName), row.file.buffer);
    }
    db.transaction(() => {
      const insertImage = db.prepare(
        `INSERT INTO post_images
         (id, post_id, owner_id, field_id, stored_name, original_name, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const row of rows) {
        insertImage.run(
          row.id,
          row.postId,
          row.ownerId,
          row.fieldId,
          row.storedName,
          row.originalName,
          row.mimeType,
          row.sizeBytes,
          row.createdAt
        );
      }
      const totalSize = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
      db.prepare(
        'UPDATE users SET storage_used_bytes = storage_used_bytes + ?, updated_at = ? WHERE uid = ?'
      ).run(totalSize, now(), ownerId);
    })();
  } catch (error) {
    removeImageFiles(rows.map((row) => ({ stored_name: row.storedName })));
    throw error;
  }
}

function canUseFolder(folderId, ownerId) {
  if (!folderId) return true;
  const folder = db.prepare('SELECT * FROM wall_folders WHERE id = ?').get(folderId);
  return Boolean(folder && folder.owner_id === ownerId);
}

function worksheetContent(template, answers) {
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  return fields
    .map((field) => {
      if (field.type === 'image') {
        const answer = String(answers?.[field.id] || '').trim();
        return answer ? `${field.label}\n${answer}` : '';
      }
      const answer = String(answers?.[field.id] || '').trim();
      return `${field.label}\n${answer}`;
    })
    .join('\n\n')
    .trim();
}

function normalizeTemplateAnswers(template, value) {
  const answers = value && typeof value === 'object' ? value : {};
  const nextAnswers = {};
  for (const field of template.fields || []) {
    if (field.type === 'image') {
      nextAnswers[field.id] = String(answers[field.id] || '').trim() ? '[사진]' : '';
      continue;
    }
    const limit = field.type === 'longText' ? 1000 : 100;
    nextAnswers[field.id] = String(answers[field.id] || '').trim().slice(0, limit);
  }
  return nextAnswers;
}

function exportWallBackground(value) {
  const colors = {
    'bg-[#fff8e8]': '#e6d3ad',
    'bg-[#edf7f2]': '#b8c9a3',
    'bg-[#eef6ff]': '#a6bdd6',
    'bg-[#f5efff]': '#b7a4cb',
    'bg-[#fff0ea]': '#d8a684',
    'bg-[#f3ead8]': '#c89c67'
  };
  return colors[value] || colors['bg-[#fff8e8]'];
}

function exportPostColor(value) {
  const colors = {
    'bg-yellow-100': '#fef9c3',
    'bg-rose-100': '#ffe4e6',
    'bg-sky-100': '#e0f2fe',
    'bg-lime-100': '#ecfccb',
    'bg-orange-100': '#ffedd5'
  };
  return colors[value] || colors['bg-yellow-100'];
}

function exportDateText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function exportPostSortValue(post, fallback) {
  return Number.isFinite(Number(post.order)) ? Number(post.order) : fallback;
}

function renderWallExportHtml(wallData, posts, commentsByPost, options = {}) {
  const includeAuthorNames = options.includeAuthorNames !== false;
  const templateFields =
    wallData.postMode === 'worksheet' && Array.isArray(wallData.postTemplate?.fields)
      ? wallData.postTemplate.fields
      : [];
  const columnNames = wallData.columnNames || {};
  const generatedAt = new Date().toLocaleString('ko-KR');
  const boardColor = exportWallBackground(wallData.backgroundTone);
  const columnCount = Math.min(Math.max(Number(wallData.columnCount) || 4, 1), 5);
  const columnNumbers = Array.from({ length: columnCount }, (_, index) => index + 1);
  const postsByColumn = Object.fromEntries(columnNumbers.map((column) => [column, []]));
  let fallbackIndex = 0;
  for (const post of posts) {
    const column = post.column && postsByColumn[post.column]
      ? post.column
      : columnNumbers[fallbackIndex++ % columnNumbers.length];
    postsByColumn[column].push(post);
  }
  for (const column of columnNumbers) {
    postsByColumn[column].sort((a, b) => {
      const aOrder = exportPostSortValue(a, -new Date(a.createdAt || 0).getTime());
      const bOrder = exportPostSortValue(b, -new Date(b.createdAt || 0).getTime());
      return aOrder - bOrder;
    });
  }
  const authorLabel = (item) => {
    if (includeAuthorNames) return item.authorName || '익명';
    return item.authorId === wallData.ownerId ? '선생님' : '비공개';
  };
  const renderPost = (post) => {
    const comments = commentsByPost.get(post.id) || [];
    const imagesByField = new Map(
      (post.images || [])
        .filter((image) => image.fieldId)
        .map((image) => [image.fieldId, image])
    );
    const freeImages = (post.images || []).filter((image) => !image.fieldId);
    const likeCount = post.likeCount || 0;
    const bodyHtml =
      wallData.postMode === 'worksheet'
        ? templateFields
            .map((field) => {
              const image = imagesByField.get(field.id);
              const answer = post.templateAnswers?.[field.id] || '';
              if (!image && !answer) return '';
              return `
                <section class="answer">
                  <h3>${escapeHtml(field.label)}</h3>
                  ${
                    image
                      ? `<img class="post-image" src="${image.dataUrl}" alt="${escapeHtml(image.originalName || field.label)}" data-full-image="true">`
                      : `<p>${escapeHtml(answer).replace(/\n/g, '<br>')}</p>`
                  }
                </section>
              `;
            })
            .join('')
        : `
            ${
              String(post.content || '').trim()
                ? `<p class="content">${escapeHtml(post.content).replace(/\n/g, '<br>')}</p>`
                : ''
            }
            ${freeImages
              .map(
                (image) =>
                  `<img class="post-image" src="${image.dataUrl}" alt="${escapeHtml(image.originalName || '첨부 사진')}" data-full-image="true">`
              )
              .join('')}
          `;
    return `
      <article class="post" style="--post-color: ${exportPostColor(post.color)};">
        ${bodyHtml || '<p class="content empty-content">내용이 없습니다.</p>'}
        <footer class="post-footer">
          <span>${escapeHtml(authorLabel(post))}</span>
          <span>${escapeHtml(exportDateText(post.createdAt))}</span>
        </footer>
        <div class="post-actions">
          ${wallData.likesEnabled ? `<span class="action-pill">♡ ${escapeHtml(String(likeCount))}</span>` : ''}
          ${wallData.commentsEnabled ? `<span class="action-pill">댓글 ${escapeHtml(String(comments.length))}</span>` : ''}
        </div>
        ${
          comments.length
            ? `<section class="comments">
                <h3>댓글</h3>
                ${comments
                  .map(
                    (comment) => `
                      <div class="comment">
                        <div class="comment-meta">
                          <b>${escapeHtml(authorLabel(comment))}</b>
                          <span>${escapeHtml(exportDateText(comment.createdAt))}</span>
                        </div>
                        <p>${escapeHtml(comment.text).replace(/\n/g, '<br>')}</p>
                      </div>
                    `
                  )
                  .join('')}
              </section>`
            : ''
        }
      </article>
    `;
  };
  const columnHtml = columnNumbers
    .map((column) => {
      const columnPosts = postsByColumn[column] || [];
      return `
        <section class="wall-column">
          ${
            wallData.columnModeEnabled && String(columnNames[column] || '').trim()
              ? `<h2>${escapeHtml(columnNames[column])}</h2>`
              : ''
          }
          <div class="column-posts">
            ${columnPosts.map(renderPost).join('')}
          </div>
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(wallData.title || '담벼락')}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: ${boardColor};
      color: #1c1917;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      line-height: 1.55;
    }
    header {
      padding: 30px clamp(20px, 5vw, 84px) 24px;
      background: rgba(255, 250, 240, 0.74);
      border-bottom: 1px solid rgba(28, 25, 23, 0.12);
    }
    main {
      min-height: calc(100vh - 136px);
      padding: 34px clamp(18px, 5vw, 84px);
      background-image: radial-gradient(rgba(120, 113, 108, 0.28) 1.1px, transparent 1.1px);
      background-size: 24px 24px;
    }
    h1 { margin: 0; font-size: 38px; line-height: 1.18; letter-spacing: 0; }
    .description { margin: 10px 0 0; color: #57534e; white-space: pre-wrap; font-weight: 600; }
    .export-meta { margin-top: 12px; font-size: 14px; color: #6b6259; font-weight: 700; }
    .columns-grid {
      display: grid;
      grid-template-columns: repeat(${columnCount}, minmax(0, 1fr));
      gap: 20px;
      width: min(100%, 1600px);
      margin: 0 auto;
    }
    .wall-column {
      min-height: 300px;
      border-radius: 16px;
      padding: 12px;
    }
    .wall-column h2 {
      margin: 0 0 16px;
      min-height: 48px;
      border: 1px solid rgba(255, 255, 255, 0.75);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.68);
      padding: 10px 12px;
      text-align: center;
      font-size: 24px;
      line-height: 1.2;
      box-shadow: 0 2px 10px rgba(28, 25, 23, 0.06);
    }
    .column-posts { display: grid; gap: 16px; }
    .post {
      width: 100%;
      border: 1px solid rgba(28, 25, 23, 0.08);
      border-radius: 10px;
      background: var(--post-color);
      padding: 16px;
      box-shadow: 0 2px 5px rgba(28, 25, 23, 0.14), 0 12px 24px rgba(28, 25, 23, 0.08);
      page-break-inside: avoid;
    }
    .post-footer, .comment-meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: #57534e;
      font-size: 14px;
      font-weight: 800;
    }
    .post-footer {
      margin-top: 18px;
      border-bottom: 1px solid rgba(28, 25, 23, 0.1);
      padding-bottom: 12px;
    }
    .content {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 17px;
      font-weight: 650;
      line-height: 1.7;
    }
    .empty-content { color: #78716c; }
    .answer { margin-top: 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.45); padding: 10px 12px; }
    .answer:first-of-type { margin-top: 0; }
    .answer h3, .comments h3 { margin: 0 0 8px; font-size: 13px; color: #70675f; font-weight: 900; }
    .answer p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 16px; font-weight: 650; line-height: 1.7; }
    .post-image {
      display: block;
      width: 100%;
      max-height: 420px;
      margin-top: 0;
      border-radius: 10px;
      object-fit: contain;
      background: rgba(255, 255, 255, 0.55);
      border: 1px solid rgba(28, 25, 23, 0.1);
      cursor: zoom-in;
    }
    .content + .post-image { margin-top: 16px; }
    .post-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .action-pill {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.75);
      padding: 6px 12px;
      color: #44403c;
      font-size: 14px;
      font-weight: 800;
    }
    .comments {
      margin-top: 16px;
      border-top: 1px solid rgba(28, 25, 23, 0.12);
      padding-top: 12px;
    }
    .comment { margin-top: 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.55); padding: 10px; }
    .comment p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .empty, .column-empty {
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.55);
      padding: 40px;
      color: #57534e;
      text-align: center;
      font-weight: 700;
    }
    .column-empty { padding: 18px; }
    .image-lightbox {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 28px;
      background: rgba(28, 25, 23, 0.86);
    }
    .image-lightbox.open { display: flex; }
    .image-lightbox img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 10px;
      background: #fff;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
    }
    .image-lightbox button {
      position: fixed;
      top: 18px;
      right: 18px;
      border: 0;
      border-radius: 999px;
      background: #fff;
      color: #1c1917;
      padding: 10px 14px;
      font-size: 16px;
      font-weight: 900;
      cursor: pointer;
    }
    @media (max-width: 1279px) and (min-width: 768px) {
      .columns-grid { grid-template-columns: repeat(${Math.min(columnCount, 2)}, minmax(0, 1fr)); }
    }
    @media (max-width: 767px) {
      h1 { font-size: 30px; }
      .columns-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(wallData.title || '담벼락')}</h1>
    ${wallData.description ? `<p class="description">${escapeHtml(wallData.description)}</p>` : ''}
    <p class="export-meta">${escapeHtml(wallData.ownerName || '')} 선생님 · 게시글 ${posts.length}개 · 내보낸 시간 ${escapeHtml(generatedAt)}</p>
  </header>
  <main>
    ${
      posts.length
        ? `<div class="columns-grid">${columnHtml}</div>`
        : '<p class="empty">게시글이 없습니다.</p>'
    }
  </main>
  <div class="image-lightbox" id="image-lightbox" aria-hidden="true">
    <button type="button" id="image-lightbox-close" aria-label="닫기">닫기</button>
    <img alt="">
  </div>
  <script>
    (() => {
      const lightbox = document.getElementById('image-lightbox');
      const lightboxImage = lightbox?.querySelector('img');
      const closeButton = document.getElementById('image-lightbox-close');
      const close = () => {
        if (!lightbox || !lightboxImage) return;
        lightbox.classList.remove('open');
        lightbox.setAttribute('aria-hidden', 'true');
        lightboxImage.removeAttribute('src');
        lightboxImage.removeAttribute('alt');
      };
      document.querySelectorAll('[data-full-image="true"]').forEach((image) => {
        image.addEventListener('click', () => {
          if (!lightbox || !lightboxImage) return;
          lightboxImage.src = image.src;
          lightboxImage.alt = image.alt || '첨부 사진';
          lightbox.classList.add('open');
          lightbox.setAttribute('aria-hidden', 'false');
        });
      });
      closeButton?.addEventListener('click', close);
      lightbox?.addEventListener('click', (event) => {
        if (event.target === lightbox) close();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
      });
    })();
  </script>
</body>
</html>`;
}

function validateWorksheetImages(template, imageFiles) {
  const imageFields = (template.fields || []).filter((field) => field.type === 'image');
  const allowedFieldIds = new Set(imageFields.map((field) => field.id));
  const imageFieldIds = new Set(imageFiles.map((image) => image.fieldId).filter(Boolean));
  if (imageFiles.some((image) => !image.fieldId || !allowedFieldIds.has(image.fieldId))) {
    const error = new Error('invalid-worksheet-image-field');
    error.status = 400;
    throw error;
  }
  const missingField = imageFields.find((field) => field.required !== false && !imageFieldIds.has(field.id));
  if (missingField) {
    const error = new Error('worksheet-image-required');
    error.status = 400;
    throw error;
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, dbPath: DB_PATH });
});

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const loginId = String(req.body.id || '').trim();
  const password = String(req.body.password || '');
  const row = db.prepare('SELECT * FROM users WHERE login_id = ?').get(loginId);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'invalid-credentials' });
  }
  const token = id('tok_');
  db.prepare('INSERT INTO sessions (token, uid, created_at) VALUES (?, ?, ?)').run(
    token,
    row.uid,
    now()
  );
  return res.json({ token, user: toPublicUser(row) });
}));

app.post('/api/auth/logout', requireUser, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenFrom(req));
  res.json({ ok: true });
});

app.get('/api/auth/me', requireUser, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

app.get('/api/users', requireUser, (req, res) => {
  const { role, teacherId } = req.query;
  const clauses = [];
  const params = [];
  if (role) {
    clauses.push('role = ?');
    params.push(role);
  }
  if (teacherId) {
    clauses.push('teacher_id = ?');
    params.push(teacherId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC`).all(...params);
  res.json({ items: rows.map(toPublicUser) });
});

app.post('/api/users', requireUser, requireTeacherOrAdmin, (req, res) => {
  const loginId = String(req.body.id || '').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '').trim();
  if (!loginId || !['teacher', 'student'].includes(role)) {
    return res.status(400).json({ error: 'invalid-user' });
  }
  if (req.user.role === 'teacher' && role !== 'student') {
    return res.status(403).json({ error: 'forbidden' });
  }
  assertPassword(password);

  const uid = id('usr_');
  const displayName = String(req.body.displayName || loginId).trim();
  const teacherId = role === 'student' ? req.body.teacherId || req.user.uid : null;
  const passwordHint = req.body.passwordHint || null;
  const storageLimitBytes =
    role === 'teacher' ? normalizeStorageLimit(req.body.storageLimitBytes) : 0;
  try {
    db.prepare(
      `INSERT INTO users
       (uid, login_id, password_hash, role, display_name, teacher_id, password_hint, storage_limit_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uid,
      loginId,
      bcrypt.hashSync(password, 12),
      role,
      displayName,
      teacherId,
      passwordHint,
      storageLimitBytes,
      now()
    );
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'id-already-exists' });
    }
    throw error;
  }
  res.status(201).json({ user: toPublicUser(db.prepare('SELECT * FROM users WHERE uid = ?').get(uid)) });
});

app.patch('/api/users/:uid', requireUser, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  if (!target) return res.status(404).json({ error: 'not-found' });
  const canEdit =
    req.user.role === 'admin' ||
    req.user.uid === target.uid ||
    (req.user.role === 'teacher' && target.teacher_id === req.user.uid);
  if (!canEdit) return res.status(403).json({ error: 'forbidden' });

  const displayName = String(req.body.displayName || target.display_name).trim();
  const canHostHtml =
    req.user.role === 'admin' && target.role === 'teacher' && req.body.canHostHtml != null
      ? req.body.canHostHtml
        ? 1
        : 0
      : target.can_host_html || 0;
  const canEditStorageLimit = req.user.role === 'admin' && target.role === 'teacher';
  const storageLimitBytes =
    canEditStorageLimit && req.body.storageLimitBytes !== undefined
      ? normalizeStorageLimit(req.body.storageLimitBytes, target.storage_limit_bytes)
      : target.storage_limit_bytes;
  if (storageLimitBytes != null && storageLimitBytes < (target.storage_used_bytes || 0)) {
    return res.status(400).json({ error: 'storage-limit-below-used' });
  }
  db.prepare(
    'UPDATE users SET display_name = ?, can_host_html = ?, storage_limit_bytes = ?, updated_at = ? WHERE uid = ?'
  ).run(displayName, canHostHtml, storageLimitBytes, now(), target.uid);
  res.json({ user: toPublicUser(db.prepare('SELECT * FROM users WHERE uid = ?').get(target.uid)) });
});

app.delete('/api/users/:uid', requireUser, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  if (!target) return res.status(404).json({ error: 'not-found' });
  const canDelete =
    req.user.role === 'admin' ||
    (req.user.role === 'teacher' && target.role === 'student' && target.teacher_id === req.user.uid);
  if (!canDelete) return res.status(403).json({ error: 'forbidden' });
  const ownedImages = db.prepare('SELECT * FROM post_images WHERE owner_id = ?').all(target.uid);
  const wallPostIds =
    target.role === 'teacher'
      ? db
          .prepare(
            `SELECT posts.id
             FROM posts
             JOIN walls ON walls.id = posts.wall_id
             WHERE walls.owner_id = ?`
          )
          .all(target.uid)
          .map((post) => post.id)
      : [];
  const wallImages = imagesForPostIds(wallPostIds);
  const images = uniqueImages([...ownedImages, ...wallImages]);
  db.transaction(() => {
    decrementStorageForImages(images);
    if (ownedImages.length) db.prepare('DELETE FROM post_images WHERE owner_id = ?').run(target.uid);
    db.prepare('DELETE FROM users WHERE uid = ?').run(target.uid);
  })();
  removeImageFiles(images);
  res.json({ count: 1, deleted: [{ uid: target.uid }] });
});

app.post('/api/users/passwords', requireUser, requireTeacherOrAdmin, (req, res) => {
  const uids = Array.isArray(req.body.uids) ? req.body.uids : [];
  const password = String(req.body.password || '');
  assertPassword(password);
  const hash = bcrypt.hashSync(password, 12);
  const update = db.prepare(
    'UPDATE users SET password_hash = ?, password_hint = ?, updated_at = ? WHERE uid = ?'
  );
  const change = db.transaction(() => {
    for (const uid of uids) {
      const target = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid);
      if (!target) continue;
      if (req.user.role === 'teacher' && target.teacher_id !== req.user.uid) continue;
      update.run(hash, password, now(), uid);
    }
  });
  change();
  res.json({ count: uids.length });
});

app.get('/api/wall-folders', requireUser, requireRole('teacher'), (req, res) => {
  const ownerId = req.query.ownerId || req.user.uid;
  if (ownerId !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  const rows = db
    .prepare('SELECT * FROM wall_folders WHERE owner_id = ? ORDER BY name ASC')
    .all(ownerId);
  res.json({ items: rows.map(toWallFolder) });
});

app.post('/api/wall-folders', requireUser, requireRole('teacher'), (req, res) => {
  const name = normalizeFolderName(req.body.name);
  const color = normalizeFolderColor(req.body.color);
  if (!name) return res.status(400).json({ error: 'folder-name-required' });
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM wall_folders WHERE owner_id = ?')
    .get(req.user.uid).count;
  if (count >= 20) return res.status(400).json({ error: 'folder-limit-reached' });

  const folderId = id('folder_');
  try {
    db.prepare(
      `INSERT INTO wall_folders (id, owner_id, name, color, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(folderId, req.user.uid, name, color, now());
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'folder-name-exists' });
    }
    throw error;
  }
  res.status(201).json({
    folder: toWallFolder(db.prepare('SELECT * FROM wall_folders WHERE id = ?').get(folderId))
  });
});

app.patch('/api/wall-folders/:id', requireUser, requireRole('teacher'), (req, res) => {
  const folder = db.prepare('SELECT * FROM wall_folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'not-found' });
  if (folder.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  const name = normalizeFolderName(req.body.name);
  const color =
    req.body.color === undefined ? folder.color || null : normalizeFolderColor(req.body.color);
  if (!name) return res.status(400).json({ error: 'folder-name-required' });
  try {
    db.prepare('UPDATE wall_folders SET name = ?, color = ?, updated_at = ? WHERE id = ?').run(
      name,
      color,
      now(),
      folder.id
    );
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'folder-name-exists' });
    }
    throw error;
  }
  res.json({ folder: toWallFolder(db.prepare('SELECT * FROM wall_folders WHERE id = ?').get(folder.id)) });
});

app.delete('/api/wall-folders/:id', requireUser, requireRole('teacher'), (req, res) => {
  const folder = db.prepare('SELECT * FROM wall_folders WHERE id = ?').get(req.params.id);
  if (!folder) return res.status(404).json({ error: 'not-found' });
  if (folder.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  db.transaction(() => {
    db.prepare('UPDATE walls SET folder_id = NULL, updated_at = ? WHERE folder_id = ?').run(
      now(),
      folder.id
    );
    db.prepare('DELETE FROM wall_folders WHERE id = ?').run(folder.id);
  })();
  res.json({ ok: true });
});

app.get('/api/walls', requireUser, (req, res) => {
  const { ownerId } = req.query;
  const rows = ownerId
    ? db.prepare('SELECT * FROM walls WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId)
    : db.prepare('SELECT * FROM walls ORDER BY created_at DESC').all();
  res.json({ items: rows.map(toWall) });
});

app.post('/api/walls', requireUser, requireRole('teacher'), (req, res) => {
  const wallId = id('wall_');
  const postMode = req.body.postMode === 'worksheet' ? 'worksheet' : 'free';
  const postTemplate = postMode === 'worksheet' ? normalizePostTemplate(req.body.postTemplate) : { fields: [] };
  const folderId = req.body.folderId || null;
  if (!canUseFolder(folderId, req.user.uid)) {
    return res.status(400).json({ error: 'invalid-folder' });
  }
  db.prepare(
    `INSERT INTO walls
     (id, title, description, access_mode, comments_enabled, likes_enabled, owner_id, owner_name,
      show_author_names, visible_to_students, public_view_enabled, folder_id, post_mode, post_template, background_tone,
      image_uploads_enabled, column_mode_enabled, column_count, column_names, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    wallId,
    String(req.body.title || '').trim(),
    String(req.body.description || ''),
    req.body.accessMode === 'public' ? 'public' : 'login',
    req.body.commentsEnabled === false ? 0 : 1,
    req.body.likesEnabled === false ? 0 : 1,
    req.user.uid,
    String(req.body.ownerName || req.user.display_name || req.user.login_id),
    req.body.showAuthorNames === false ? 0 : 1,
    req.body.visibleToStudents === false ? 0 : 1,
    req.body.publicViewEnabled === true ? 1 : 0,
    folderId,
    postMode,
    JSON.stringify(postTemplate),
    req.body.backgroundTone || 'bg-[#fff8e8]',
    req.body.imageUploadsEnabled === false ? 0 : 1,
    req.body.columnModeEnabled === true ? 1 : 0,
    Number(req.body.columnCount || 4),
    JSON.stringify(req.body.columnNames || {}),
    now()
  );
  res.status(201).json({ wall: toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(wallId)) });
});

app.get('/api/walls/:id', (req, res) => {
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(req.params.id));
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (req.query.view === 'readonly' && !wall.publicViewEnabled) {
    return res.status(403).json({ error: 'public-view-disabled' });
  }
  if (wall.accessMode === 'login' && !userFrom(req) && req.query.view !== 'readonly') {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  res.json({ wall });
});

app.patch('/api/walls/:id', requireUser, requireRole('teacher'), (req, res) => {
  const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(req.params.id);
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (wall.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  const nextPostMode = req.body.postMode == null ? null : req.body.postMode === 'worksheet' ? 'worksheet' : 'free';
  const nextFolderId = req.body.folderId === undefined ? undefined : req.body.folderId || null;
  if (nextFolderId !== undefined && !canUseFolder(nextFolderId, req.user.uid)) {
    return res.status(400).json({ error: 'invalid-folder' });
  }
  const nextPostTemplate =
    req.body.postTemplate == null
      ? null
      : JSON.stringify(nextPostMode === 'free' ? { fields: [] } : normalizePostTemplate(req.body.postTemplate));
  db.prepare(
    `UPDATE walls SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      access_mode = COALESCE(?, access_mode),
      comments_enabled = COALESCE(?, comments_enabled),
      likes_enabled = COALESCE(?, likes_enabled),
      show_author_names = COALESCE(?, show_author_names),
      visible_to_students = COALESCE(?, visible_to_students),
      public_view_enabled = COALESCE(?, public_view_enabled),
      folder_id = ?,
      post_mode = COALESCE(?, post_mode),
      post_template = COALESCE(?, post_template),
      image_uploads_enabled = COALESCE(?, image_uploads_enabled),
      background_tone = COALESCE(?, background_tone),
      column_mode_enabled = COALESCE(?, column_mode_enabled),
      column_count = COALESCE(?, column_count),
      column_names = COALESCE(?, column_names),
      updated_at = ?
     WHERE id = ?`
  ).run(
    req.body.title == null ? null : String(req.body.title),
    req.body.description == null ? null : String(req.body.description),
    req.body.accessMode == null ? null : req.body.accessMode === 'public' ? 'public' : 'login',
    req.body.commentsEnabled == null ? null : req.body.commentsEnabled ? 1 : 0,
    req.body.likesEnabled == null ? null : req.body.likesEnabled ? 1 : 0,
    req.body.showAuthorNames == null ? null : req.body.showAuthorNames ? 1 : 0,
    req.body.visibleToStudents == null ? null : req.body.visibleToStudents ? 1 : 0,
    req.body.publicViewEnabled == null ? null : req.body.publicViewEnabled ? 1 : 0,
    nextFolderId === undefined ? wall.folder_id : nextFolderId,
    nextPostMode,
    nextPostTemplate,
    req.body.imageUploadsEnabled == null ? null : req.body.imageUploadsEnabled ? 1 : 0,
    req.body.backgroundTone == null ? null : req.body.backgroundTone,
    req.body.columnModeEnabled == null ? null : req.body.columnModeEnabled ? 1 : 0,
    req.body.columnCount == null ? null : Number(req.body.columnCount),
    req.body.columnNames == null ? null : JSON.stringify(req.body.columnNames),
    now(),
    wall.id
  );
  res.json({ wall: toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(wall.id)) });
});

app.get('/api/walls/:id/export.csv', requireUser, requireRole('teacher'), (req, res) => {
  const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(req.params.id);
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (wall.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });

  const wallData = toWall(wall);
  const commentsByPost = new Map();
  const comments = db
    .prepare(
      `SELECT comments.*
       FROM comments
       JOIN posts ON posts.id = comments.post_id
       WHERE posts.wall_id = ?
       ORDER BY comments.created_at ASC`
    )
    .all(wall.id)
    .map(toComment);
  for (const comment of comments) {
    const list = commentsByPost.get(comment.postId) || [];
    list.push(comment);
    commentsByPost.set(comment.postId, list);
  }

  const posts = db
    .prepare('SELECT * FROM posts WHERE wall_id = ? ORDER BY column_no ASC, order_no ASC, created_at ASC')
    .all(wall.id)
    .map(toPost);
  const templateFields = wallData.postMode === 'worksheet' ? wallData.postTemplate?.fields || [] : [];
  const rows = [
    [
      '담벼락 제목',
      '담벼락 설명',
      '컬럼 번호',
      '컬럼 이름',
      '순서',
      '작성자',
      ...(templateFields.length ? templateFields.map((field) => field.label) : ['내용']),
      '좋아요 수',
      '댓글',
      '작성일',
      '수정일'
    ],
    ...posts.map((post) => {
      const postComments = commentsByPost.get(post.id) || [];
      return [
        wallData.title,
        wallData.description,
        post.column,
        wallData.columnNames?.[post.column] || `${post.column}번 컬럼`,
        post.order,
        post.authorName || '익명',
        ...(templateFields.length
          ? templateFields.map((field) => post.templateAnswers?.[field.id] || '')
          : [post.content]),
        post.likeCount || 0,
        postComments
          .map((comment) => `${comment.authorName || '익명'}: ${comment.text} (${comment.createdAt})`)
          .join('\n'),
        post.createdAt,
        post.updatedAt || ''
      ];
    })
  ];
  const csv = `\uFEFF${rows.map(csvRow).join('\n')}\n`;
  const filename = encodeURIComponent(`${wallData.title || wall.id}-posts.csv`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  return res.send(csv);
});

app.get('/api/walls/:id/export.html', requireUser, requireRole('teacher'), (req, res) => {
  const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(req.params.id);
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (wall.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });

  const wallData = toWall(wall);
  const commentsByPost = new Map();
  const comments = db
    .prepare(
      `SELECT comments.*
       FROM comments
       JOIN posts ON posts.id = comments.post_id
       WHERE posts.wall_id = ?
       ORDER BY comments.created_at ASC`
    )
    .all(wall.id)
    .map(toComment);
  for (const comment of comments) {
    const list = commentsByPost.get(comment.postId) || [];
    list.push(comment);
    commentsByPost.set(comment.postId, list);
  }

  const posts = db
    .prepare('SELECT * FROM posts WHERE wall_id = ? ORDER BY column_no ASC, order_no ASC, created_at ASC')
    .all(wall.id)
    .map((row) => {
      const post = toPost(row);
      const images = db
        .prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY created_at ASC')
        .all(post.id)
        .map((image) => ({
          ...toPostImage(image),
          dataUrl: imageDataUrl(image)
        }))
        .filter((image) => image.dataUrl);
      return { ...post, images };
    });

  const includeAuthorNames = req.query.includeAuthorNames !== 'false';
  const html = renderWallExportHtml(wallData, posts, commentsByPost, { includeAuthorNames });
  const filename = encodeURIComponent(`${safeFilename(wallData.title || wall.id)}-wall.html`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  return res.send(html);
});

app.delete('/api/walls/:id', requireUser, requireRole('teacher'), (req, res) => {
  const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(req.params.id);
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (wall.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  const postIds = db.prepare('SELECT id FROM posts WHERE wall_id = ?').all(wall.id).map((post) => post.id);
  const images = imagesForPostIds(postIds);
  db.transaction(() => {
    decrementStorageForImages(images);
    db.prepare('DELETE FROM walls WHERE id = ?').run(wall.id);
  })();
  removeImageFiles(images);
  res.json({ ok: true });
});

app.get('/api/posts', (req, res) => {
  const { wallId } = req.query;
  if (!wallId) return res.status(400).json({ error: 'wallId-required' });
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(wallId));
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (req.query.view === 'readonly' && !wall.publicViewEnabled) {
    return res.status(403).json({ error: 'public-view-disabled' });
  }
  if (wall.accessMode === 'login' && !userFrom(req) && req.query.view !== 'readonly') {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  res.json({ items: postsForWall(wallId) });
});

app.post('/api/posts', uploadPostImages.any(), (req, res) => {
  const body = parsePostBody(req);
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(body.wallId));
  if (!wall) return res.status(404).json({ error: 'not-found' });
  const user = userFrom(req);
  if (wall.accessMode === 'login' && !user) return res.status(401).json({ error: 'unauthenticated' });
  const imageFiles = normalizePostImageFiles(req.files, user);
  if (wall.postMode === 'free' && imageFiles.length && !wall.imageUploadsEnabled) {
    return res.status(403).json({ error: 'image-uploads-disabled' });
  }
  if (wall.postMode === 'worksheet') {
    validateWorksheetImages(wall.postTemplate, imageFiles);
  } else if (imageFiles.some((image) => image.fieldId)) {
    return res.status(400).json({ error: 'invalid-image-field' });
  }
  const storageOwner = imageFiles.length ? storageOwnerForWall(wall) : null;
  if (storageOwner) assertStorageAvailable(storageOwner, imageFiles);
  const postId = id('post_');
  const rawTemplateAnswers =
    wall.postMode === 'worksheet'
      ? {
          ...(body.templateAnswers || {}),
          ...Object.fromEntries(imageFiles.map((image) => [image.fieldId, '[사진]']).filter(([fieldId]) => fieldId))
        }
      : body.templateAnswers;
  const templateAnswers =
    wall.postMode === 'worksheet'
      ? normalizeTemplateAnswers(wall.postTemplate, rawTemplateAnswers)
      : {};
  const content =
    wall.postMode === 'worksheet'
      ? worksheetContent(wall.postTemplate, templateAnswers)
      : String(body.content || '').trim();
  if (!content && !imageFiles.length) return res.status(400).json({ error: 'content-required' });
  db.transaction(() => {
    db.prepare(
      `INSERT INTO posts
       (id, wall_id, author_id, author_name, content, template_answers, color, column_no, order_no, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      postId,
      wall.id,
      user?.uid || 'anonymous',
      String(body.authorName || user?.display_name || '익명'),
      content,
      JSON.stringify(templateAnswers),
      body.color || 'bg-yellow-100',
      Number(body.column || 1),
      Number(body.order ?? Date.now()),
      now()
    );
  })();
  if (imageFiles.length) savePostImages(postId, storageOwner.uid, imageFiles);
  res.status(201).json({ post: postWithImages(db.prepare('SELECT * FROM posts WHERE id = ?').get(postId)) });
});

app.patch('/api/posts/:id', requireUser, uploadPostImages.any(), (req, res) => {
  const body = parsePostBody(req);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'not-found' });
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(post.wall_id));
  const canEdit = post.author_id === req.user.uid || wall?.ownerId === req.user.uid;
  if (!canEdit) return res.status(403).json({ error: 'forbidden' });
  const imageFiles = normalizePostImageFiles(req.files, req.user);
  if (wall.postMode === 'free' && imageFiles.length && !wall.imageUploadsEnabled) {
    return res.status(403).json({ error: 'image-uploads-disabled' });
  }
  if (wall.postMode === 'worksheet') {
    const imageFields = (wall.postTemplate?.fields || []).filter((field) => field.type === 'image');
    const allowedFieldIds = new Set(imageFields.map((field) => field.id));
    if (imageFiles.some((image) => !image.fieldId || !allowedFieldIds.has(image.fieldId))) {
      return res.status(400).json({ error: 'invalid-worksheet-image-field' });
    }
  } else if (imageFiles.some((image) => image.fieldId)) {
    return res.status(400).json({ error: 'invalid-image-field' });
  }

  const deleteImageIds = Array.isArray(body.deleteImageIds)
    ? body.deleteImageIds.map((value) => String(value)).filter(Boolean)
    : [];
  const replaceFieldIds = wall.postMode === 'worksheet'
    ? [...new Set(imageFiles.map((image) => image.fieldId).filter(Boolean))]
    : [];
  const imagesToDelete = [];
  if (deleteImageIds.length) {
    const placeholders = deleteImageIds.map(() => '?').join(',');
    imagesToDelete.push(
      ...db
        .prepare(`SELECT * FROM post_images WHERE post_id = ? AND id IN (${placeholders})`)
        .all(post.id, ...deleteImageIds)
    );
  }
  imagesToDelete.push(...imagesForPostFieldIds(post.id, replaceFieldIds));
  const storageOwner = imageFiles.length ? storageOwnerForWall(wall) : null;
  if (storageOwner) assertStorageAvailable(storageOwner, imageFiles);

  const rawTemplateAnswers =
    body.templateAnswers == null
      ? null
      : {
          ...(body.templateAnswers || {}),
          ...Object.fromEntries(imageFiles.map((image) => [image.fieldId, '[사진]']).filter(([fieldId]) => fieldId))
        };
  const templateAnswers =
    rawTemplateAnswers == null
      ? null
      : normalizeTemplateAnswers(wall.postTemplate || { fields: [] }, rawTemplateAnswers);
  const content =
    templateAnswers == null
      ? body.content == null
        ? null
        : String(body.content)
      : worksheetContent(wall.postTemplate || { fields: [] }, templateAnswers);
  db.prepare(
    `UPDATE posts SET
      content = COALESCE(?, content),
      template_answers = COALESCE(?, template_answers),
      color = COALESCE(?, color),
      column_no = COALESCE(?, column_no),
      order_no = COALESCE(?, order_no),
      updated_at = ?
     WHERE id = ?`
  ).run(
    content,
    templateAnswers == null ? null : JSON.stringify(templateAnswers),
    body.color == null ? null : body.color,
    body.column == null ? null : Number(body.column),
    body.order == null ? null : Number(body.order),
    now(),
    post.id
  );
  deleteImageRows(imagesToDelete);
  if (imageFiles.length) savePostImages(post.id, storageOwner.uid, imageFiles);
  res.json({ post: postWithImages(db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id)) });
});

app.delete('/api/posts/:id', requireUser, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'not-found' });
  const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(post.wall_id);
  const canDelete = post.author_id === req.user.uid || wall?.owner_id === req.user.uid;
  if (!canDelete) return res.status(403).json({ error: 'forbidden' });
  deletePostsWithImages('WHERE id = ?', [post.id]);
  res.json({ ok: true });
});

app.post('/api/posts/:id/toggle-like', requireUser, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'not-found' });
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(post.wall_id));
  if (!wall?.likesEnabled) return res.status(403).json({ error: 'likes-disabled' });
  const likedBy = post.liked_by ? JSON.parse(post.liked_by) : {};
  const liked = Boolean(likedBy[req.user.uid]);
  if (liked) delete likedBy[req.user.uid];
  else likedBy[req.user.uid] = true;
  db.prepare('UPDATE posts SET liked_by = ?, like_count = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(likedBy),
    Object.keys(likedBy).length,
    now(),
    post.id
  );
  res.json({ liked: !liked });
});

app.post('/api/posts/layouts', requireUser, requireRole('teacher'), (req, res) => {
  const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
  const postIds = updates.map((item) => item.id).filter(Boolean);
  if (postIds.length) {
    const placeholders = postIds.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT posts.id, walls.owner_id
         FROM posts
         JOIN walls ON walls.id = posts.wall_id
         WHERE posts.id IN (${placeholders})`
      )
      .all(...postIds);
    if (rows.length !== postIds.length || rows.some((row) => row.owner_id !== req.user.uid)) {
      return res.status(403).json({ error: 'forbidden' });
    }
  }
  const update = db.prepare('UPDATE posts SET column_no = ?, order_no = ?, updated_at = ? WHERE id = ?');
  db.transaction(() => {
    for (const item of updates) update.run(Number(item.column), Number(item.order), now(), item.id);
  })();
  res.json({ count: updates.length });
});

app.post('/api/walls/:id/delete-column', requireUser, requireRole('teacher'), (req, res) => {
  const wall = db.prepare('SELECT * FROM walls WHERE id = ?').get(req.params.id);
  if (!wall) return res.status(404).json({ error: 'not-found' });
  if (wall.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });

  const column = Number(req.body.column);
  const columnCount = Number(req.body.columnCount);
  const columnNames = req.body.columnNames || {};
  const nextColumnNames = {};
  for (let nextColumn = 1; nextColumn < columnCount; nextColumn += 1) {
    const name = nextColumn < column ? columnNames[nextColumn] : columnNames[nextColumn + 1];
    if (typeof name === 'string' && name.trim()) nextColumnNames[nextColumn] = name.trim();
  }

  db.transaction(() => {
    const deletedPosts = db.prepare('SELECT id FROM posts WHERE wall_id = ? AND column_no = ?').all(wall.id, column);
    const deletedPostIds = deletedPosts.map((post) => post.id);
    const deletedImages = imagesForPostIds(deletedPostIds);
    for (const post of deletedPosts) {
      db.prepare('DELETE FROM comments WHERE post_id = ?').run(post.id);
    }
    decrementStorageForImages(deletedImages);
    db.prepare('DELETE FROM posts WHERE wall_id = ? AND column_no = ?').run(wall.id, column);
    db.prepare(
      'UPDATE posts SET column_no = column_no - 1, updated_at = ? WHERE wall_id = ? AND column_no > ?'
    ).run(now(), wall.id, column);
    db.prepare('UPDATE walls SET column_count = ?, column_names = ?, updated_at = ? WHERE id = ?').run(
      columnCount - 1,
      JSON.stringify(nextColumnNames),
      now(),
      wall.id
    );
    removeImageFiles(deletedImages);
  })();
  res.json({ ok: true });
});

app.get('/api/comments', (req, res) => {
  const { postId } = req.query;
  if (!postId) return res.status(400).json({ error: 'postId-required' });
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'not-found' });
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(post.wall_id));
  if (req.query.view === 'readonly' && !wall?.publicViewEnabled) {
    return res.status(403).json({ error: 'public-view-disabled' });
  }
  if (wall?.accessMode === 'login' && !userFrom(req) && req.query.view !== 'readonly') {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  const rows = db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').all(postId);
  res.json({ items: rows.map(toComment) });
});

app.post('/api/comments', (req, res) => {
  const user = userFrom(req);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.body.postId);
  if (!post) return res.status(404).json({ error: 'not-found' });
  const wall = toWall(db.prepare('SELECT * FROM walls WHERE id = ?').get(post.wall_id));
  if (wall?.accessMode === 'login' && !user) return res.status(401).json({ error: 'unauthenticated' });
  if (!wall?.commentsEnabled) return res.status(403).json({ error: 'comments-disabled' });
  const commentId = id('comment_');
  db.prepare(
    'INSERT INTO comments (id, post_id, author_id, author_name, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    commentId,
    req.body.postId,
    user?.uid || 'anonymous',
    String(req.body.authorName || user?.login_id || '익명'),
    String(req.body.text || '').trim(),
    now()
  );
  res.status(201).json({ comment: toComment(db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)) });
});

app.delete('/api/comments/:id', requireUser, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'not-found' });
  if (comment.author_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id);
  res.json({ ok: true });
});

app.get('/api/html-sites', requireUser, requireHtmlHosting, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM html_sites WHERE owner_id = ? ORDER BY created_at DESC')
    .all(req.user.uid);
  res.json({ items: rows.map(toHtmlSite) });
});

app.post('/api/html-sites', requireUser, requireHtmlHosting, (req, res) => {
  const siteId = id('html_');
  const slug = makeSiteSlug();
  const title = normalizeHtmlTitle(req.body.title);
  const html = normalizeHtml(req.body.html);

  db.prepare(
    `INSERT INTO html_sites (id, slug, title, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(siteId, slug, title, req.user.uid, now());

  try {
    writeHtmlSiteFile(siteId, html);
  } catch (error) {
    db.prepare('DELETE FROM html_sites WHERE id = ?').run(siteId);
    throw error;
  }

  res.status(201).json({
    site: toHtmlSite(db.prepare('SELECT * FROM html_sites WHERE id = ?').get(siteId))
  });
});

app.delete('/api/html-sites/:id', requireUser, requireHtmlHosting, (req, res) => {
  const site = db.prepare('SELECT * FROM html_sites WHERE id = ?').get(req.params.id);
  if (!site) return res.status(404).json({ error: 'not-found' });
  if (site.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM html_sites WHERE id = ?').run(site.id);
  removeHtmlSiteFiles(site.id);
  res.json({ ok: true });
});

app.get('/h/:slug', (req, res) => {
  const site = db.prepare('SELECT * FROM html_sites WHERE slug = ?').get(req.params.slug);
  if (!site) return res.status(404).send('HTML site not found.');
  const filePath = htmlSiteFile(site.id);
  if (!fs.existsSync(filePath)) return res.status(404).send('HTML file not found.');
  res.setHeader(
    'Content-Security-Policy',
    [
      'sandbox allow-scripts allow-forms allow-popups allow-modals',
      "default-src * data: blob:",
      "img-src * data: blob:",
      "style-src * 'unsafe-inline'",
      "script-src * 'unsafe-inline' 'unsafe-eval'",
      'connect-src *',
      "frame-ancestors 'none'"
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

app.use(express.static(CLIENT_DIR));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexPath = path.join(CLIENT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(404).send('Run npm run build before production start.');
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'image-too-large' });
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'too-many-images' });
    }
    return res.status(400).json({ error: 'invalid-upload' });
  }
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'server-error' });
});

function listen(port) {
  const server = http.createServer(app);
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < DEFAULT_PORT + 50) {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, HOST, () => {
    console.log(`Dambrock running at http://localhost:${port}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });
}

listen(DEFAULT_PORT);
