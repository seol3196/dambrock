import {
  ExternalLink,
  GripVertical,
  Heart,
  MessageCircle,
  Pencil,
  Trash2
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { deletePost, toggleLike } from '../lib/firestore';
import { dateText, parseTextSegments } from '../lib/ui';
import CommentBox from './CommentBox.jsx';

export default function PostCard({
  post,
  wall,
  isTeacherView = false,
  canDragPost = false,
  readOnly = false,
  dropPreview,
  onDragStart,
  onDragEnd,
  onDragPreview,
  onEditPost,
  onDropOnPost
}) {
  const { user, role } = useAuth();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const isMyPost = Boolean(!readOnly && user && post.authorId === user.uid);
  const liked = Boolean(user && post.likedBy?.[user.uid]);
  const likeCount = post.likeCount || Object.keys(post.likedBy || {}).length;
  const canDelete =
    !readOnly &&
    user &&
    (post.authorId === user.uid || (role === 'teacher' && wall.ownerId === user.uid));
  const canEdit = Boolean(
    !readOnly &&
      user &&
      (post.authorId === user.uid || (role === 'teacher' && wall.ownerId === user.uid))
  );
  const canDrag = Boolean(
    !readOnly &&
      (canDragPost || (isTeacherView && role === 'teacher' && wall.ownerId === user.uid))
  );
  const isWorksheetPost = wall.postMode === 'worksheet';
  const worksheetFields = Array.isArray(wall.postTemplate?.fields) ? wall.postTemplate.fields : [];
  const imagesByField = new Map(
    (post.images || [])
      .filter((image) => image.fieldId)
      .map((image) => [image.fieldId, image])
  );
  const freeImages = (post.images || []).filter((image) => !image.fieldId);
  const canSeeHiddenAuthorNames = Boolean(
    !readOnly && role === 'teacher' && user?.uid === wall.ownerId
  );
  const authorLabel =
    wall.showAuthorNames !== false || canSeeHiddenAuthorNames
      ? post.authorName || '익명'
      : post.authorId === wall.ownerId
        ? '선생님'
        : '비공개';

  async function handleLike() {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    await toggleLike(post.id);
  }

  return (
    <article
      draggable={canDrag}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', post.id);
        onDragStart?.(post);
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(event) => {
        if (!canDrag) return;
        event.preventDefault();
        event.stopPropagation();
        const { top, height } = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY < top + height / 2 ? 'before' : 'after';
        onDragPreview?.(post, placement);
      }}
      onDrop={(event) => {
        if (!canDrag) return;
        event.preventDefault();
        event.stopPropagation();
        const { top, height } = event.currentTarget.getBoundingClientRect();
        const placement = event.clientY < top + height / 2 ? 'before' : 'after';
        onDropOnPost?.(post, placement);
      }}
      className={`paper-edge fade-pop relative w-full rounded-[10px] border border-stone-900/5 ${
        post.color || 'bg-yellow-100'
      } p-4 shadow-paper ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${
        isMyPost ? 'ring-2 ring-teal-700/15' : ''
      }`}
    >
      {dropPreview === 'before' && (
        <div className="pointer-events-none absolute -top-2 left-2 right-2 h-1 rounded-full bg-stone-500/45 shadow-sm" />
      )}
      {dropPreview === 'after' && (
        <div className="pointer-events-none absolute -bottom-2 left-2 right-2 h-1 rounded-full bg-stone-500/45 shadow-sm" />
      )}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-1 text-stone-500">
          {canDrag && (
            <>
              <GripVertical size={16} />
              <span className="text-xs font-bold">드래그 이동</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isMyPost && (
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-black text-teal-700">
              내 글
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              aria-label="게시글 수정"
              onClick={() => onEditPost?.(post)}
              className="rounded-full bg-white/75 p-1.5 text-stone-600 hover:text-stone-950"
            >
              <Pencil size={15} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              aria-label="게시글 삭제"
              onClick={() => setDeleteConfirmOpen(true)}
              className="rounded-full bg-white/75 p-1.5 text-stone-500 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {isWorksheetPost ? (
        <div className="space-y-3">
          {worksheetFields
            .filter((field) =>
              field.type === 'image'
                ? imagesByField.has(field.id)
                : String(post.templateAnswers?.[field.id] || '').trim()
            )
            .map((field) => {
              const image = field.type === 'image' ? imagesByField.get(field.id) : null;
              return (
                <section key={field.id} className="rounded-[8px] bg-white/45 px-3 py-2">
                  <h3 className="text-xs font-black text-stone-500">
                    {field.label}
                  </h3>
                  {image ? (
                    <a
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block overflow-hidden rounded-[10px] bg-white/55 ring-1 ring-stone-900/10"
                    >
                      <img
                        src={image.url}
                        alt={image.originalName || field.label}
                        className="max-h-[420px] w-full object-contain"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[1.02rem] font-semibold leading-7 text-stone-900">
                      {post.templateAnswers[field.id]}
                    </p>
                  )}
                </section>
              );
            })}
        </div>
      ) : (
        <div>
          <p className="whitespace-pre-wrap break-words text-[1.03rem] font-medium leading-7 text-stone-900">
            {parseTextSegments(post.content).map((segment, index) =>
              segment.type === 'link' ? (
                <a
                  key={`${segment.value}-${index}`}
                  href={segment.value}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all font-semibold text-sky-800 underline underline-offset-2"
                >
                  {segment.value}
                  <ExternalLink size={14} />
                </a>
              ) : (
                <span key={`${segment.value}-${index}`}>{segment.value}</span>
              )
            )}
          </p>
        </div>
      )}

      {!isWorksheetPost && freeImages.length > 0 && (
        <div className="mt-4 grid gap-2">
          {freeImages.map((image) => (
            <a
              key={image.id}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-[10px] bg-white/55 ring-1 ring-stone-900/10"
            >
              <img
                src={image.url}
                alt={image.originalName || '첨부 사진'}
                className="max-h-[420px] w-full object-contain"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}

      <footer className="mt-5 flex items-center justify-between gap-3 text-sm text-stone-700">
        <span className={`font-semibold ${wall.showAuthorNames === false && !canSeeHiddenAuthorNames ? 'text-stone-500' : ''}`}>
          {authorLabel}
        </span>
        <span>{dateText(post.createdAt)}</span>
      </footer>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-900/10 pt-3">
        {wall.likesEnabled && !readOnly && (
          <button
            type="button"
            onClick={handleLike}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold ${
              liked ? 'bg-rose-500 text-white' : 'bg-white/75 text-stone-700'
            }`}
          >
            <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
            {likeCount}
          </button>
        )}
        {wall.likesEnabled && readOnly && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/75 px-3 py-1.5 text-sm font-bold text-stone-700">
            <Heart size={15} />
            {likeCount}
          </span>
        )}
        {wall.commentsEnabled && (
          <button
            type="button"
            onClick={() => setCommentsOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-full bg-white/75 px-3 py-1.5 text-sm font-bold text-stone-700"
          >
            <MessageCircle size={15} />
            댓글
          </button>
        )}
      </div>
      {commentsOpen && (
        <CommentBox
          postId={post.id}
          showAuthorNames={wall.showAuthorNames !== false}
          ownerId={wall.ownerId}
          revealHiddenAuthorNames={canSeeHiddenAuthorNames}
          readOnly={readOnly}
        />
      )}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/45 px-4">
          <section className="w-full max-w-sm rounded-[16px] bg-white p-5 text-stone-900 shadow-soft">
            <h2 className="text-lg font-bold">정말로 삭제하시겠습니까?</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              삭제한 포스트잇은 되돌릴 수 없습니다.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await deletePost(post.id);
                  setDeleteConfirmOpen(false);
                }}
                className="flex-1 rounded-[10px] bg-red-500 px-4 py-3 text-sm font-bold text-white hover:bg-red-600"
              >
                예
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 rounded-[10px] border border-stone-300 px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50"
              >
                아니오
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
