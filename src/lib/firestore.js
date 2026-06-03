import { apiFetch, getToken, subscribe } from './api';

export const colorOptions = [
  { name: '노랑', value: 'bg-yellow-100', swatch: '#fef3c7' },
  { name: '분홍', value: 'bg-rose-100', swatch: '#ffe4e6' },
  { name: '하늘', value: 'bg-sky-100', swatch: '#e0f2fe' },
  { name: '연두', value: 'bg-lime-100', swatch: '#ecfccb' },
  { name: '주황', value: 'bg-orange-100', swatch: '#ffedd5' }
];

export const wallBackgroundOptions = [
  { name: '크림', value: 'bg-[#fff8e8]', swatch: '#e6d3ad' },
  { name: '민트', value: 'bg-[#edf7f2]', swatch: '#b8c9a3' },
  { name: '하늘', value: 'bg-[#eef6ff]', swatch: '#a6bdd6' },
  { name: '라일락', value: 'bg-[#f5efff]', swatch: '#b7a4cb' },
  { name: '피치', value: 'bg-[#fff0ea]', swatch: '#d8a684' },
  { name: '모래', value: 'bg-[#f3ead8]', swatch: '#c89c67' }
];

export function subscribeUsers(params, onValue) {
  return subscribe('/api/users', params, onValue);
}

export function subscribeWalls(params, onValue) {
  return subscribe('/api/walls', params, onValue);
}

export function subscribeWallFolders(params, onValue) {
  return subscribe('/api/wall-folders', params, onValue);
}

export function subscribeHtmlSites(onValue, onError) {
  return subscribe('/api/html-sites', {}, onValue, { onError });
}

export function subscribeWall(wallId, onValue, onError, params = {}) {
  return subscribe(
    `/api/walls/${wallId}`,
    params,
    onValue,
    {
      map: (data) => data.wall,
      onError
    }
  );
}

export function subscribePosts(wallId, onValue, onError, params = {}) {
  return subscribe('/api/posts', { wallId, ...params }, onValue, { onError });
}

export function subscribeComments(postId, onValue, params = {}) {
  return subscribe('/api/comments', { postId, ...params }, onValue);
}

export function createWall(data) {
  return apiFetch('/api/walls', { method: 'POST', body: data });
}

export function updateWall(wallId, data) {
  return apiFetch(`/api/walls/${wallId}`, { method: 'PATCH', body: data });
}

export function deleteWall(wallId) {
  return apiFetch(`/api/walls/${wallId}`, { method: 'DELETE' });
}

export function createWallFolder(data) {
  return apiFetch('/api/wall-folders', { method: 'POST', body: data });
}

export function updateWallFolder(folderId, data) {
  return apiFetch(`/api/wall-folders/${folderId}`, { method: 'PATCH', body: data });
}

export function deleteWallFolder(folderId) {
  return apiFetch(`/api/wall-folders/${folderId}`, { method: 'DELETE' });
}

export async function exportWallCsv(wallId) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api/walls/${wallId}/export.csv`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'export-failed');
    error.status = response.status;
    error.code = data.error || String(response.status);
    throw error;
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  return {
    blob,
    filename: filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'wall-posts.csv'
  };
}

export async function exportWallHtml(wallId) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api/walls/${wallId}/export.html`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'export-failed');
    error.status = response.status;
    error.code = data.error || String(response.status);
    throw error;
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  return {
    blob,
    filename: filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'wall.html'
  };
}

export function createPost(data) {
  const payload = {
    ...data,
    images: undefined,
    worksheetImages: undefined,
    column: data.column || 1,
    order: data.order ?? Date.now()
  };
  const images = Array.isArray(data.images) ? data.images : [];
  const worksheetImages = data.worksheetImages && typeof data.worksheetImages === 'object'
    ? data.worksheetImages
    : {};
  const worksheetImageEntries = Object.entries(worksheetImages).filter(([, file]) => file);
  if (!images.length && !worksheetImageEntries.length) {
    return apiFetch('/api/posts', {
      method: 'POST',
      body: payload
    });
  }

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  for (const image of images) formData.append('images', image, image.name || 'image');
  for (const [fieldId, image] of worksheetImageEntries) {
    formData.append(`images:${fieldId}`, image, image.name || 'image');
  }
  return apiFetch('/api/posts', {
    method: 'POST',
    body: formData
  });
}

export function updatePost(postId, data) {
  const payload = {
    ...data,
    images: undefined,
    worksheetImages: undefined
  };
  const images = Array.isArray(data.images) ? data.images : [];
  const worksheetImages = data.worksheetImages && typeof data.worksheetImages === 'object'
    ? data.worksheetImages
    : {};
  const worksheetImageEntries = Object.entries(worksheetImages).filter(([, file]) => file);
  if (!images.length && !worksheetImageEntries.length) {
    return apiFetch(`/api/posts/${postId}`, { method: 'PATCH', body: payload });
  }

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  for (const image of images) formData.append('images', image, image.name || 'image');
  for (const [fieldId, image] of worksheetImageEntries) {
    formData.append(`images:${fieldId}`, image, image.name || 'image');
  }
  return apiFetch(`/api/posts/${postId}`, { method: 'PATCH', body: formData });
}

export function deletePost(postId) {
  return apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
}

export function updatePostLayouts(updates) {
  return apiFetch('/api/posts/layouts', { method: 'POST', body: { updates } });
}

export function deleteWallColumn(wallId, column, columnCount, columnNames = {}) {
  return apiFetch(`/api/walls/${wallId}/delete-column`, {
    method: 'POST',
    body: { column, columnCount, columnNames }
  });
}

export function createHtmlSite(data) {
  return apiFetch('/api/html-sites', { method: 'POST', body: data });
}

export function deleteHtmlSite(siteId) {
  return apiFetch(`/api/html-sites/${siteId}`, { method: 'DELETE' });
}

export function createComment(data) {
  return apiFetch('/api/comments', { method: 'POST', body: data });
}

export function deleteComment(commentId) {
  return apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
}

export function toggleLike(postId) {
  return apiFetch(`/api/posts/${postId}/toggle-like`, { method: 'POST' });
}

export function updateUser(uid, data) {
  return apiFetch(`/api/users/${uid}`, { method: 'PATCH', body: data });
}

export function deleteUser(uid) {
  return apiFetch(`/api/users/${uid}`, { method: 'DELETE' });
}

export function deleteStudentAccount(studentUid) {
  return deleteUser(studentUid);
}

export async function deleteStudentAccounts(studentUids) {
  const results = await Promise.all(studentUids.map((uid) => deleteUser(uid)));
  return { data: { count: results.length, deleted: studentUids.map((uid) => ({ uid })) } };
}

export function setStudentPasswords(studentUids, password) {
  return apiFetch('/api/users/passwords', {
    method: 'POST',
    body: { uids: studentUids, password }
  });
}
