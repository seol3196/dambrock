import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, 'dambrock.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function now() {
  return new Date().toISOString();
}

export function id(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`;
}

function json(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function toPublicUser(row) {
  if (!row) return null;
  return {
    uid: row.uid,
    id: row.login_id,
    role: row.role,
    displayName: row.display_name,
    teacherId: row.teacher_id,
    passwordHint: row.password_hint,
    canHostHtml: Boolean(row.can_host_html),
    storageLimitBytes: row.storage_limit_bytes,
    storageUsedBytes: row.storage_used_bytes || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toHtmlSite(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    ownerId: row.owner_id,
    urlPath: `/h/${row.slug}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toWall(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    accessMode: row.access_mode,
    commentsEnabled: Boolean(row.comments_enabled),
    likesEnabled: Boolean(row.likes_enabled),
    showAuthorNames: row.show_author_names == null ? true : Boolean(row.show_author_names),
    visibleToStudents: row.visible_to_students == null ? true : Boolean(row.visible_to_students),
    publicViewEnabled: row.public_view_enabled == null ? false : Boolean(row.public_view_enabled),
    folderId: row.folder_id || null,
    postMode: row.post_mode || 'free',
    postTemplate: json(row.post_template, { fields: [] }),
    imageUploadsEnabled: row.image_uploads_enabled == null ? true : Boolean(row.image_uploads_enabled),
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    backgroundTone: row.background_tone,
    columnModeEnabled: row.column_mode_enabled == null ? false : Boolean(row.column_mode_enabled),
    columnCount: row.column_count,
    columnNames: json(row.column_names, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toWallFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toPost(row) {
  if (!row) return null;
  const likedBy = json(row.liked_by, {});
  return {
    id: row.id,
    wallId: row.wall_id,
    authorId: row.author_id,
    authorName: row.author_name,
    content: row.content,
    templateAnswers: json(row.template_answers, {}),
    color: row.color,
    column: row.column_no,
    order: row.order_no,
    images: Array.isArray(row.images) ? row.images : json(row.images, []),
    likedBy,
    likeCount: row.like_count ?? Object.keys(likedBy).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    authorName: row.author_name,
    text: row.text,
    createdAt: row.created_at
  };
}

export function toPostImage(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    ownerId: row.owner_id,
    fieldId: row.field_id || null,
    url: `/uploads/post-images/${row.stored_name}`,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at
  };
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      login_id TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
      display_name TEXT NOT NULL,
      teacher_id TEXT,
      password_hint TEXT,
      can_host_html INTEGER NOT NULL DEFAULT 0,
      storage_limit_bytes INTEGER NOT NULL DEFAULT 10737418240,
      storage_used_bytes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walls (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      access_mode TEXT NOT NULL DEFAULT 'login',
      comments_enabled INTEGER NOT NULL DEFAULT 1,
      likes_enabled INTEGER NOT NULL DEFAULT 1,
      show_author_names INTEGER NOT NULL DEFAULT 1,
      visible_to_students INTEGER NOT NULL DEFAULT 1,
      public_view_enabled INTEGER NOT NULL DEFAULT 0,
      folder_id TEXT,
      post_mode TEXT NOT NULL DEFAULT 'free',
      post_template TEXT NOT NULL DEFAULT '{"fields":[]}',
      image_uploads_enabled INTEGER NOT NULL DEFAULT 1,
      owner_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      background_tone TEXT NOT NULL,
      column_mode_enabled INTEGER NOT NULL DEFAULT 0,
      column_count INTEGER NOT NULL DEFAULT 4,
      column_names TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS wall_folders (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE(owner_id, name)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      wall_id TEXT NOT NULL REFERENCES walls(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      template_answers TEXT NOT NULL DEFAULT '{}',
      color TEXT NOT NULL,
      column_no INTEGER NOT NULL DEFAULT 1,
      order_no REAL NOT NULL,
      liked_by TEXT NOT NULL DEFAULT '{}',
      like_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_images (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      field_id TEXT,
      stored_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS html_sites (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_walls_owner ON walls(owner_id);
    CREATE INDEX IF NOT EXISTS idx_wall_folders_owner ON wall_folders(owner_id);
    CREATE INDEX IF NOT EXISTS idx_posts_wall ON posts(wall_id);
    CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_images_owner ON post_images(owner_id);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_html_sites_owner ON html_sites(owner_id);
  `);

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some((column) => column.name === 'can_host_html')) {
    db.prepare('ALTER TABLE users ADD COLUMN can_host_html INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!userColumns.some((column) => column.name === 'storage_limit_bytes')) {
    db.prepare('ALTER TABLE users ADD COLUMN storage_limit_bytes INTEGER NOT NULL DEFAULT 10737418240').run();
  }
  if (!userColumns.some((column) => column.name === 'storage_used_bytes')) {
    db.prepare('ALTER TABLE users ADD COLUMN storage_used_bytes INTEGER NOT NULL DEFAULT 0').run();
  }

  const wallColumns = db.prepare('PRAGMA table_info(walls)').all();
  if (!wallColumns.some((column) => column.name === 'show_author_names')) {
    db.prepare('ALTER TABLE walls ADD COLUMN show_author_names INTEGER NOT NULL DEFAULT 1').run();
  }
  if (!wallColumns.some((column) => column.name === 'post_mode')) {
    db.prepare("ALTER TABLE walls ADD COLUMN post_mode TEXT NOT NULL DEFAULT 'free'").run();
  }
  if (!wallColumns.some((column) => column.name === 'post_template')) {
    db.prepare('ALTER TABLE walls ADD COLUMN post_template TEXT NOT NULL DEFAULT \'{"fields":[]}\'').run();
  }
  if (!wallColumns.some((column) => column.name === 'visible_to_students')) {
    db.prepare('ALTER TABLE walls ADD COLUMN visible_to_students INTEGER NOT NULL DEFAULT 1').run();
  }
  if (!wallColumns.some((column) => column.name === 'column_mode_enabled')) {
    db.prepare('ALTER TABLE walls ADD COLUMN column_mode_enabled INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!wallColumns.some((column) => column.name === 'public_view_enabled')) {
    db.prepare('ALTER TABLE walls ADD COLUMN public_view_enabled INTEGER NOT NULL DEFAULT 0').run();
  }
  if (!wallColumns.some((column) => column.name === 'folder_id')) {
    db.prepare('ALTER TABLE walls ADD COLUMN folder_id TEXT').run();
  }
  if (!wallColumns.some((column) => column.name === 'image_uploads_enabled')) {
    db.prepare('ALTER TABLE walls ADD COLUMN image_uploads_enabled INTEGER NOT NULL DEFAULT 1').run();
  }
  db.prepare('CREATE INDEX IF NOT EXISTS idx_walls_folder ON walls(folder_id)').run();

  const postColumns = db.prepare('PRAGMA table_info(posts)').all();
  if (!postColumns.some((column) => column.name === 'template_answers')) {
    db.prepare("ALTER TABLE posts ADD COLUMN template_answers TEXT NOT NULL DEFAULT '{}'").run();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS post_images (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL,
      field_id TEXT,
      stored_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const postImageColumns = db.prepare('PRAGMA table_info(post_images)').all();
  if (!postImageColumns.some((column) => column.name === 'field_id')) {
    db.prepare('ALTER TABLE post_images ADD COLUMN field_id TEXT').run();
  }
  db.prepare('CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_post_images_owner ON post_images(owner_id)').run();

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const loginId = process.env.ADMIN_ID || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    db.prepare(
      `INSERT INTO users
       (uid, login_id, password_hash, role, display_name, created_at)
       VALUES (?, ?, ?, 'admin', '관리자', ?)`
    ).run(id('usr_'), loginId, bcrypt.hashSync(password, 12), now());
    console.log(`Created initial admin account: ${loginId} / ${password}`);
  }
}

export { DB_PATH };
