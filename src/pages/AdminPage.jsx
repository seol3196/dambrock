import { Database, Globe2, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Field from '../components/Field.jsx';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createUser, makePassword } from '../lib/auth';
import { deleteUser, subscribeUsers, updateUser } from '../lib/firestore';
import { dateText } from '../lib/ui';

function bytesToGb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024 / 1024) * 10) / 10;
}

function gbToBytes(gb) {
  return Math.floor(Number(gb || 0) * 1024 * 1024 * 1024);
}

function storageText(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (value >= 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${value}B`;
}

export default function AdminPage() {
  const { displayId } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const teachers = useMemo(() => accounts.filter((account) => account.role === 'teacher'), [accounts]);
  const storageAccounts = useMemo(
    () =>
      teachers.sort((a, b) =>
        (a.displayName || a.id).localeCompare(b.displayName || b.id, 'ko')
      ),
    [teachers]
  );
  const [form, setForm] = useState({
    id: '',
    password: makePassword(),
    displayName: '',
    storageLimitGb: 10
  });
  const [storageDrafts, setStorageDrafts] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    return subscribeUsers({}, setAccounts);
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    await createUser(form.id.trim(), form.password, 'teacher', {
      displayName: form.displayName.trim() || form.id.trim(),
      storageLimitBytes: gbToBytes(form.storageLimitGb)
    });
    setMessage(`${form.id} 교사 계정을 발급했습니다.`);
    setForm({ id: '', password: makePassword(), displayName: '', storageLimitGb: 10 });
  }

  async function toggleHtmlHosting(teacher, canHostHtml) {
    setMessage('');
    setAccounts((current) =>
      current.map((item) => (item.uid === teacher.uid ? { ...item, canHostHtml } : item))
    );

    try {
      const data = await updateUser(teacher.uid, { canHostHtml });
      setAccounts((current) =>
        current.map((item) => (item.uid === teacher.uid ? { ...item, ...data.user } : item))
      );
    } catch {
      setAccounts((current) =>
        current.map((item) =>
          item.uid === teacher.uid ? { ...item, canHostHtml: teacher.canHostHtml } : item
        )
      );
      setMessage('HTML 호스팅 권한을 변경하지 못했습니다. 서버 실행 상태를 확인해 주세요.');
    }
  }

  async function saveStorageLimit(account) {
    const draft = storageDrafts[account.uid] ?? bytesToGb(account.storageLimitBytes);
    const nextBytes = gbToBytes(draft);
    if (nextBytes < Number(account.storageUsedBytes || 0)) {
      setMessage('현재 사용량보다 작은 용량은 할당할 수 없습니다.');
      return;
    }
    setMessage('');
    try {
      const data = await updateUser(account.uid, { storageLimitBytes: nextBytes });
      setAccounts((current) =>
        current.map((item) =>
          item.uid === account.uid
            ? { ...item, ...data.user, storageLimitBytes: nextBytes }
            : item
        )
      );
      setStorageDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        delete nextDrafts[account.uid];
        return nextDrafts;
      });
      setMessage(`${account.displayName || account.id} 계정의 저장 용량을 변경했습니다.`);
    } catch (error) {
      setMessage(
        error?.code === 'storage-limit-below-used'
          ? '현재 사용량보다 작은 용량은 할당할 수 없습니다.'
          : '저장 용량을 변경하지 못했습니다.'
      );
    }
  }

  return (
    <Layout badge="관리자 모드" title="교사 계정 발급" userLabel={displayId}>
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="rounded-[8px] bg-white/90 p-5 shadow-soft">
          <h2 className="text-xl font-bold">새 교사 추가</h2>
          <div className="mt-5 space-y-4">
            <Field label="교사 ID">
              <input
                required
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                placeholder="teacher_kim"
              />
            </Field>
            <Field label="비밀번호">
              <div className="flex gap-2">
                <input
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="h-11 min-w-0 flex-1 rounded-[8px] border border-stone-200 px-3"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, password: makePassword() })}
                  className="rounded-[8px] border border-stone-300 px-3"
                  aria-label="비밀번호 자동 생성"
                >
                  <Wand2 size={18} />
                </button>
              </div>
            </Field>
            <Field label="교사 이름">
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                placeholder="김선생님"
              />
            </Field>
            <Field label="저장 용량">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.storageLimitGb}
                  onChange={(e) => setForm({ ...form, storageLimitGb: e.target.value })}
                  className="h-11 min-w-0 flex-1 rounded-[8px] border border-stone-200 px-3"
                />
                <span className="text-sm font-bold text-stone-600">GB</span>
              </div>
            </Field>
          </div>
          <button
            type="submit"
            className="mt-5 h-11 w-full rounded-[8px] bg-stone-900 font-bold text-white"
          >
            교사 계정 발급
          </button>
          {message && <p className="mt-3 text-sm font-bold text-emerald-700">{message}</p>}
          <p className="mt-3 text-sm leading-6 text-stone-600">
            필요하면 발급 후 교사가 비밀번호를 직접 변경할 수 있습니다.
          </p>
        </form>

        <section className="rounded-[8px] bg-white/90 p-5 shadow-soft">
          <h2 className="text-xl font-bold">등록된 교사</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {teachers.map((teacher) => (
              <article
                key={teacher.uid}
                className="rounded-[8px] border border-stone-200 bg-amber-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{teacher.displayName}</h3>
                    <p className="text-sm text-stone-600">{teacher.id}</p>
                    <p className="mt-2 text-xs text-stone-500">
                      가입일 {dateText(teacher.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteUser(teacher.uid)}
                    className="rounded-full bg-white p-2 text-stone-500 hover:text-red-600"
                    aria-label="교사 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <label className="mt-4 flex items-center justify-between gap-3 rounded-[8px] bg-white/75 px-3 py-2">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-stone-700">
                    <Globe2 size={16} />
                    HTML 호스팅
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(teacher.canHostHtml)}
                    onChange={(event) => toggleHtmlHosting(teacher, event.target.checked)}
                  />
                </label>
              </article>
            ))}
            {!teachers.length && (
              <p className="text-sm text-stone-500">등록된 교사 계정이 아직 없습니다.</p>
            )}
          </div>
        </section>

        <section className="rounded-[8px] bg-white/90 p-5 shadow-soft xl:col-span-2">
          <h2 className="text-xl font-bold">교사별 사진 저장 용량</h2>
          <p className="mt-1 text-sm text-stone-500">
            학생이 올린 사진도 해당 담벼락을 만든 교사의 저장 용량을 사용합니다.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {storageAccounts.map((account) => {
              const used = Number(account.storageUsedBytes || 0);
              const limit = Number(account.storageLimitBytes || 0);
              const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
              return (
                <article
                  key={account.uid}
                  className="rounded-[8px] border border-stone-200 bg-stone-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold">{account.displayName || account.id}</h3>
                      <p className="text-sm text-stone-600">{account.id} · 교사</p>
                    </div>
                    <Database size={18} className="mt-1 shrink-0 text-stone-500" />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-stone-900" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-stone-600">
                    현재 사용량 {storageText(used)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-stone-600">
                    할당 용량 {storageText(limit)}
                  </p>
                  <label className="mt-3 block text-xs font-black text-stone-500">
                    할당 용량 수정
                  </label>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={storageDrafts[account.uid] ?? bytesToGb(account.storageLimitBytes)}
                      onChange={(event) =>
                        setStorageDrafts((drafts) => ({
                          ...drafts,
                          [account.uid]: event.target.value
                        }))
                      }
                      className="h-10 min-w-0 flex-1 rounded-[8px] border border-stone-200 bg-white px-3 text-sm"
                    />
                    <span className="text-sm font-bold text-stone-600">GB</span>
                    <button
                      type="button"
                      onClick={() => saveStorageLimit(account)}
                      className="h-10 rounded-[8px] bg-stone-900 px-3 text-sm font-bold text-white"
                    >
                      저장
                    </button>
                  </div>
                </article>
              );
            })}
            {!storageAccounts.length && (
              <p className="text-sm text-stone-500">관리할 교사 계정이 아직 없습니다.</p>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
