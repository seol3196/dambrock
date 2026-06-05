import {
  ArrowLeft,
  Copy,
  Download,
  ImagePlus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Send,
  Settings2,
  Share2,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import PostCard from '../components/PostCard.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import {
  colorOptions,
  createPost,
  deleteWallColumn,
  exportWallCsv,
  exportWallHtml,
  subscribePosts,
  subscribeStudentClasses,
  subscribeWall,
  updatePostLayouts,
  updatePost,
  updateWall,
  wallBackgroundOptions
} from '../lib/firestore';

const MAX_COLUMN_NAME_LENGTH = 10;
const MAX_POST_IMAGE_COUNT = 8;

function homePath(role) {
  if (role === 'teacher') return '/teacher';
  if (role === 'student') return '/student';
  return '/';
}

function clampColumnCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count)) return 4;
  return Math.min(5, Math.max(1, count));
}

function backgroundSwatch(value) {
  return (
    wallBackgroundOptions.find((option) => option.value === value)?.swatch ||
    wallBackgroundOptions[0].swatch
  );
}

function postSortValue(post, fallbackOrder) {
  return Number.isFinite(post.order) ? post.order : fallbackOrder;
}

function columnName(wall, column) {
  const name = wall?.columnNames?.[column] || '';
  const trimmedName = String(name).trim();
  if (
    trimmedName === String(column) ||
    trimmedName === `${column}번` ||
    trimmedName === `${column}번 컬럼`
  ) {
    return '';
  }
  return name;
}

function columnTitle(wall, column) {
  return columnName(wall, column) || `${column}번 컬럼`;
}

function nextPostPlacement(postsByColumn, columnNumbers) {
  const placement = columnNumbers
    .map((column) => {
      const columnPosts = postsByColumn[column] || [];
      const lastOrder = columnPosts.reduce(
        (maxOrder, post, index) => Math.max(maxOrder, postSortValue(post, index)),
        -1
      );

      return {
        column,
        count: columnPosts.length,
        order: lastOrder + 1
      };
    })
    .sort((a, b) => a.count - b.count || a.column - b.column)[0];

  return {
    column: placement.column,
    order: placement.order
  };
}

function nextColumnPostPlacement(postsByColumn, column) {
  const columnPosts = postsByColumn[column] || [];
  const lastOrder = columnPosts.reduce(
    (maxOrder, post, index) => Math.max(maxOrder, postSortValue(post, index)),
    -1
  );

  return {
    column,
    order: lastOrder + 1
  };
}

function worksheetFields(wall) {
  return wall?.postMode === 'worksheet' && Array.isArray(wall?.postTemplate?.fields)
    ? wall.postTemplate.fields
    : [];
}

function emptyWorksheetAnswers(fields) {
  return Object.fromEntries(fields.map((field) => [field.id, '']));
}

