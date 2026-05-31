import { Globe2, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import Field from '../components/Field.jsx';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createUser, makePassword } from '../lib/auth';
import { deleteUser, subscribeUsers, updateUser } from '../lib/firestore';
import { dateText } from '../lib/ui';

export default function AdminPage() {
  const { displayId } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState({
    id: '',
    password: makePassword(),
    displayName: ''
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    return subscribeUsers({ role: 'teacher' }, setTeachers);
  }, []);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    await createUser(form.id.trim(), form.password, 'teacher', {
      displayName: form.displayName.trim() || form.id.trim()
    });
    setMessage(`${form.id} 교사 계정을 발급했습니다.`);
    setForm({ id: '', password: makePassword(), displayName: '' });
  }

  async function toggleHtmlHosting(teacher, canHostHtml) {
    setMessage('');
    setTeachers((current) =>
      current.map((item) => (item.uid === teacher.uid ? { ...item, canHostHtml } : item))
    );

    try {
      const data = await updateUser(teacher.uid, { canHostHtml });
      setTeachers((current) =>
        current.map((item) => (item.uid === teacher.uid ? { ...item, ...data.user } : item))
      );
    } catch {
      setTeachers((current) =>
        current.map((item) =>
          item.uid === teacher.uid ? { ...item, canHostHtml: teacher.canHostHtml } : item
        )
      );
      setMessage('HTML 호스팅 권한을 변경하지 못했습니다. 서버 실행 상태를 확인해 주세요.');
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
      </div>
    </Layout>
  );
}
