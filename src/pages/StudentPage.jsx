import { ExternalLink, NotebookPen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { subscribeWalls } from '../lib/firestore';
import { pickRandomQuote } from '../lib/quotes';
import { wallTone } from '../lib/ui';

export default function StudentPage() {
  const { profile, displayId } = useAuth();
  const [walls, setWalls] = useState([]);
  const studentName = profile?.displayName || displayId;
  const quote = useMemo(() => pickRandomQuote(), []);

  useEffect(() => {
    if (!profile?.teacherId) return undefined;
    return subscribeWalls({ ownerId: profile.teacherId }, setWalls);
  }, [profile?.teacherId]);

  function canSeeWall(wall) {
    if (wall.visibleToStudents === false) return false;
    const visibleClassIds = Array.isArray(wall.visibleClassIds) ? wall.visibleClassIds : [];
    if (!visibleClassIds.length) return true;
    return Boolean(profile?.classId && visibleClassIds.includes(profile.classId));
  }

  const sortedWalls = useMemo(
    () =>
      [...walls]
        .filter(canSeeWall)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [profile?.classId, walls]
  );

  return (
    <Layout
      badge="학생 모드"
      title={`안녕, ${studentName}!`}
      subtitle={quote}
      userLabel={studentName}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
        <section className="rounded-[18px] border border-white/60 bg-white/92 p-6 shadow-soft">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-700">
                Class Walls
              </p>
              <h2 className="mt-2 text-3xl font-bold text-stone-950">
                참여할 담벼락
              </h2>
              <p className="mt-2 text-stone-600">
                선생님이 열어둔 담벼락에 들어가 글을 남기고 친구들과 함께 읽어보세요.
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-stone-700">
              현재 {sortedWalls.length}개의 담벼락에 참여할 수 있어요.
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {sortedWalls.map((wall) => (
              <Link
                key={wall.id}
                to={`/wall/${wall.id}`}
                className={`group block rounded-[18px] border border-stone-200/80 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-soft ${wallTone(
                  wall.id
                )}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <NotebookPen className="mt-1 text-stone-700" size={22} />
                  <ExternalLink
                    size={18}
                    className="shrink-0 text-stone-500 transition group-hover:text-stone-900"
                  />
                </div>
                <h3 className="mt-6 text-2xl font-bold leading-tight text-stone-950">
                  {wall.title}
                </h3>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-700">
                  {wall.description || '설명이 아직 없는 담벼락입니다.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-stone-700">
                    {wall.accessMode === 'login' ? '로그인 필요' : '링크만 있으면 참여 가능'}
                  </span>
                  {wall.commentsEnabled && (
                    <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-stone-700">
                      댓글 가능
                    </span>
                  )}
                  {wall.likesEnabled && (
                    <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-stone-700">
                      좋아요 가능
                    </span>
                  )}
                </div>
              </Link>
            ))}
            {!sortedWalls.length && (
              <div className="rounded-[18px] border border-dashed border-stone-300 bg-stone-50 p-8 text-stone-600">
                아직 참여할 담벼락이 없습니다.
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-[18px] border border-white/60 bg-white/88 p-6 shadow-soft">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-700">
            Quick Guide
          </p>
          <h3 className="mt-2 text-2xl font-bold text-stone-950">참여 방법</h3>
          <ol className="mt-5 space-y-4 text-sm leading-6 text-stone-700">
            <li className="rounded-2xl bg-stone-50 p-4">
              1. 들어가고 싶은 담벼락 카드를 눌러요.
            </li>
            <li className="rounded-2xl bg-stone-50 p-4">
              2. 오른쪽 아래 버튼으로 새 포스트잇을 작성해요.
            </li>
            <li className="rounded-2xl bg-stone-50 p-4">
              3. 링크를 적으면 자동으로 클릭 가능한 주소로 바뀝니다.
            </li>
            <li className="rounded-2xl bg-stone-50 p-4">
              4. 내가 쓴 글은 수정 버튼으로 다시 고칠 수 있어요.
            </li>
          </ol>
        </aside>
      </div>
    </Layout>
  );
}