function worksheetSummary(fields, answers) {
  return fields
    .map((field) => `${field.label}\n${answers[field.id] || ''}`.trim())
    .filter(Boolean)
    .join('\n\n');
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (value >= 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${value}B`;
}

function AttachedImagePreview({ file }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return (
    <img
      src={previewUrl}
      alt=""
      className="h-14 w-14 rounded-[8px] object-cover"
    />
  );
}

export default function WallPage() {
  const { wallId } = useParams();
  const location = useLocation();
  const { user, role, profile, displayId, loading } = useAuth();
  const [wall, setWall] = useState(null);
  const [wallMissing, setWallMissing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [postModalExpanded, setPostModalExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [htmlExportOpen, setHtmlExportOpen] = useState(false);
  const [htmlExporting, setHtmlExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postTargetColumn, setPostTargetColumn] = useState(null);
  const [draggingPost, setDraggingPost] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [columnNameDrafts, setColumnNameDrafts] = useState({});
  const [editingColumnName, setEditingColumnName] = useState(null);
  const [wallError, setWallError] = useState('');
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1600 : window.innerWidth
  );
  const [form, setForm] = useState({
    content: '',
    color: colorOptions[0].value,
    templateAnswers: {}
  });
  const [imageFiles, setImageFiles] = useState([]);
  const [worksheetImages, setWorksheetImages] = useState({});
  const [existingPostImages, setExistingPostImages] = useState([]);
  const [deleteImageIds, setDeleteImageIds] = useState([]);
  const [activeImageFieldId, setActiveImageFieldId] = useState(null);
  const [postError, setPostError] = useState('');
  const [settingsForm, setSettingsForm] = useState(null);
  const [settingsVisibilityMode, setSettingsVisibilityMode] = useState('all');
  const [studentClasses, setStudentClasses] = useState([]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const shareUrl = `${origin}/wall/${wallId}`;
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const readOnlyMode = searchParams.get('view') === 'readonly';
  const readOnlyAuthorMode = searchParams.get('authors');
  const effectiveShowAuthorNames =
    readOnlyMode && readOnlyAuthorMode
      ? readOnlyAuthorMode !== 'hidden'
      : wall?.showAuthorNames !== false;
  const displayWall = useMemo(
    () => (wall ? { ...wall, showAuthorNames: effectiveShowAuthorNames } : wall),
    [effectiveShowAuthorNames, wall]
  );
  const canManageWall = Boolean(!readOnlyMode && user && role === 'teacher' && wall?.ownerId === user.uid);
  const publicViewEnabled = wall?.publicViewEnabled === true;
  const columnModeEnabled = wall?.columnModeEnabled === true;
  const canMovePosts = Boolean(columnModeEnabled && !readOnlyMode && user);
  const columnCount = clampColumnCount(wall?.columnCount ?? 4);
  const requestedColumn = Number(searchParams.get('column'));
  const columnNumbers = useMemo(
    () => Array.from({ length: columnCount }, (_, index) => index + 1),
    [columnCount]
  );
  const sharedColumn = columnNumbers.includes(requestedColumn) ? requestedColumn : null;
  const displayedColumnNumbers = useMemo(
    () => (sharedColumn ? [sharedColumn] : columnNumbers),
    [columnNumbers, sharedColumn]
  );
  const displayedColumnCount = displayedColumnNumbers.length;
  const visibleColumns =
    sharedColumn ? 1 : viewportWidth >= 1280 ? columnCount : viewportWidth >= 768 ? Math.min(columnCount, 2) : 1;
  const boardGridStyle = useMemo(
    () => {
      const shouldConstrainColumns = viewportWidth >= 768 && displayedColumnCount <= 2;
      return {
        gridTemplateColumns: shouldConstrainColumns
          ? `repeat(${displayedColumnCount}, minmax(300px, 440px))`
          : `repeat(${visibleColumns}, minmax(0, 1fr))`,
        justifyContent: shouldConstrainColumns ? 'center' : 'stretch'
      };
    },
    [displayedColumnCount, viewportWidth, visibleColumns]
  );
  const corkStyle = useMemo(
    () => ({
      backgroundColor: backgroundSwatch(wall?.backgroundTone)
    }),
    [wall?.backgroundTone]
  );
  const templateFields = useMemo(() => worksheetFields(wall), [wall]);
  const isWorksheetWall = wall?.postMode === 'worksheet';

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canManageWall || !wall?.ownerId) {
      setStudentClasses([]);
      return undefined;
    }
    return subscribeStudentClasses({ ownerId: wall.ownerId }, setStudentClasses);
  }, [canManageWall, wall?.ownerId]);

  useEffect(() => {
    if (loading) return undefined;

    const unsubscribe = subscribeWall(
      wallId,
      (nextWall) => {
        setWallError('');
        setWallMissing(false);
        setWall(nextWall);

        if (nextWall) {
          setColumnNameDrafts((currentDrafts) => {
            if (!editingColumnName) return nextWall.columnNames || {};
            return {
              ...(nextWall.columnNames || {}),
              [editingColumnName]: currentDrafts[editingColumnName] ?? nextWall.columnNames?.[editingColumnName] ?? ''
            };
          });
          if (!settingsOpen) {
            setSettingsVisibilityMode(
              nextWall.visibleToStudents === false
                ? 'hidden'
                : Array.isArray(nextWall.visibleClassIds) && nextWall.visibleClassIds.length
                  ? 'classes'
                  : 'all'
            );
            setSettingsForm({
              title: nextWall.title || '',
              description: nextWall.description || '',
              accessMode: nextWall.accessMode || 'login',
              commentsEnabled: nextWall.commentsEnabled ?? true,
              likesEnabled: nextWall.likesEnabled ?? true,
              showAuthorNames: nextWall.showAuthorNames ?? true,
              visibleToStudents: nextWall.visibleToStudents ?? true,
              visibleClassIds: Array.isArray(nextWall.visibleClassIds) ? nextWall.visibleClassIds : [],
              publicViewEnabled: nextWall.publicViewEnabled ?? false,
              columnModeEnabled: nextWall.columnModeEnabled ?? false,
              imageUploadsEnabled: nextWall.imageUploadsEnabled ?? true,
              postMode: nextWall.postMode || 'free',
              postTemplate: nextWall.postTemplate || { fields: [] },
              backgroundTone: nextWall.backgroundTone || wallBackgroundOptions[0].value
            });
          }
        }
      },
      (error) => {
        setWall(null);
        setWallMissing(error?.status === 404);
        setWallError(error?.status === 401 || error?.status === 403 ? 'permission-denied' : 'load-failed');
      },
      readOnlyMode ? { view: 'readonly' } : {}
    );

    return unsubscribe;
  }, [editingColumnName, loading, readOnlyMode, settingsOpen, wallId]);

  useEffect(() => {
    if (loading || !wall) return undefined;
    if (wall.accessMode === 'login' && !user && !readOnlyMode) return undefined;

    const unsubscribe = subscribePosts(
      wallId,
      (items) => {
        setWallError('');
        setPosts(
          items
            .sort((a, b) => {
              const aOrder = postSortValue(a, -new Date(a.createdAt || 0).getTime());
              const bOrder = postSortValue(b, -new Date(b.createdAt || 0).getTime());
              return aOrder - bOrder;
            })
        );
      },
      (error) => {
        setPosts([]);
        setWallError(error?.status === 401 || error?.status === 403 ? 'permission-denied' : 'load-failed');
      },
      readOnlyMode ? { view: 'readonly' } : {}
    );

    return unsubscribe;
  }, [loading, readOnlyMode, user, wall, wallId]);

  const postsByColumn = useMemo(() => {
    const grouped = Object.fromEntries(columnNumbers.map((column) => [column, []]));
    let fallbackIndex = 0;

    for (const post of posts) {
      const column =
        post.column && grouped[post.column]
          ? post.column
          : columnNumbers[fallbackIndex++ % columnNumbers.length];
      grouped[column].push(post);
    }

    for (const column of columnNumbers) {
      grouped[column].sort((a, b) => {
        const aOrder = postSortValue(a, -new Date(a.createdAt || 0).getTime());
        const bOrder = postSortValue(b, -new Date(b.createdAt || 0).getTime());
        return aOrder - bOrder;
      });
    }

    return grouped;
  }, [columnNumbers, posts]);
  const displayedPostCount = useMemo(
    () =>
      displayedColumnNumbers.reduce(
        (count, column) => count + (postsByColumn[column]?.length || 0),
        0
      ),
    [displayedColumnNumbers, postsByColumn]
  );

  if (!loading && wall?.accessMode === 'login' && !user && !readOnlyMode) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  async function submitPost(event) {
    event.preventDefault();
    if (readOnlyMode) return;
    if (loading) return;
    if (wall?.accessMode === 'login' && !user) {
      alert('로그인이 필요한 담벼락입니다. 다시 로그인해 주세요.');
      return;
    }

    const templateAnswers = Object.fromEntries(
      templateFields.map((field) => [
        field.id,
        field.type === 'image' ? (worksheetImages[field.id] ? '[사진]' : '') : String(form.templateAnswers?.[field.id] || '').trim()
      ])
    );
    if (isWorksheetWall) {
      const missingField = templateFields.find(
        (field) => field.required !== false && !templateAnswers[field.id]
      );
      if (missingField) {
        alert(`${missingField.label} 항목을 입력해 주세요.`);
        return;
      }
    } else if (!form.content.trim() && !imageFiles.length) {
      return;
    }

    const targetColumn = columnModeEnabled
      ? columnNumbers.includes(postTargetColumn)
        ? postTargetColumn
        : sharedColumn
      : null;

    setPostError('');
    try {
      await createPost({
        wallId,
        authorId: user?.uid || 'anonymous',
        authorName: profile?.displayName || displayId || '익명',
        content: isWorksheetWall ? worksheetSummary(templateFields, templateAnswers) : form.content.trim(),
        templateAnswers: isWorksheetWall ? templateAnswers : undefined,
        color: form.color,
        images: isWorksheetWall ? [] : imageFiles,
        worksheetImages: isWorksheetWall ? worksheetImages : undefined,
        ...(targetColumn
          ? nextColumnPostPlacement(postsByColumn, targetColumn)
          : nextPostPlacement(postsByColumn, columnNumbers))
      });

      setForm({ content: '', color: colorOptions[0].value, templateAnswers: emptyWorksheetAnswers(templateFields) });
      setImageFiles([]);
      setWorksheetImages({});
      setExistingPostImages([]);
      setDeleteImageIds([]);
      setActiveImageFieldId(null);
      setPostTargetColumn(null);
      setPostModalExpanded(false);
      setModalOpen(false);
    } catch (error) {
      if (error?.code === 'storage-limit-exceeded') {
        setPostError('계정에 할당된 저장 용량을 초과했습니다. 선생님이나 관리자에게 용량 조정을 요청해 주세요.');
      } else if (error?.code === 'image-upload-requires-login') {
        setPostError('사진 첨부는 로그인한 계정만 사용할 수 있습니다.');
      } else if (error?.code === 'image-file-required') {
        setPostError('이미지 파일만 첨부할 수 있습니다.');
      } else if (error?.code === 'too-many-images') {
        setPostError(`사진은 한 게시글에 최대 ${MAX_POST_IMAGE_COUNT}장까지 첨부할 수 있습니다.`);
      } else if (error?.code === 'image-too-large') {
        setPostError('사진 한 장은 최대 100MB까지 첨부할 수 있습니다.');
      } else if (error?.code === 'invalid-upload') {
        setPostError('사진 업로드 형식을 처리하지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
      } else {
        setPostError('게시글을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    }
  }

  function openCreatePostModal(column = null) {
    if (readOnlyMode) return;
    setEditingPost(null);
    setPostTargetColumn(columnModeEnabled && columnNumbers.includes(column) ? column : null);
    setForm({
      content: '',
      color: colorOptions[0].value,
      templateAnswers: emptyWorksheetAnswers(templateFields)
    });
    setImageFiles([]);
    setWorksheetImages({});
    setExistingPostImages([]);
    setDeleteImageIds([]);
    setActiveImageFieldId(null);
    setPostError('');
    setPostModalExpanded(false);
    setModalOpen(true);
  }

  function openEditPostModal(post) {
    if (readOnlyMode) return;
    setEditingPost(post);
    setPostTargetColumn(null);
    setForm({
      content: post.content || '',
      color: post.color || colorOptions[0].value,
      templateAnswers: {
        ...emptyWorksheetAnswers(templateFields),
        ...(post.templateAnswers || {})
      }
    });
    setImageFiles([]);
    setWorksheetImages({});
    setExistingPostImages(post.images || []);
    setDeleteImageIds([]);
    setActiveImageFieldId(null);
    setPostError('');
    setPostModalExpanded(false);
    setModalOpen(true);
  }

  async function savePostEdit(event) {
    event.preventDefault();
    if (!editingPost) return;

    if (!isWorksheetWall) {
      const nextContent = form.content.trim();
      const remainingImages = existingPostImages.filter((image) => !deleteImageIds.includes(image.id));
      if (!nextContent && !remainingImages.length && !imageFiles.length) return;

      await updatePost(editingPost.id, {
        content: nextContent,
        color: form.color,
        images: imageFiles,
        deleteImageIds
      });
      setEditingPost(null);
      setPostTargetColumn(null);
      setForm({ content: '', color: colorOptions[0].value, templateAnswers: emptyWorksheetAnswers(templateFields) });
      setImageFiles([]);
      setWorksheetImages({});
      setExistingPostImages([]);
      setDeleteImageIds([]);
      setActiveImageFieldId(null);
      setPostModalExpanded(false);
      setModalOpen(false);
      return;
    }

    const templateAnswers = Object.fromEntries(
      templateFields.map((field) => {
        if (field.type === 'image') {
          const existingImage = existingPostImages.find(
            (image) => image.fieldId === field.id && !deleteImageIds.includes(image.id)
          );
          return [field.id, worksheetImages[field.id] || existingImage ? '[사진]' : ''];
        }
        return [field.id, String(form.templateAnswers?.[field.id] || '').trim()];
      })
    );
    const missingField = templateFields.find(
      (field) => field.required !== false && !templateAnswers[field.id]
    );
    if (missingField) {
      alert(`${missingField.label} 항목을 입력해 주세요.`);
      return;
    }

    await updatePost(editingPost.id, {
      color: form.color,
      templateAnswers,
      worksheetImages,
      deleteImageIds
    });
    setEditingPost(null);
    setPostTargetColumn(null);
    setForm({ content: '', color: colorOptions[0].value, templateAnswers: emptyWorksheetAnswers(templateFields) });
    setImageFiles([]);
    setWorksheetImages({});
    setExistingPostImages([]);
    setDeleteImageIds([]);
    setActiveImageFieldId(null);
    setPostModalExpanded(false);
    setModalOpen(false);
  }

  function addImageFiles(files) {
    const nextFiles = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!nextFiles.length) return;
    setPostError('');
    setImageFiles((current) => {
      const availableCount = Math.max(0, MAX_POST_IMAGE_COUNT - current.length);
      const selected = nextFiles.slice(0, availableCount);
      if (selected.length < nextFiles.length) {
        setPostError(`사진은 한 게시글에 최대 ${MAX_POST_IMAGE_COUNT}장까지 첨부할 수 있습니다.`);
      }
      return [...current, ...selected];
    });
  }

  function handlePasteImages(event) {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    if (isWorksheetWall) {
      const imageFields = templateFields.filter((field) => field.type === 'image');
      const targetField =
        imageFields.find((field) => field.id === activeImageFieldId) ||
        imageFields.find((field) => !worksheetImages[field.id]) ||
        imageFields[0];
      if (targetField) setWorksheetImage(targetField.id, files[0]);
      return;
    }
    if (wall?.imageUploadsEnabled === false) return;
    addImageFiles(files);
  }

  function removeImageFile(index) {
    setImageFiles((current) => current.filter((_file, fileIndex) => fileIndex !== index));
  }

  function removeExistingImage(imageId) {
    setDeleteImageIds((current) => (current.includes(imageId) ? current : [...current, imageId]));
  }

  function setWorksheetImage(fieldId, file) {
    if (!file || !file.type.startsWith('image/')) return;
    setPostError('');
    setWorksheetImages((current) => ({
      ...current,
      [fieldId]: file
    }));
  }

  function removeWorksheetImage(fieldId) {
    setWorksheetImages((current) => {
      const nextImages = { ...current };
      delete nextImages[fieldId];
      return nextImages;
    });
  }

  function existingWorksheetImage(fieldId) {
    return existingPostImages.find((image) => image.fieldId === fieldId && !deleteImageIds.includes(image.id));
  }

  function columnShareUrl(column) {
    return `${shareUrl}?column=${column}`;
  }

  function publicViewShareUrl(authors) {
    const params = new URLSearchParams({
      view: 'readonly',
      authors
    });
    return `${shareUrl}?${params.toString()}`;
  }

  async function copyShareUrl(url = shareUrl, label = '링크') {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setShareMessage(`${label}를 복사했습니다.`);
      window.setTimeout(() => setShareMessage(''), 1600);
    } catch {
      setShareMessage('복사하지 못했습니다. 링크를 직접 선택해 복사해 주세요.');
    }
  }

  function setStudentDashboardVisibilityMode(mode) {
    if (!settingsForm) return;
    setSettingsVisibilityMode(mode);
    if (mode === 'hidden') {
      setSettingsForm({ ...settingsForm, visibleToStudents: false });
      return;
    }
    if (mode === 'all') {
      setSettingsForm({ ...settingsForm, visibleToStudents: true, visibleClassIds: [] });
      return;
    }
    setSettingsForm({ ...settingsForm, visibleToStudents: true });
  }

  function toggleVisibleClass(classId) {
    if (!settingsForm) return;
    const current = Array.isArray(settingsForm.visibleClassIds) ? settingsForm.visibleClassIds : [];
    const next = current.includes(classId)
      ? current.filter((item) => item !== classId)
      : [...current, classId];
    setSettingsForm({ ...settingsForm, visibleToStudents: true, visibleClassIds: next });
  }

  async function saveSettings() {
    if (!settingsForm) return;
    const visibleClassIds = Array.isArray(settingsForm.visibleClassIds)
      ? settingsForm.visibleClassIds
      : [];
    if (settingsVisibilityMode === 'classes' && !visibleClassIds.length) {
      alert('공개할 클래스를 하나 이상 선택해 주세요.');
      return;
    }
    await updateWall(wallId, {
      ...settingsForm,
      visibleToStudents: settingsVisibilityMode !== 'hidden',
      visibleClassIds: settingsVisibilityMode === 'classes' ? visibleClassIds : []
    });
    setSettingsOpen(false);
  }

  async function updateShareAccessMode(loginRequired) {
    const accessMode = loginRequired ? 'login' : 'public';
    await updateWall(wallId, { accessMode });
    setSettingsForm((current) => (current ? { ...current, accessMode } : current));
  }

  async function updatePublicViewEnabled(enabled) {
    const previousValue = wall?.publicViewEnabled === true;
    setWall((current) => (current ? { ...current, publicViewEnabled: enabled } : current));
    setSettingsForm((current) => (current ? { ...current, publicViewEnabled: enabled } : current));
    setShareMessage('');

    try {
      const data = await updateWall(wallId, { publicViewEnabled: enabled });
      if (data?.wall) setWall(data.wall);
      setShareMessage(
        enabled ? '공개보기 링크를 활성화했습니다.' : '공개보기 링크를 비활성화했습니다.'
      );
      window.setTimeout(() => setShareMessage(''), 1600);
    } catch {
      setWall((current) => (current ? { ...current, publicViewEnabled: previousValue } : current));
      setSettingsForm((current) =>
        current ? { ...current, publicViewEnabled: previousValue } : current
      );
      alert('공개보기 링크 설정을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }

  async function addColumn() {
    if (columnCount >= 5) {
      alert('\uCEEC\uB7FC\uC740 \uCD5C\uB300 5\uAC1C\uAE4C\uC9C0 \uAC00\uB2A5\uD569\uB2C8\uB2E4.');
      return;
    }

    const nextColumn = columnCount + 1;
    await updateWall(wallId, {
      columnCount: nextColumn
    });
  }

  async function saveColumnName(column) {
    const nextName = (columnNameDrafts[column] || '').trim().slice(0, MAX_COLUMN_NAME_LENGTH);
    const currentName = columnName(wall, column);
    const nextColumnNames = { ...(wall?.columnNames || {}) };

    if (nextName) {
      nextColumnNames[column] = nextName;
    } else {
      delete nextColumnNames[column];
    }

    setColumnNameDrafts(nextColumnNames);
    setEditingColumnName(null);
    if (nextName === currentName) return;

    await updateWall(wallId, {
      columnNames: nextColumnNames
    });
  }

  async function removeColumn(column) {
    if (columnCount <= 1) {
      alert('\uCEEC\uB7FC\uC740 \uCD5C\uC18C 1\uAC1C \uC774\uC0C1 \uD544\uC694\uD569\uB2C8\uB2E4.');
      return;
    }

    const ok = window.confirm(
      '\uC774 \uCEEC\uB7FC\uACFC \uC548\uC758 \uBAA8\uB4E0 \uD3EC\uC2A4\uD2B8\uC787\uC774 \uC0AD\uC81C\uB429\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?'
    );
    if (!ok) return;

    await deleteWallColumn(wallId, column, columnCount, wall?.columnNames || {});
  }

  async function movePostToColumn(column, targetPostId = null, placement = 'after') {
    if (!draggingPost) return;

    if (!canManageWall) {
      if (!user || draggingPost.authorId !== user.uid) return;

      const targetColumnPosts = (postsByColumn[column] || []).filter(
        (post) => post.id !== draggingPost.id
      );
      const targetIndex = targetPostId
        ? targetColumnPosts.findIndex((post) => post.id === targetPostId)
        : -1;
      const insertIndex =
        targetIndex === -1 ? targetColumnPosts.length : targetIndex + (placement === 'after' ? 1 : 0);
      const previousPost = targetColumnPosts[insertIndex - 1];
      const nextPost = targetColumnPosts[insertIndex];
      const previousOrder = previousPost ? postSortValue(previousPost, insertIndex - 1) : null;
      const nextOrder = nextPost ? postSortValue(nextPost, insertIndex) : null;
      const order =
        previousOrder == null && nextOrder == null
          ? 0
          : previousOrder == null
            ? nextOrder - 1
            : nextOrder == null
              ? previousOrder + 1
              : (previousOrder + nextOrder) / 2;

      await updatePost(draggingPost.id, { column, order });
      setDraggingPost(null);
      setDragPreview(null);
      return;
    }

    const nextByColumn = Object.fromEntries(
      columnNumbers.map((columnNumber) => [
        columnNumber,
        postsByColumn[columnNumber].filter((post) => post.id !== draggingPost.id)
      ])
    );
    const targetColumnPosts = nextByColumn[column] || [];
    const targetIndex = targetPostId
      ? targetColumnPosts.findIndex((post) => post.id === targetPostId)
      : -1;
    const insertIndex =
      targetIndex === -1 ? targetColumnPosts.length : targetIndex + (placement === 'after' ? 1 : 0);

    targetColumnPosts.splice(insertIndex, 0, draggingPost);

    const updates = [];
    for (const columnNumber of columnNumbers) {
      nextByColumn[columnNumber].forEach((post, index) => {
        if (post.column !== columnNumber || post.order !== index) {
          updates.push({ id: post.id, column: columnNumber, order: index });
        }
      });
    }

    if (updates.length) {
      await updatePostLayouts(updates);
    }
    setDraggingPost(null);
    setDragPreview(null);
  }

  function showColumnDropPreview(column) {
    if (!draggingPost) return;
    setDragPreview({ column, targetPostId: null, placement: 'after' });
  }

  function showPostDropPreview(targetPost, placement, column) {
    if (!draggingPost || draggingPost.id === targetPost.id) {
      setDragPreview(null);
      return;
    }
    setDragPreview({ column, targetPostId: targetPost.id, placement });
  }

  async function downloadCsv() {
    try {
      const { blob, filename } = await exportWallCsv(wallId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert('CSV 파일을 추출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function downloadHtml(includeAuthorNames) {
    setHtmlExporting(true);
    try {
      const { blob, filename } = await exportWallHtml(wallId, { includeAuthorNames });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setHtmlExportOpen(false);
    } catch {
      alert('HTML 파일을 내보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setHtmlExporting(false);
    }
  }

  function openHtmlExportModal() {
    setHtmlExportOpen(true);
  }

  function closeActions() {
    setActionsOpen(false);
  }

  if (wallMissing) {
    return (
      <main className="felt-bg grid min-h-screen place-items-center px-4">
        <section className="rounded-[8px] bg-white/90 p-6 shadow-soft">
          담벼락을 찾을 수 없습니다.
        </section>
      </main>
    );
  }

  if (!loading && wallError === 'permission-denied' && !user && !readOnlyMode) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!loading && wallError === 'permission-denied') {
    return (
      <main className="felt-bg grid min-h-screen place-items-center px-4">
        <section className="rounded-[8px] bg-white/90 p-6 shadow-soft text-center">
          <p className="font-bold text-stone-900">담벼락을 불러올 권한이 없습니다.</p>
          <p className="mt-2 text-sm text-stone-600">
            로그인 상태를 확인한 뒤 다시 들어와 주세요.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="cork-bg min-h-screen" style={corkStyle}>
      <header className="sticky top-0 z-10 border-b border-stone-900/10 bg-white/88 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-start justify-between gap-3 px-4 py-3 sm:items-center sm:px-5 sm:py-4">
          <div className="min-w-0">
            <Link
              to={homePath(role)}
              className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-stone-600"
            >
              <ArrowLeft size={16} />
              돌아가기
            </Link>
            <h1 className="line-clamp-2 text-2xl font-bold leading-tight text-stone-950 sm:truncate sm:text-4xl">
              {wall?.title || '담벼락'}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {wall?.ownerName} 선생님 · 게시글 {posts.length}개
            </p>
            {canManageWall && wall?.showAuthorNames === false && (
              <p className="mt-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                학생에겐 작성자 이름이 표시되지 않습니다.
              </p>
            )}
          </div>

          {canManageWall && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setActionsOpen((value) => !value)}
                className="grid h-10 w-10 place-items-center rounded-[10px] border border-stone-300 bg-white text-stone-800 shadow-sm sm:hidden"
                aria-label="담벼락 메뉴"
              >
                <MoreHorizontal size={18} />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-12 z-20 w-36 overflow-hidden rounded-[12px] border border-stone-200 bg-white shadow-soft sm:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      closeActions();
                      downloadCsv();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-bold text-stone-800 hover:bg-stone-50"
                  >
                    <Download size={15} />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeActions();
                      openHtmlExportModal();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-bold text-stone-800 hover:bg-stone-50"
                  >
                    <Download size={15} />
                    HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeActions();
                      setSettingsOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-bold text-stone-800 hover:bg-stone-50"
                  >
                    <Settings2 size={15} />
                    설정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeActions();
                      setShareOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-3 text-left text-sm font-bold text-stone-800 hover:bg-stone-50"
                  >
                    <Share2 size={15} />
                    공유
                  </button>
                </div>
              )}
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex items-center gap-2 rounded-[10px] border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                type="button"
                onClick={openHtmlExportModal}
                className="inline-flex items-center gap-2 rounded-[10px] border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm"
              >
                <Download size={16} />
                HTML
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-2 rounded-[10px] border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm"
              >
                <Settings2 size={16} />
                설정
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-2 rounded-[10px] border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm"
              >
                <Share2 size={16} />
                공유
              </button>
            </div>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1600px] px-5 py-6">
        <div data-testid="wall-board">
          {canManageWall && columnModeEnabled && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={addColumn}
                className="inline-flex items-center gap-1 rounded-full border border-stone-900/10 bg-white/55 px-3 py-1.5 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-white/80"
              >
                <Plus size={14} />
                {'\uCEEC\uB7FC \uCD94\uAC00'}
              </button>
            </div>
          )}
          <div className="grid gap-5" style={boardGridStyle}>
            {displayedColumnNumbers.map((column) => (
              <div
                key={column}
                data-testid={`wall-column-${column}`}
                onDragOver={(event) => {
                  if (!canMovePosts || !draggingPost) return;
                  event.preventDefault();
                  showColumnDropPreview(column);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (canMovePosts) movePostToColumn(column);
                }}
                className={`min-h-[300px] rounded-[16px] p-3 transition ${
                  draggingPost && canMovePosts
                    ? 'bg-white/22 outline outline-2 outline-offset-2 outline-dashed outline-stone-400'
                    : ''
                }`}
              >
                <div className={columnModeEnabled ? 'mb-4 px-1' : ''}>
                  {columnModeEnabled && canManageWall ? (
                    <div className="flex min-h-12 items-center gap-2 rounded-[10px] border border-white/75 bg-white/68 px-3 py-2 shadow-sm backdrop-blur-[2px]">
                      <input
                        value={columnNameDrafts[column] ?? columnName(wall, column)}
                        onChange={(event) =>
                          setColumnNameDrafts((drafts) => ({
                            ...drafts,
                            [column]: event.target.value.slice(0, MAX_COLUMN_NAME_LENGTH)
                          }))
                        }
                        onBlur={() => saveColumnName(column)}
                        onFocus={() => setEditingColumnName(column)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        maxLength={MAX_COLUMN_NAME_LENGTH}
                        placeholder="컬럼명을 입력한 후 엔터"
                        className="min-w-0 flex-1 bg-transparent text-center text-xl font-extrabold text-stone-900 outline-none placeholder:text-sm placeholder:font-bold placeholder:text-stone-500 sm:text-2xl"
                      />
                      <button
                        type="button"
                        onClick={() => removeColumn(column)}
                        aria-label={'\uCEEC\uB7FC \uC0AD\uC81C'}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-white/70 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : columnModeEnabled && columnName(wall, column) ? (
                    <h2 className="flex min-h-12 items-center gap-2 rounded-[10px] border border-white/75 bg-white/68 px-3 py-2 text-stone-900 shadow-sm backdrop-blur-[2px]">
                      <span className="min-w-0 flex-1 truncate text-center text-xl font-extrabold sm:text-2xl">
                        {columnTitle(wall, column)}
                      </span>
                      {!readOnlyMode && (
                        <button
                          type="button"
                          onClick={() => openCreatePostModal(column)}
                          aria-label={`${columnTitle(wall, column)}에 포스트잇 추가`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-900 text-white shadow-sm transition hover:bg-stone-700"
                        >
                          <Plus size={18} />
                        </button>
                      )}
                    </h2>
                  ) : columnModeEnabled ? (
                    <div className="min-h-12" />
                  ) : null}
                </div>
                <div className="space-y-4">
                  {postsByColumn[column].map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      wall={displayWall || {}}
                      isTeacherView={canManageWall}
                      canDragPost={Boolean(
                        canMovePosts &&
                          (canManageWall || (user && post.authorId === user.uid))
                      )}
                      readOnly={readOnlyMode}
                      onDragStart={setDraggingPost}
                      onEditPost={openEditPostModal}
                      dropPreview={
                        dragPreview?.column === column && dragPreview?.targetPostId === post.id
                          ? dragPreview.placement
                          : null
                      }
                      onDragEnd={() => {
                        setDraggingPost(null);
                        setDragPreview(null);
                      }}
                      onDragPreview={(targetPost, placement) =>
                        showPostDropPreview(targetPost, placement, column)
                      }
                      onDropOnPost={(targetPost, placement) =>
                        movePostToColumn(column, targetPost.id, placement)
                      }
                    />
                  ))}
                  {dragPreview?.column === column && dragPreview.targetPostId == null && (
                    <div className="h-1 rounded-full bg-stone-500/45 shadow-sm" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {!displayedPostCount && (
            <div className="mt-5 rounded-[16px] border border-dashed border-white/70 bg-white/55 p-10 text-center text-stone-700">
              아직 포스트잇이 없습니다. 첫 글을 남겨보세요.
            </div>
          )}
        </div>
      </section>

      {!readOnlyMode && (
        <button
          type="button"
          aria-label="글쓰기"
          onClick={openCreatePostModal}
          className="fixed bottom-6 right-6 grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-paper transition hover:scale-105"
        >
          <Plus size={30} />
        </button>
      )}

      {htmlExportOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-stone-950/45 px-4">
          <section className="w-full max-w-sm rounded-[18px] bg-white p-5 text-stone-950 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">HTML로 저장</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  저장할 HTML 파일에 학생 이름을 포함할지 선택해 주세요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!htmlExporting) setHtmlExportOpen(false);
                }}
                className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                aria-label="HTML 저장 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                disabled={htmlExporting}
                onClick={() => downloadHtml(true)}
                className="rounded-[10px] bg-stone-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                포함하기
              </button>
              <button
                type="button"
                disabled={htmlExporting}
                onClick={() => downloadHtml(false)}
                className="rounded-[10px] border border-stone-300 px-4 py-3 text-sm font-bold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                포함하지 않기
              </button>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && canManageWall && settingsForm && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-stone-950/45 px-4 py-6">
          <section className="mx-auto max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto rounded-[18px] bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-stone-950">담벼락 설정</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="설정 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-6">
              <section>
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                  기본 정보
                </h3>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-stone-800">제목</label>
                    <input
                      value={settingsForm.title}
                      onChange={(e) => setSettingsForm({ ...settingsForm, title: e.target.value })}
                      className="h-10 w-full rounded-[8px] border border-stone-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-stone-800">설명</label>
                    <textarea
                      value={settingsForm.description}
                      onChange={(e) => setSettingsForm({ ...settingsForm, description: e.target.value })}
                      className="min-h-20 w-full rounded-[8px] border border-stone-200 p-3 text-sm"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                  참여 설정
                </h3>
                <div className="mt-2 divide-y divide-stone-200 rounded-[10px] border border-stone-200 px-4">
                  <label className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm font-bold text-stone-900">댓글 사용</span>
                    <input
                      type="checkbox"
                      checked={settingsForm.commentsEnabled}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, commentsEnabled: e.target.checked })
                      }
                      className="h-4 w-4 shrink-0 accent-stone-900"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm font-bold text-stone-900">좋아요 사용</span>
                    <input
                      type="checkbox"
                      checked={settingsForm.likesEnabled}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, likesEnabled: e.target.checked })
                      }
                      className="h-4 w-4 shrink-0 accent-stone-900"
                    />
                  </label>
                  <div className="py-3">
                    <div>
                      <b className="block text-sm text-stone-900">학생 홈페이지 공개</b>
                      <span className="text-xs text-stone-500">
                        학생 대시보드에 이 담벼락을 표시할 대상을 정합니다.
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {[
                        ['hidden', '비공개', '학생 목록에서 숨김'],
                        ['all', '전체 학생', '모든 학생에게 표시'],
                        ['classes', '특정 클래스', '선택한 클래스만 표시']
                      ].map(([value, label, description]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStudentDashboardVisibilityMode(value)}
                          className={`rounded-[8px] border px-3 py-2 text-left ${
                            settingsVisibilityMode === value
                              ? 'border-stone-900 bg-stone-900 text-white'
                              : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                          }`}
                        >
                          <span className="block text-sm font-bold">{label}</span>
                          <span
                            className={`mt-0.5 block text-xs ${
                              settingsVisibilityMode === value
                                ? 'text-white/70'
                                : 'text-stone-500'
                            }`}
                          >
                            {description}
                          </span>
                        </button>
                      ))}
                    </div>
                    {settingsVisibilityMode === 'classes' && (
                      <div className="mt-3 rounded-[8px] border border-stone-200 bg-stone-50 p-3">
                        {studentClasses.length ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {studentClasses.map((studentClass) => {
                              const checked = (settingsForm.visibleClassIds || []).includes(
                                studentClass.id
                              );
                              return (
                                <label
                                  key={studentClass.id}
                                  className="flex items-center justify-between gap-3 rounded-[8px] bg-white px-3 py-2 text-sm font-bold text-stone-800"
                                >
                                  <span className="min-w-0 truncate">{studentClass.name}</span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleVisibleClass(studentClass.id)}
                                    className="h-4 w-4 shrink-0 accent-stone-900"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-stone-500">
                            아직 클래스가 없습니다. 교사 대시보드의 학생 관리에서 클래스를 먼저 만들어 주세요.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <label className="flex items-center justify-between gap-4 py-3">
                    <span>
                      <b className="block text-sm text-stone-900">포스트잇에 작성자 이름표시</b>
                      <span className="text-xs text-stone-500">학생에게 이름을 숨김</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settingsForm.showAuthorNames}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, showAuthorNames: e.target.checked })
                      }
                      className="h-4 w-4 shrink-0 accent-stone-900"
                    />
                  </label>
                  {settingsForm.postMode !== 'worksheet' && (
                    <label className="flex items-center justify-between gap-4 py-3">
                      <span>
                        <b className="block text-sm text-stone-900">사진 업로드 허용</b>
                        <span className="text-xs text-stone-500">자유 포스트잇 작성 화면에 사진 첨부 표시</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settingsForm.imageUploadsEnabled !== false}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, imageUploadsEnabled: e.target.checked })
                        }
                        className="h-4 w-4 shrink-0 accent-stone-900"
                      />
                    </label>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-stone-500">
                  보드 형태
                </h3>
                <div className="mt-2 divide-y divide-stone-200 rounded-[10px] border border-stone-200 px-4">
                  <label className="flex items-center justify-between gap-4 py-3">
                    <span>
                      <b className="block text-sm text-stone-900">컬럼 모드 사용</b>
                      <span className="text-xs text-stone-500">주제별 컬럼으로 나눔</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settingsForm.columnModeEnabled}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, columnModeEnabled: e.target.checked })
                      }
                      className="h-4 w-4 shrink-0 accent-stone-900"
                    />
                  </label>
                  <div className="py-3">
                    <p className="mb-2 text-sm font-bold text-stone-900">코르크 배경 색상</p>
                    <div className="grid grid-cols-6 gap-2">
                      {wallBackgroundOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setSettingsForm({ ...settingsForm, backgroundTone: option.value })
                          }
                          className={`h-9 rounded-full border-2 text-[0px] transition ${
                            settingsForm.backgroundTone === option.value
                              ? 'border-stone-900'
                              : 'border-white shadow-sm'
                          }`}
                          style={{ backgroundColor: option.swatch }}
                          title={option.name}
                          aria-label={option.name}
                        >
                          {option.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={saveSettings}
                className="flex-1 rounded-[10px] bg-stone-900 px-4 py-3 text-sm font-bold text-white"
              >
                설정 저장
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-[10px] border border-stone-300 px-4 py-3 text-sm font-bold text-stone-700"
              >
                닫기
              </button>
            </div>
          </section>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-stone-950/45 px-4"
          onPaste={handlePasteImages}
        >
          <form
            onSubmit={editingPost ? savePostEdit : submitPost}
            onPaste={handlePasteImages}
            className={`flex w-full flex-col rounded-[18px] bg-white p-5 shadow-paper ${
              postModalExpanded
                ? 'h-[88vh] max-h-[88vh] max-w-5xl'
                : 'max-h-[90vh] max-w-xl overflow-y-auto'
            }`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                {isWorksheetWall ? '학습지 포스트잇 작성' : '포스트잇 작성'}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPostModalExpanded((value) => !value)}
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-stone-300"
                >
                  {postModalExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  {postModalExpanded ? '작성칸 줄이기' : '작성칸 넓히기'}
                </button>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingPost(null);
                    setPostModalExpanded(false);
                  }}
                  className="rounded-full p-2 hover:bg-stone-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className={`min-h-0 ${postModalExpanded ? 'mt-4 flex-1 overflow-y-auto pr-1' : ''}`}>
            {isWorksheetWall ? (
              <div className="space-y-4">
                {templateFields.map((field) => (
                  <div key={field.id} className="block">
                    <span className="mb-2 block text-sm font-bold text-stone-800">
                      {field.label}
                      {field.required !== false && <span className="text-rose-500"> *</span>}
                    </span>
                    {field.type === 'image' ? (
                      <div
                        className={`rounded-[12px] border border-dashed p-3 transition ${
                          activeImageFieldId === field.id
                            ? 'border-stone-900 bg-stone-100 ring-2 ring-stone-900/10'
                            : 'border-stone-300 bg-stone-50'
                        }`}
                        tabIndex={0}
                        onClick={() => setActiveImageFieldId(field.id)}
                        onFocus={() => setActiveImageFieldId(field.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setActiveImageFieldId(field.id);
                          }
                        }}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="inline-flex items-center gap-2 text-xs font-black text-stone-700">
                              {activeImageFieldId === field.id && (
                                <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[11px] text-white">
                                  선택됨
                                </span>
                              )}
                              이 칸을 클릭한 뒤 Ctrl+V
                            </p>
                            <p className="mt-1 text-xs font-semibold text-stone-500">
                              또는 우측 파일 선택을 클릭
                            </p>
                          </div>
                          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[8px] bg-white px-3 text-sm font-bold text-stone-800 shadow-sm ring-1 ring-stone-200">
                            <ImagePlus size={15} />
                            파일 선택
                            <input
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onFocus={() => setActiveImageFieldId(field.id)}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) setWorksheetImage(field.id, file);
                                event.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                        {worksheetImages[field.id] ? (
                          <div className="mt-3 flex items-center gap-3 rounded-[10px] bg-white p-2 ring-1 ring-stone-200">
                            <AttachedImagePreview file={worksheetImages[field.id]} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-stone-800">
                                {worksheetImages[field.id].name || '붙여넣은 이미지'}
                              </p>
                              <p className="text-xs font-semibold text-stone-500">
                                {formatBytes(worksheetImages[field.id].size)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeWorksheetImage(field.id)}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-red-600"
                              aria-label="첨부 사진 제거"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : existingWorksheetImage(field.id) ? (
                          <div className="mt-3 flex items-center gap-3 rounded-[10px] bg-white p-2 ring-1 ring-stone-200">
                            <img
                              src={existingWorksheetImage(field.id).url}
                              alt={existingWorksheetImage(field.id).originalName || field.label}
                              className="h-14 w-14 rounded-[8px] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-stone-800">
                                {existingWorksheetImage(field.id).originalName || '기존 사진'}
                              </p>
                              <p className="text-xs font-semibold text-stone-500">
                                새 사진을 선택하면 기존 사진이 교체됩니다.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeExistingImage(existingWorksheetImage(field.id).id)}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-red-600"
                              aria-label="기존 사진 제거"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : field.type === 'longText' ? (
                      <textarea
                        value={form.templateAnswers?.[field.id] || ''}
                        maxLength={1000}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            templateAnswers: {
                              ...(form.templateAnswers || {}),
                              [field.id]: event.target.value
                            }
                          })
                        }
                        className={`w-full resize-y rounded-[10px] border border-stone-200 p-3 text-base leading-7 outline-none focus:border-amber-500 ${
                          postModalExpanded ? 'min-h-72' : 'min-h-28'
                        }`}
                      />
                    ) : (
                      <input
                        value={form.templateAnswers?.[field.id] || ''}
                        maxLength={100}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            templateAnswers: {
                              ...(form.templateAnswers || {}),
                              [field.id]: event.target.value
                            }
                          })
                        }
                        className="h-11 w-full rounded-[10px] border border-stone-200 px-3 text-base outline-none focus:border-amber-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className={`w-full resize-y rounded-[10px] border border-stone-200 p-3 text-base leading-7 outline-none focus:border-amber-500 ${
                  postModalExpanded ? 'h-full min-h-[48vh]' : 'mt-4 min-h-40'
                }`}
                placeholder="생각이나 링크를 자유롭게 적어보세요."
              />
            )}
            </div>
            {!isWorksheetWall &&
              (wall?.imageUploadsEnabled !== false ||
                existingPostImages.some((image) => !image.fieldId && !deleteImageIds.includes(image.id))) && (
              <section className="mt-4 rounded-[12px] border border-dashed border-stone-300 bg-stone-50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-black text-stone-800">
                      <ImagePlus size={16} />
                      사진 첨부
                    </p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">
                      파일을 선택하거나 이미지를 복사한 뒤 이 창에서 Ctrl+V로 붙여넣으세요.
                    </p>
                  </div>
                  {wall?.imageUploadsEnabled !== false && (
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[8px] bg-white px-3 text-sm font-bold text-stone-800 shadow-sm ring-1 ring-stone-200">
                      <ImagePlus size={15} />
                      파일 선택
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                          addImageFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>

                {existingPostImages.some((image) => !image.fieldId && !deleteImageIds.includes(image.id)) && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {existingPostImages
                      .filter((image) => !image.fieldId && !deleteImageIds.includes(image.id))
                      .map((image) => (
                        <div
                          key={image.id}
                          className="flex items-center gap-3 rounded-[10px] bg-white p-2 ring-1 ring-stone-200"
                        >
                          <img
                            src={image.url}
                            alt={image.originalName || '기존 사진'}
                            className="h-14 w-14 rounded-[8px] object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-stone-800">{image.originalName || '기존 사진'}</p>
                            <p className="text-xs font-semibold text-stone-500">기존 첨부</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExistingImage(image.id)}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-red-600"
                            aria-label="기존 사진 제거"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                {imageFiles.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {imageFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center gap-3 rounded-[10px] bg-white p-2 ring-1 ring-stone-200"
                      >
                        <AttachedImagePreview file={file} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-stone-800">{file.name || '붙여넣은 이미지'}</p>
                          <p className="text-xs font-semibold text-stone-500">{formatBytes(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImageFile(index)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-red-600"
                          aria-label="첨부 사진 제거"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {postError && (
              <p className="mt-3 rounded-[8px] bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {postError}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {colorOptions.map((color) => (
                <button
                  type="button"
                  key={color.value}
                  onClick={() => setForm({ ...form, color: color.value })}
                  className={`h-9 w-9 rounded-full border-2 ${
                    form.color === color.value ? 'border-stone-900' : 'border-white'
                  }`}
                  style={{ background: color.swatch }}
                  aria-label={color.name}
                />
              ))}
            </div>
            <button
              type="submit"
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-stone-900 font-bold text-white"
            >
              <Send size={18} />
              {editingPost ? '수정 저장' : '올리기'}
            </button>
          </form>
        </div>
      )}

      {shareOpen && canManageWall && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-stone-950/45 px-4">
          <section className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[18px] bg-white p-5 shadow-paper">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">담벼락 공유</h2>
              <button
                type="button"
                onClick={() => {
                  setShareOpen(false);
                  setQrPreviewOpen(false);
                }}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="공유 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setQrPreviewOpen(true)}
              className="mt-5 grid w-full place-items-center rounded-[16px] bg-stone-50 p-4 transition hover:bg-stone-100"
              aria-label="QR 코드 크게 보기"
            >
              <QRCodeSVG value={shareUrl} size={180} />
              <span className="mt-2 text-xs font-bold text-stone-500">
                QR 코드를 누르면 크게 볼 수 있습니다.
              </span>
            </button>

            <div className="mt-4 rounded-[12px] border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <p className="font-bold text-stone-900">공유 링크</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 break-all">{shareUrl}</p>
                <button
                  type="button"
                  onClick={() => copyShareUrl(shareUrl, '메인 링크')}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-stone-900 px-3 py-2 text-xs font-bold text-white"
                >
                  <Copy size={13} />
                  복사
                </button>
              </div>
              <label className="mt-3 flex items-center justify-between gap-4 rounded-[10px] bg-white/70 px-3 py-3">
                <span>
                  <b className="block text-sm text-stone-900">로그인 필요</b>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">
                    <span className="block">켜면 계정이 있는 학생만 참여할 수 있습니다.</span>
                    <span className="block">끄면 링크가 있는 사람 누구나 글을 쓸 수 있습니다.</span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={wall?.accessMode === 'login'}
                  onChange={(event) => updateShareAccessMode(event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-stone-900"
                />
              </label>
            </div>

            <div className="mt-4 rounded-[12px] border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              <div className="flex items-center justify-between gap-4">
                <span>
                  <b className="block font-bold text-stone-900">공개보기 링크</b>
                  <span className="text-xs text-stone-500">글쓰기 없이 보기만 가능한 링크</span>
                </span>
                <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-[9px] border border-stone-200 bg-white p-0.5">
                  {[
                    [false, '비활성화'],
                    [true, '활성화']
                  ].map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => updatePublicViewEnabled(value)}
                      className={`rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${
                        publicViewEnabled === value
                          ? 'bg-stone-900 text-white'
                          : 'text-stone-500 hover:text-stone-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {publicViewEnabled && (
                <div className="mt-3 space-y-2">
                  {[
                    ['visible', '학생 이름 공개'],
                    ['hidden', '학생 이름 비공개']
                  ].map(([authors, label]) => {
                    const url = publicViewShareUrl(authors);
                    return (
                      <div
                        key={authors}
                        className="flex items-center gap-2 rounded-[10px] bg-white/70 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-stone-800">{label}</p>
                          <p className="truncate text-xs text-stone-500">{url}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyShareUrl(url, `${label} 공개보기 링크`)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-stone-200 px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                        >
                          <Copy size={13} />
                          복사
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {columnModeEnabled && (
              <div className="mt-4 rounded-[12px] border border-stone-200 bg-stone-50 p-3">
                <p className="text-sm font-bold text-stone-900">
                  {'\uCEEC\uB7FC\uBCC4 \uACF5\uC720 \uB9C1\uD06C'}
                </p>
                <div className="mt-3 space-y-2">
                  {columnNumbers.map((column) => (
                    <div
                      key={column}
                      className="flex items-center gap-2 rounded-[10px] bg-white/70 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-stone-800">
                          {columnName(wall, column) || `${column}\uBC88 \uCEEC\uB7FC`}
                        </p>
                        <p className="truncate text-xs text-stone-500">{columnShareUrl(column)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyShareUrl(columnShareUrl(column), `${columnName(wall, column) || `${column}번 컬럼`} 링크`)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-stone-200 px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
                      >
                        <Copy size={13} />
                        {'\uBCF5\uC0AC'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shareMessage && (
              <p className="mt-3 rounded-[8px] bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                {shareMessage}
              </p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setShareOpen(false);
                  setQrPreviewOpen(false);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-stone-300 px-4 py-3 text-sm font-bold text-stone-700"
              >
                닫기
              </button>
            </div>
          </section>
        </div>
      )}

      {qrPreviewOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-stone-950/65 px-4">
          <section className="w-full max-w-sm rounded-[18px] bg-white p-6 text-center shadow-soft">
            <div className="flex items-center justify-between text-left">
              <h2 className="text-xl font-bold text-stone-950">QR 코드</h2>
              <button
                type="button"
                onClick={() => setQrPreviewOpen(false)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="QR 크게보기 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid place-items-center rounded-[16px] bg-stone-50 p-5">
              <QRCodeSVG value={shareUrl} size={280} />
            </div>
            <p className="mt-3 break-all text-xs text-stone-500">{shareUrl}</p>
          </section>
        </div>
      )}
    </main>
  );
}
