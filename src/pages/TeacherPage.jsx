import {
  Copy,
  Code2,
  Database,
  ExternalLink,
  Folder,
  FolderPlus,
  GraduationCap,
  Globe2,
  KeyRound,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Field from '../components/Field.jsx';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { createUser } from '../lib/auth';
import {
  createWall,
  createWallFolder,
  createHtmlSite,
  deleteHtmlSite,
  deleteWallFolder,
  deleteStudentAccount,
  deleteStudentAccounts,
  deleteWall,
  setStudentPasswords,
  subscribeUsers,
  subscribeHtmlSites,
  subscribeWallFolders,
  subscribeWalls,
  updateUser,
  updateWall,
  updateWallFolder
} from '../lib/firestore';
import { pickRandomQuote } from '../lib/quotes';
import { dateText, paddedNumber } from '../lib/ui';

const RESET_PASSWORD = '123456';
const INITIAL_WALL_LIST_COUNT = 24;
const SIDEBAR_ICON_PROPS = { size: 18, strokeWidth: 2.2 };
const DEFAULT_WALL_CARD_COLOR = '#fff8d6';
const FOLDER_COLOR_OPTIONS = [
  { name: '기본', value: '', swatch: '' },
  { name: '분홍', value: '#fde8ef', swatch: '#fde8ef' },
  { name: '살구', value: '#fdebd8', swatch: '#fdebd8' },
  { name: '노랑', value: '#fff4c6', swatch: '#fff4c6' },
  { name: '세이지', value: '#e8f3d8', swatch: '#e8f3d8' },
  { name: '민트', value: '#def3e8', swatch: '#def3e8' },
  { name: '하늘', value: '#e3f0fb', swatch: '#e3f0fb' },
  { name: '라벤더', value: '#eee8fb', swatch: '#eee8fb' },
  { name: '모래', value: '#f3ead8', swatch: '#f3ead8' }
];
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

function folderColorValue(value) {
  const color = String(value || '').trim().toLowerCase();
  return LEGACY_FOLDER_COLOR_MAP[color] || color;
}

function storageText(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)}MB`;
  if (value >= 1024) return `${Math.ceil(value / 1024)}KB`;
  return `${value}B`;
}

export default function TeacherPage() {
  const { user, displayId, profile } = useAuth();
  const [tab, setTab] = useState('walls');
  const [students, setStudents] = useState([]);
  const [walls, setWalls] = useState([]);
  const [folders, setFolders] = useState([]);
  const [htmlSites, setHtmlSites] = useState([]);
  const [studentForm, setStudentForm] = useState({
    prefix: 'class_',
    start: '01',
    end: '30',
    password: RESET_PASSWORD,
    nameList: ''
  });
  const [singleStudentForm, setSingleStudentForm] = useState({
    id: '',
    displayName: '',
    password: RESET_PASSWORD
  });
  const [wallForm, setWallForm] = useState({
    title: '',
    description: '',
    accessMode: 'login',
    commentsEnabled: true,
    likesEnabled: true,
    showAuthorNames: true,
    visibleToStudents: true,
    publicViewEnabled: false,
    folderId: null,
    columnModeEnabled: false,
    imageUploadsEnabled: true,
    postMode: 'free',
    postTemplate: {
      fields: [
        { id: 'field_1', label: '질문 1', type: 'shortText', required: true },
        { id: 'field_2', label: '질문 2', type: 'longText', required: true }
      ]
    }
  });
  const quote = useMemo(() => pickRandomQuote(), []);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const storageUsedBytes = Number(profile?.storageUsedBytes || 0);
  const storageLimitBytes = Number(profile?.storageLimitBytes || 0);
  const storagePercent =
    storageLimitBytes > 0 ? Math.min(100, Math.round((storageUsedBytes / storageLimitBytes) * 100)) : 0;

  useEffect(() => {
    const unsubStudents = subscribeUsers(
      { role: 'student', teacherId: user.uid },
      setStudents
    );
    const unsubWalls = subscribeWalls({ ownerId: user.uid }, setWalls);
    const unsubFolders = subscribeWallFolders({ ownerId: user.uid }, setFolders);
    const unsubHtmlSites = profile?.canHostHtml
      ? subscribeHtmlSites(setHtmlSites, () => setHtmlSites([]))
      : () => setHtmlSites([]);

    return () => {
      unsubStudents();
      unsubWalls();
      unsubFolders();
      unsubHtmlSites();
    };
  }, [profile?.canHostHtml, user.uid]);

  useEffect(() => {
    if (tab === 'html' && !profile?.canHostHtml) setTab('walls');
  }, [profile?.canHostHtml, tab]);

  const aside = (
    <aside className="rounded-[8px] bg-white/85 p-3 shadow-soft">
      <div>
        <button
          type="button"
          onClick={() => setTab('walls')}
          className={`flex h-11 w-full items-center gap-2 rounded-[8px] px-3 font-bold ${
            tab === 'walls' ? 'bg-stone-900 text-white' : 'text-stone-700'
          }`}
        >
          <LayoutDashboard {...SIDEBAR_ICON_PROPS} />
          내 담벼락
        </button>
        <button
          type="button"
          onClick={() => setTab('students')}
          className={`mt-2 flex h-11 w-full items-center gap-2 rounded-[8px] px-3 font-bold ${
            tab === 'students' ? 'bg-stone-900 text-white' : 'text-stone-700'
          }`}
        >
          <GraduationCap {...SIDEBAR_ICON_PROPS} />
          학생 관리
        </button>
        {profile?.canHostHtml && (
          <button
            type="button"
            onClick={() => setTab('html')}
            className={`mt-2 flex h-11 w-full items-center gap-2 rounded-[8px] px-3 font-bold ${
              tab === 'html' ? 'bg-stone-900 text-white' : 'text-stone-700'
            }`}
          >
            <Code2 {...SIDEBAR_ICON_PROPS} />
            HTML 호스팅
          </button>
        )}
      </div>

      <section className="mt-4 rounded-[8px] border border-stone-200 bg-stone-50 p-3">
        <div className="flex items-center gap-2 text-sm font-black text-stone-800">
          <Database {...SIDEBAR_ICON_PROPS} />
          사진 저장 공간
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-stone-900" style={{ width: `${storagePercent}%` }} />
        </div>
        <p className="mt-2 whitespace-nowrap text-xs font-bold text-stone-600">
          사용량 {storageText(storageUsedBytes)} / {storageText(storageLimitBytes)}
        </p>
      </section>
    </aside>
  );

  async function createStudents(event) {
    event.preventDefault();

    const password = String(studentForm.password).trim();
    const prefix = studentForm.prefix.trim();
    const names = String(studentForm.nameList)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const start = Number(studentForm.start);
    const end = Number(studentForm.end);

    if (password.length < 6) {
      alert('학생 비밀번호는 6자 이상이어야 합니다.');
      return false;
    }

    if (!prefix) {
      alert('학생 ID 접두어를 입력해 주세요.');
      return false;
    }

    if (!Number.isInteger(start) || start < 0) {
      alert('시작 번호를 다시 확인해 주세요.');
      return false;
    }

    if (!names.length && (!Number.isInteger(end) || end < 0 || start > end)) {
      alert('시작 번호와 끝 번호를 다시 확인해 주세요.');
      return false;
    }

    const lastNumber = names.length ? start + names.length - 1 : end;
    const width = Math.max(
      studentForm.start.length,
      studentForm.end.length,
      String(lastNumber).length,
      2
    );
    const studentEntries = names.length
      ? names.map((studentName, index) => ({
          serial: paddedNumber(start + index, width),
          displayName: studentName
        }))
      : Array.from({ length: end - start + 1 }, (_, index) => {
          const number = start + index;
          const serial = paddedNumber(number, width);
          const id = `${prefix}${serial}`;
          return {
            serial,
            displayName: id
          };
        });

    try {
      for (const studentEntry of studentEntries) {
        const id = `${prefix}${studentEntry.serial}`;
        await createUser(id, password, 'student', {
          displayName: studentEntry.displayName,
          teacherId: user.uid,
          passwordHint: password
        });
      }

      alert('학생 계정을 생성했습니다.');
      setStudentForm((prev) => ({
        ...prev,
        nameList: names.length ? '' : prev.nameList
      }));
      return true;
    } catch (error) {
      const message =
        error?.code === 'auth/email-already-in-use'
          ? '이미 존재하는 학생 ID가 포함되어 있습니다.'
          : error?.message || '학생 계정 생성 중 오류가 발생했습니다.';
      alert(message);
      return false;
    }
  }

  async function createSingleStudent(event) {
    event.preventDefault();

    const id = String(singleStudentForm.id).trim();
    const displayName = String(singleStudentForm.displayName).trim();
    const password = String(singleStudentForm.password).trim();

    if (!id) {
      alert('학생 ID를 입력해 주세요.');
      return false;
    }
    if (!displayName) {
      alert('학생 이름을 입력해 주세요.');
      return false;
    }
    if (password.length < 6) {
      alert('학생 비밀번호는 6자 이상이어야 합니다.');
      return false;
    }

    try {
      await createUser(id, password, 'student', {
        displayName,
        teacherId: user.uid,
        passwordHint: password
      });
      alert('학생 계정을 생성했습니다.');
      setSingleStudentForm({
        id: '',
        displayName: '',
        password: RESET_PASSWORD
      });
      return true;
    } catch (error) {
      const message =
        error?.code === 'auth/email-already-in-use'
          ? '이미 존재하는 학생 ID입니다.'
          : error?.message || '학생 계정 생성 중 오류가 발생했습니다.';
      alert(message);
      return false;
    }
  }

  async function submitWall(event) {
    event.preventDefault();
    const data = await createWall({
      ...wallForm,
      ownerId: user.uid,
      ownerName: profile?.displayName || displayId
    });
    setWallForm({
      title: '',
      description: '',
      accessMode: 'login',
      commentsEnabled: true,
      likesEnabled: true,
      showAuthorNames: true,
      visibleToStudents: true,
      publicViewEnabled: false,
      folderId: null,
      columnModeEnabled: false,
      imageUploadsEnabled: true,
      postMode: 'free',
      postTemplate: {
        fields: [
          { id: 'field_1', label: '질문 1', type: 'shortText', required: true },
          { id: 'field_2', label: '질문 2', type: 'longText', required: true }
        ]
      }
    });
    return data;
  }

  return (
    <Layout
      badge="교사 모드"
      title={`${profile?.displayName || displayId} 선생님`}
      subtitle={quote}
      userLabel={displayId}
      aside={aside}
    >
      {tab === 'students' ? (
        <StudentManager
          form={studentForm}
          setForm={setStudentForm}
          submit={createStudents}
          singleForm={singleStudentForm}
          setSingleForm={setSingleStudentForm}
          submitSingle={createSingleStudent}
          students={students}
        />
      ) : tab === 'html' && profile?.canHostHtml ? (
        <HtmlHostingManager sites={htmlSites} origin={origin} />
      ) : (
        <WallManager
          form={wallForm}
          setForm={setWallForm}
          submit={submitWall}
          walls={walls}
          folders={folders}
          origin={origin}
        />
      )}
    </Layout>
  );
}

function StudentManager({
  form,
  setForm,
  submit,
  singleForm,
  setSingleForm,
  submitSingle,
  students
}) {
  const [editingUid, setEditingUid] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [passwordUid, setPasswordUid] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [selectedUids, setSelectedUids] = useState([]);
  const [batchPassword, setBatchPassword] = useState('');
  const [studentCreateMode, setStudentCreateMode] = useState(null);

  const sorted = useMemo(
    () =>
      [...students].sort((a, b) =>
        (a.displayName || a.id).localeCompare(b.displayName || b.id, 'ko')
      ),
    [students]
  );
  const selectedCount = selectedUids.length;
  const allSelected = sorted.length > 0 && selectedCount === sorted.length;

  useEffect(() => {
    setSelectedUids((current) =>
      current.filter((uid) => sorted.some((student) => student.uid === uid))
    );
  }, [sorted]);

  async function saveStudentName(student) {
    const nextName = nameDraft.trim();
    if (!nextName) return;
    await updateUser(student.uid, { displayName: nextName });
    setEditingUid(null);
    setNameDraft('');
  }

  function functionErrorMessage(error, fallback) {
    const code = error?.code || '';
    const message = String(error?.message || '');

    if (code.includes('unimplemented') || code.includes('request-failed')) {
      return '로컬 서버 요청을 처리하지 못했습니다. 서버 실행 상태를 확인해 주세요.';
    }
    if (code.includes('permission-denied')) {
      return '권한이 없습니다. 다시 로그인한 뒤 시도해 주세요.';
    }
    if (code.includes('unauthenticated')) {
      return '로그인 상태가 만료되었습니다. 다시 로그인해 주세요.';
    }
    if (message.includes('CORS') || message.includes('Failed to fetch')) {
      return '로컬 API 서버에 연결하지 못했습니다. 서버 포트와 실행 상태를 확인해 주세요.';
    }
    return fallback;
  }

  async function applyPasswordChange(targetUids, password, successMessage) {
    const nextPassword = String(password).trim();
    if (!targetUids.length) {
      alert('학생을 먼저 선택해 주세요.');
      return false;
    }
    if (nextPassword.length < 6) {
      alert('비밀번호는 6자 이상이어야 합니다.');
      return false;
    }

    try {
      await setStudentPasswords(targetUids, nextPassword);
      alert(successMessage);
      return true;
    } catch (error) {
      alert(functionErrorMessage(error, '비밀번호 변경 중 오류가 발생했습니다.'));
      return false;
    }
  }

  async function saveStudentPassword(student) {
    const ok = await applyPasswordChange(
      [student.uid],
      passwordDraft,
      `${student.displayName || student.id} 학생 비밀번호를 변경했습니다.`
    );
    if (!ok) return;
    setPasswordUid(null);
    setPasswordDraft('');
  }

  async function applyBatchPassword() {
    const ok = await applyPasswordChange(
      selectedUids,
      batchPassword,
      `${selectedCount}명의 비밀번호를 일괄 변경했습니다.`
    );
    if (!ok) return;
    setBatchPassword('');
  }

  function toggleSelected(uid) {
    setSelectedUids((current) =>
      current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
    );
  }

  function toggleAllSelected() {
    setSelectedUids(allSelected ? [] : sorted.map((student) => student.uid));
  }

  async function removeStudent(student) {
    const ok = window.confirm(
      `${student.displayName || student.id} 학생을 삭제하면 로그인 계정과 학생 문서가 함께 삭제됩니다. 계속할까요?`
    );
    if (!ok) return;

    try {
      await deleteStudentAccount(student.uid);
      setSelectedUids((current) => current.filter((uid) => uid !== student.uid));
      alert('학생 계정을 삭제했습니다.');
    } catch (error) {
      alert(functionErrorMessage(error, '학생 삭제 중 오류가 발생했습니다.'));
    }
  }

  async function removeSelectedStudents() {
    if (!selectedCount) {
      alert('삭제할 학생을 먼저 선택해 주세요.');
      return;
    }

    const ok = window.confirm(
      `선택한 학생 ${selectedCount}명을 삭제하면 로그인 계정과 학생 문서가 함께 삭제됩니다. 계속할까요?`
    );
    if (!ok) return;

    try {
      await deleteStudentAccounts(selectedUids);
      setSelectedUids([]);
      alert(`학생 ${selectedCount}명을 삭제했습니다.`);
    } catch (error) {
      alert(functionErrorMessage(error, '학생 일괄 삭제 중 오류가 발생했습니다.'));
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[8px] bg-white/90 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">학생 목록</h2>
            <p className="mt-1 text-sm text-stone-500">
              이름 수정, 개별 비밀번호 변경, 선택 학생 비밀번호 일괄 변경, 선택 학생 삭제를 여기서 처리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStudentCreateMode('single')}
              className="inline-flex items-center gap-2 rounded-[8px] bg-stone-900 px-3 py-2 text-sm font-bold text-white"
            >
              <Plus size={16} />
              학생 한 명 생성
            </button>
            <button
              type="button"
              onClick={() => setStudentCreateMode('batch')}
              className="inline-flex items-center gap-2 rounded-[8px] border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700"
            >
              <Plus size={16} />
              학생 일괄 생성
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-[8px] border border-stone-300 px-3 py-2 text-sm font-bold"
            >
              <Printer size={16} />
              인쇄
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-[8px] border border-stone-200 bg-stone-50 p-4">
          <div className="grid gap-3 xl:grid-cols-[auto_minmax(220px,1fr)_max-content_max-content] xl:items-end">
            <label className="inline-flex h-11 items-center gap-2 whitespace-nowrap text-sm font-bold text-stone-700">
              <input type="checkbox" checked={allSelected} onChange={toggleAllSelected} />
              전체 선택
            </label>
            <Field label={`선택 학생 ${selectedCount}명 비밀번호 일괄 변경`}>
              <input
                type="password"
                minLength={6}
                autoComplete="new-password"
                value={batchPassword}
                onChange={(e) => setBatchPassword(e.target.value)}
                className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                placeholder="새 비밀번호"
              />
            </Field>
            <button
              type="button"
              onClick={applyBatchPassword}
              disabled={!selectedCount}
              className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-stone-900 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <KeyRound size={16} />
              선택 학생 비밀번호 변경
            </button>
            <button
              type="button"
              onClick={removeSelectedStudents}
              disabled={!selectedCount}
              className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border border-red-200 bg-white px-4 text-sm font-bold text-red-600 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
            >
              <Trash2 size={16} />
              선택 학생 일괄 삭제
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {sorted.map((student) => {
            const isNameEditing = editingUid === student.uid;
            const isPasswordEditing = passwordUid === student.uid;
            const isSelected = selectedUids.includes(student.uid);

            return (
              <article
                key={student.uid}
                className="rounded-[8px] border border-stone-200 bg-lime-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-stone-700">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(student.uid)}
                    />
                    선택
                  </label>

                  <div className="min-w-0 flex-1">
                    {isNameEditing ? (
                      <div className="flex gap-2">
                        <input
                          value={nameDraft}
                          onChange={(event) => setNameDraft(event.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-[8px] border border-stone-200 px-3"
                        />
                        <button
                          type="button"
                          onClick={() => saveStudentName(student)}
                          className="rounded-[8px] bg-stone-900 px-3 text-sm font-bold text-white"
                        >
                          저장
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{student.displayName || student.id}</h3>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUid(student.uid);
                            setNameDraft(student.displayName || student.id);
                          }}
                          className="rounded-full bg-white p-1.5 text-stone-500 hover:text-stone-900"
                          aria-label="학생 이름 수정"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    )}

                    <p className="mt-1 text-sm text-stone-600">{student.id}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      현재 비밀번호: {student.passwordHint || '별도 관리'}
                    </p>

                    {isPasswordEditing ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          type="password"
                          minLength={6}
                          autoComplete="new-password"
                          value={passwordDraft}
                          onChange={(event) => setPasswordDraft(event.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-[8px] border border-stone-200 px-3"
                          placeholder="새 비밀번호"
                        />
                        <button
                          type="button"
                          onClick={() => saveStudentPassword(student)}
                          className="rounded-[8px] bg-stone-900 px-3 text-sm font-bold text-white"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordUid(null);
                            setPasswordDraft('');
                          }}
                          className="rounded-[8px] border border-stone-300 bg-white px-3 text-sm font-bold text-stone-700"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordUid(student.uid);
                            setPasswordDraft(student.passwordHint || '');
                          }}
                          className="inline-flex items-center gap-1 rounded-[8px] border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-700"
                        >
                          <KeyRound size={15} />
                          개별 비밀번호 변경
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeStudent(student)}
                    className="rounded-full bg-white p-2 text-stone-500 hover:text-red-600"
                    aria-label="학생 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            );
          })}
          {!sorted.length && (
            <p className="text-sm text-stone-500">생성된 학생 계정이 아직 없습니다.</p>
          )}
        </div>
      </section>

      {studentCreateMode === 'single' && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-stone-950/45 px-4">
          <form
            onSubmit={async (event) => {
              const created = await submitSingle(event);
              if (created) setStudentCreateMode(null);
            }}
            className="w-full max-w-md rounded-[18px] bg-white p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-950">학생 한 명 생성</h2>
              <button
                type="button"
                onClick={() => setStudentCreateMode(null)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="학생 생성 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 space-y-4">
              <Field label="학생 ID">
                <input
                  value={singleForm.id}
                  onChange={(e) => setSingleForm({ ...singleForm, id: e.target.value })}
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                  placeholder="mh01"
                />
              </Field>
              <Field label="학생 이름">
                <input
                  value={singleForm.displayName}
                  onChange={(e) =>
                    setSingleForm({ ...singleForm, displayName: e.target.value })
                  }
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                  placeholder="홍길동"
                />
              </Field>
              <Field label="비밀번호">
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={singleForm.password}
                  onChange={(e) =>
                    setSingleForm({ ...singleForm, password: e.target.value })
                  }
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                />
              </Field>
            </div>
            <button
              type="submit"
              className="mt-5 h-11 w-full rounded-[8px] bg-stone-900 font-bold text-white"
            >
              학생 한 명 생성
            </button>
          </form>
        </div>
      )}

      {studentCreateMode === 'batch' && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-stone-950/45 px-4 py-6">
          <form
            onSubmit={async (event) => {
              const created = await submit(event);
              if (created) setStudentCreateMode(null);
            }}
            className="mx-auto w-full max-w-xl rounded-[18px] bg-white p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-950">학생 일괄 생성</h2>
              <button
                type="button"
                onClick={() => setStudentCreateMode(null)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="학생 일괄 생성 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <Field label="ID 접두어">
                <input
                  value={form.prefix}
                  onChange={(e) => setForm({ ...form, prefix: e.target.value })}
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                  placeholder="class_"
                />
              </Field>
              <Field label="비밀번호">
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                />
              </Field>
              <Field label="시작 번호">
                <input
                  inputMode="numeric"
                  value={form.start}
                  onChange={(e) =>
                    setForm({ ...form, start: e.target.value.replace(/\D/g, '') || '00' })
                  }
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                />
              </Field>
              <Field label="끝 번호">
                <input
                  inputMode="numeric"
                  value={form.end}
                  onChange={(e) =>
                    setForm({ ...form, end: e.target.value.replace(/\D/g, '') || '00' })
                  }
                  className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="학생 이름 목록">
                <textarea
                  value={form.nameList}
                  onChange={(e) => setForm({ ...form, nameList: e.target.value })}
                  className="min-h-40 w-full rounded-[8px] border border-stone-200 p-3"
                  placeholder={'김학생\n이학생\n박학생'}
                />
              </Field>
            </div>
            <p className="mt-3 text-sm text-stone-500">
              시작 번호를 `01`처럼 두 자리로 적으면 생성되는 ID도 같은 자리수로 맞춰집니다.
            </p>
            <p className="mt-2 text-sm text-stone-500">
              엑셀에서 이름 열만 세로로 붙여넣으면 줄 수만큼 생성되고, 이름 목록이 있으면 번호 범위보다
              이름 목록이 우선 적용됩니다.
            </p>
            <button
              type="submit"
              className="mt-5 h-11 w-full rounded-[8px] bg-stone-900 font-bold text-white"
            >
              학생 일괄 생성
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function HtmlHostingManager({ sites, origin }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!file) {
      setMessage('업로드할 HTML 파일을 선택해 주세요.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.html') && !file.name.toLowerCase().endsWith('.htm')) {
      setMessage('html 또는 htm 파일만 업로드할 수 있습니다.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const html = await file.text();
      const data = await createHtmlSite({
        title: title.trim() || file.name.replace(/\.(html|htm)$/i, ''),
        html
      });
      setTitle('');
      setFile(null);
      formElement.reset();
      setMessage(`${origin}${data.site.urlPath} 주소로 발급했습니다.`);
    } catch (error) {
      const code = error?.code || '';
      if (code === 'html-too-large') setMessage('HTML 파일은 5MB 이하만 업로드할 수 있습니다.');
      else if (code === 'html-required') setMessage('비어 있는 HTML 파일은 업로드할 수 없습니다.');
      else setMessage('HTML 파일을 업로드하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function copySiteLink(site) {
    const url = `${origin}${site.urlPath}`;
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
      setMessage('HTML 사이트 링크를 복사했습니다.');
    } catch {
      setMessage(url);
    }
  }

  async function removeSite(site) {
    const ok = window.confirm(`${site.title} 사이트를 삭제할까요? 발급된 URL도 더 이상 열리지 않습니다.`);
    if (!ok) return;
    await deleteHtmlSite(site.id);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form onSubmit={submit} className="rounded-[8px] bg-white/90 p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Globe2 size={20} className="text-amber-700" />
          <h2 className="text-xl font-bold text-stone-950">HTML 파일 호스팅</h2>
        </div>
        <div className="mt-5 space-y-4">
          <Field label="사이트 이름">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
              placeholder="우리 반 안내 페이지"
            />
          </Field>
          <Field label="HTML 파일">
            <input
              required
              type="file"
              accept=".html,.htm,text/html"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="block w-full rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-11 w-full rounded-[8px] bg-stone-900 font-bold text-white disabled:opacity-50"
        >
          {busy ? '업로드 중...' : '업로드하고 URL 발급'}
        </button>
        {message && <p className="mt-3 break-all text-sm font-bold text-emerald-700">{message}</p>}
        <p className="mt-3 text-sm leading-6 text-stone-600">
          업로드된 파일은 서버 로컬의 data/html-sites 폴더에 저장됩니다.
        </p>
      </form>

      <section className="rounded-[8px] bg-white/90 p-5 shadow-soft">
        <h2 className="text-xl font-bold text-stone-950">발급된 HTML 사이트</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {sites.map((site) => (
            <article key={site.id} className="rounded-[8px] border border-stone-200 bg-amber-50 p-4">
              <h3 className="font-bold text-stone-950">{site.title}</h3>
              <p className="mt-1 break-all text-sm text-stone-600">{origin}{site.urlPath}</p>
              <p className="mt-2 text-xs text-stone-500">생성 시간 {dateText(site.createdAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copySiteLink(site)}
                  className="inline-flex items-center gap-1 rounded-[8px] bg-white px-3 py-2 text-sm font-bold"
                >
                  <Copy size={15} />
                  링크 복사
                </button>
                <a
                  href={site.urlPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-[8px] bg-stone-900 px-3 py-2 text-sm font-bold text-white"
                >
                  <ExternalLink size={15} />
                  열기
                </a>
                <button
                  type="button"
                  onClick={() => removeSite(site)}
                  className="inline-flex items-center gap-1 rounded-[8px] bg-white px-3 py-2 text-sm font-bold text-red-600"
                >
                  <Trash2 size={15} />
                  삭제
                </button>
              </div>
            </article>
          ))}
          {!sites.length && (
            <p className="text-sm text-stone-500">아직 업로드한 HTML 사이트가 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function WallManager({ form, setForm, submit, walls, folders, origin }) {
  const navigate = useNavigate();
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [wallCreateOpen, setWallCreateOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderEditing, setFolderEditing] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('');
  const [activeFolderId, setActiveFolderId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleWallCount, setVisibleWallCount] = useState(INITIAL_WALL_LIST_COUNT);
  const [wallMenuOpenId, setWallMenuOpenId] = useState(null);
  const [deletingWallId, setDeletingWallId] = useState(null);
  const folderById = useMemo(
    () => Object.fromEntries(folders.map((folder) => [folder.id, folder])),
    [folders]
  );
  const sortedWalls = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('ko-KR');
    return [...walls]
      .filter((wall) => {
        const folderNameValue = folderById[wall.folderId]?.name || '';
        const matchesFolder =
          activeFolderId === 'all' ||
          (activeFolderId === 'unfiled' ? !wall.folderId : wall.folderId === activeFolderId);
        const matchesSearch =
          !query ||
          [wall.title, wall.description, folderNameValue]
            .some((value) => String(value || '').toLocaleLowerCase('ko-KR').includes(query));
        return matchesFolder && matchesSearch;
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [activeFolderId, folderById, searchTerm, walls]);
  const folderCounts = useMemo(() => {
    const counts = { all: walls.length, unfiled: 0 };
    for (const folder of folders) counts[folder.id] = 0;
    for (const wall of walls) {
      if (wall.folderId && counts[wall.folderId] != null) counts[wall.folderId] += 1;
      else counts.unfiled += 1;
    }
    return counts;
  }, [folders, walls]);
  const hasWallListFilter = activeFolderId !== 'all' || Boolean(searchTerm.trim());
  const displayedWalls = hasWallListFilter ? sortedWalls : sortedWalls.slice(0, visibleWallCount);
  const hiddenWallCount = Math.max(sortedWalls.length - displayedWalls.length, 0);
  const templateFields = form.postTemplate?.fields || [];
  const previewFields = templateFields.slice(0, 3);

  useEffect(() => {
    if (activeFolderId === 'all' || activeFolderId === 'unfiled') return;
    if (!folders.some((folder) => folder.id === activeFolderId)) setActiveFolderId('all');
  }, [activeFolderId, folders]);

  useEffect(() => {
    setVisibleWallCount(INITIAL_WALL_LIST_COUNT);
  }, [activeFolderId, searchTerm]);

  async function copyWallLink(wallId) {
    const url = `${origin}/wall/${wallId}`;
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
      setCopyMessage('담벼락 링크를 복사했습니다.');
      window.setTimeout(() => setCopyMessage(''), 1600);
    } catch {
      setCopyMessage('복사하지 못했습니다. 링크를 직접 열어 주소를 복사해 주세요.');
    }
  }

  function setTemplateField(fieldId, patch) {
    setForm({
      ...form,
      postTemplate: {
        fields: (form.postTemplate?.fields || []).map((field) =>
          field.id === fieldId ? { ...field, ...patch } : field
        )
      }
    });
  }

  function addTemplateField() {
    const fields = form.postTemplate?.fields || [];
    if (fields.length >= 10) return;
    setForm({
      ...form,
      postTemplate: {
        fields: [
          ...fields,
          {
            id: `field_${Date.now()}`,
            label: `질문 ${fields.length + 1}`,
            type: 'shortText',
            required: true
          }
        ]
      }
    });
  }

  function removeTemplateField(fieldId) {
    const fields = form.postTemplate?.fields || [];
    if (fields.length <= 1) return;
    setForm({
      ...form,
      postTemplate: {
        fields: fields.filter((field) => field.id !== fieldId)
      }
    });
  }

  async function toggleStudentDashboardVisibility(wall) {
    await updateWall(wall.id, {
      visibleToStudents: wall.visibleToStudents === false
    });
  }

  function openFolderModal(folder = null) {
    setFolderEditing(folder);
    setFolderName(folder?.name || '');
    setFolderColor(folderColorValue(folder?.color));
    setFolderModalOpen(true);
  }

  async function saveFolder(event) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    if (!folderEditing && folders.length >= 20) {
      alert('폴더는 최대 20개까지 만들 수 있습니다.');
      return;
    }

    try {
      if (folderEditing) await updateWallFolder(folderEditing.id, { name, color: folderColor });
      else await createWallFolder({ name, color: folderColor });
      setFolderModalOpen(false);
      setFolderEditing(null);
      setFolderName('');
      setFolderColor('');
    } catch (error) {
      const code = error?.code || '';
      if (code === 'folder-name-exists') alert('이미 같은 이름의 폴더가 있습니다.');
      else if (code === 'folder-limit-reached') alert('폴더는 최대 20개까지 만들 수 있습니다.');
      else alert('폴더를 저장하지 못했습니다.');
    }
  }

  async function removeFolder(folder) {
    const ok = window.confirm(
      `${folder.name} 폴더만 삭제됩니다. 담벼락은 미분류로 이동합니다. 계속할까요?`
    );
    if (!ok) return;
    await deleteWallFolder(folder.id);
    if (activeFolderId === folder.id) setActiveFolderId('all');
  }

  async function moveWallToFolder(wall, folderId) {
    await updateWall(wall.id, { folderId: folderId || null });
  }

  async function removeWall(wall) {
    const ok = window.confirm(
      `${wall.title || '담벼락'} 담벼락과 모든 게시글을 되돌릴 수 없습니다.\n정말 삭제할까요?`
    );
    if (!ok) return;
    setDeletingWallId(wall.id);
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    try {
      await deleteWall(wall.id);
    } finally {
      setDeletingWallId(null);
    }
  }

  return (
    <div className="space-y-5">
      {wallCreateOpen && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-stone-950/45 px-4 py-6">
          <form
            onSubmit={async (event) => {
              const data = await submit(event);
              if (!data?.wall?.id) return;
              setWallCreateOpen(false);
              navigate(`/wall/${data.wall.id}`);
            }}
            className="mx-auto w-full max-w-xl rounded-[18px] bg-white p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-stone-950">담벼락 만들기</h2>
              <button
                type="button"
                onClick={() => setWallCreateOpen(false)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="담벼락 만들기 닫기"
              >
                <X size={18} />
              </button>
            </div>
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-2 text-sm font-bold text-stone-700">담벼락 형식</p>
            <div className="grid gap-2">
              {[
                ['free', '자유 포스트잇', '학생들이 자유롭게 글을 써서 붙입니다.'],
                ['worksheet', '학습지 포스트잇', '교사가 만든 질문에 답해서 붙입니다.']
              ].map(([value, title, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, postMode: value })}
                  className={`rounded-[10px] border px-4 py-3 text-left ${
                    form.postMode === value
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-200 bg-white text-stone-800'
                  }`}
                >
                  <b className="block text-sm">{title}</b>
                  <span className={`text-xs ${form.postMode === value ? 'text-stone-200' : 'text-stone-500'}`}>
                    {description}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Field label="제목">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
            />
          </Field>
          <Field label="설명">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-24 w-full rounded-[8px] border border-stone-200 p-3"
            />
          </Field>
          <Field label="폴더">
            <select
              value={form.folderId || ''}
              onChange={(e) => setForm({ ...form, folderId: e.target.value || null })}
              className="h-11 w-full rounded-[8px] border border-stone-200 px-3"
            >
              <option value="">미분류</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </Field>
          {form.postMode === 'worksheet' && (
            <div className="rounded-[10px] border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-stone-900">학습지 질문</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {templateFields.length}개 질문 설정됨
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuestionEditorOpen(true)}
                  className="shrink-0 rounded-[8px] bg-stone-900 px-3 py-2 text-xs font-bold text-white"
                >
                  질문 편집
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-stone-700">
                {previewFields.map((field) => (
                  <li key={field.id} className="truncate">
                    - {field.label}
                  </li>
                ))}
                {templateFields.length > previewFields.length && (
                  <li className="text-stone-500">외 {templateFields.length - previewFields.length}개</li>
                )}
              </ul>
            </div>
          )}
          {form.postMode === 'free' && (
            <label className="flex items-center justify-between rounded-[8px] border border-stone-200 px-4 py-3">
              <span>
                <b className="block text-sm text-stone-900">사진 업로드 허용</b>
                <span className="text-sm text-stone-600">
                  켜면 자유 포스트잇 작성 화면에 사진 첨부가 표시됩니다.
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.imageUploadsEnabled !== false}
                onChange={(event) =>
                  setForm({ ...form, imageUploadsEnabled: event.target.checked })
                }
              />
            </label>
          )}
          <label className="flex items-center justify-between rounded-[8px] border border-stone-200 px-4 py-3">
            <span>
              <b className="block text-sm text-stone-900">로그인 필요</b>
              <span className="text-sm text-stone-600">
                끄면 링크만 있으면 바로 참여할 수 있습니다.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.accessMode === 'login'}
              onChange={(e) =>
                setForm({
                  ...form,
                  accessMode: e.target.checked ? 'login' : 'public'
                })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.commentsEnabled}
              onChange={(e) => setForm({ ...form, commentsEnabled: e.target.checked })}
            />
            댓글 사용
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.likesEnabled}
              onChange={(e) => setForm({ ...form, likesEnabled: e.target.checked })}
            />
            좋아요 사용
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.showAuthorNames}
              onChange={(e) => setForm({ ...form, showAuthorNames: e.target.checked })}
            />
            포스트잇에 작성자 이름표시
          </label>
        </div>
        <button
          type="submit"
          className="mt-5 h-11 w-full rounded-[8px] bg-stone-900 font-bold text-white"
        >
          생성
        </button>
          </form>
        </div>
      )}

      {questionEditorOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-stone-950/45 px-4">
          <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[18px] bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-stone-950">학습지 질문 편집</h2>
                <p className="mt-1 text-sm text-stone-500">질문 {templateFields.length} / 10</p>
              </div>
              <button
                type="button"
                onClick={() => setQuestionEditorOpen(false)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="질문 편집 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {templateFields.map((field, index) => (
                <div key={field.id} className="rounded-[10px] border border-stone-200 bg-stone-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-stone-500">질문 {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeTemplateField(field.id)}
                      disabled={templateFields.length <= 1}
                      className="text-stone-400 hover:text-red-600 disabled:opacity-30"
                      aria-label="질문 삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={field.label}
                    maxLength={80}
                    onChange={(event) => setTemplateField(field.id, { label: event.target.value })}
                    className="h-10 w-full rounded-[8px] border border-stone-200 bg-white px-3 text-sm"
                  />
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-700">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={field.type === 'shortText' || !['longText', 'image'].includes(field.type)}
                        onChange={() => setTemplateField(field.id, { type: 'shortText' })}
                      />
                      짧은 답변
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={field.type === 'longText'}
                        onChange={() => setTemplateField(field.id, { type: 'longText' })}
                      />
                      긴 답변
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        checked={field.type === 'image'}
                        onChange={() => setTemplateField(field.id, { type: 'image' })}
                      />
                      사진
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={field.required !== false}
                        onChange={(event) =>
                          setTemplateField(field.id, { required: event.target.checked })
                        }
                      />
                      필수
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={addTemplateField}
                disabled={templateFields.length >= 10}
                className="inline-flex items-center gap-1 rounded-[8px] border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 disabled:opacity-40"
              >
                <Plus size={15} />
                질문 추가
              </button>
              <button
                type="button"
                onClick={() => setQuestionEditorOpen(false)}
                className="rounded-[8px] bg-stone-900 px-4 py-2 text-sm font-bold text-white"
              >
                완료
              </button>
            </div>
          </section>
        </div>
      )}

      <section className="rounded-[8px] bg-white/90 p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">담벼락 목록</h2>
            {copyMessage && (
              <p className="mt-2 rounded-[8px] bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                {copyMessage}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWallCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-[8px] bg-stone-900 px-4 py-2 text-sm font-bold text-white"
          >
            <Plus size={16} />
            담벼락 만들기
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {[
              ['all', '전체', folderCounts.all],
              ['unfiled', '미분류', folderCounts.unfiled]
            ].map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveFolderId(id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
                  activeFolderId === id
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-200 bg-white text-stone-700'
                }`}
              >
                {label} {count}
              </button>
            ))}
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                onClick={() => setActiveFolderId(folder.id)}
                style={{
                  backgroundColor: folderColorValue(folder.color) || DEFAULT_WALL_CARD_COLOR
                }}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-bold text-stone-800 ${
                  activeFolderId === folder.id
                    ? 'border-stone-700 shadow-sm ring-2 ring-stone-900/10'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <Folder size={14} />
                {folder.name} {folderCounts[folder.id] || 0}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFolderManagerOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 hover:border-stone-300"
          >
            <Pencil size={14} />
            폴더 편집
          </button>
        </div>

        <label className="mt-4 flex h-11 items-center gap-2 rounded-[8px] border border-stone-200 bg-white px-3">
          <Search size={16} className="text-stone-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="담벼락 검색..."
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="text-xs font-bold text-stone-500 hover:text-stone-900"
            >
              지우기
            </button>
          )}
        </label>

        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {displayedWalls.map((wall) => (
            <article
              key={wall.id}
              style={{
                backgroundColor: folderColorValue(folderById[wall.folderId]?.color) || DEFAULT_WALL_CARD_COLOR
              }}
              className={`relative rounded-[8px] border border-stone-200 p-4 transition-opacity duration-200 ${
                deletingWallId === wall.id ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate pr-2 text-lg font-bold">{wall.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-stone-600">
                    {wall.description || '설명이 아직 없습니다.'}
                  </p>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setWallMenuOpenId((current) => (current === wall.id ? null : wall.id))
                    }
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-stone-600 shadow-sm transition hover:bg-white hover:text-stone-950"
                    aria-label={`${wall.title} 더보기`}
                    aria-expanded={wallMenuOpenId === wall.id}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  <div
                    className={`absolute right-0 top-11 z-20 w-72 rounded-[12px] border border-stone-200 bg-white p-3 text-stone-800 shadow-soft transition duration-150 ${
                      wallMenuOpenId === wall.id
                        ? 'pointer-events-auto translate-y-0 opacity-100'
                        : 'pointer-events-none -translate-y-1.5 opacity-0'
                    }`}
                  >
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-stone-400">
                            정보
                          </p>
                          <p className="mt-1 text-sm font-bold text-stone-700">
                            생성 시간 {dateText(wall.createdAt)}
                          </p>
                          <p className="mt-1 text-sm text-stone-500">
                            현재 폴더 {folderById[wall.folderId]?.name || '미분류'}
                          </p>
                        </div>
                        <label className="block text-xs font-bold text-stone-600">
                          폴더
                          <select
                            value={wall.folderId || ''}
                            onChange={(event) => moveWallToFolder(wall, event.target.value)}
                            className="mt-1 h-9 w-full rounded-[8px] border border-stone-200 bg-white px-2 text-sm font-semibold text-stone-800"
                          >
                            <option value="">미분류</option>
                            {folders.map((folder) => (
                              <option key={folder.id} value={folder.id}>
                                {folder.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded-[10px] bg-stone-50 px-3 py-2">
                          <span>
                            <b className="block text-sm text-stone-800">학생 홈페이지 공개</b>
                            <span className="text-xs text-stone-500">
                              끄면 학생 목록에서는 숨깁니다.
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={wall.visibleToStudents !== false}
                            onChange={() => toggleStudentDashboardVisibility(wall)}
                            className="h-4 w-4 shrink-0 accent-stone-900"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            copyWallLink(wall.id);
                            setWallMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm font-bold text-stone-700 hover:bg-stone-50"
                        >
                          <Copy size={15} />
                          링크 복사
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWallMenuOpenId(null);
                            removeWall(wall);
                          }}
                          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                          삭제
                        </button>
                      </div>
                    </div>
                </div>
              </div>
              <div className="mt-5">
                <Link
                  to={`/wall/${wall.id}`}
                  className="inline-flex items-center gap-1 rounded-[8px] border border-stone-300 bg-white/75 px-4 py-2.5 text-sm font-bold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-white"
                >
                  <ExternalLink size={15} />
                  들어가기
                </Link>
              </div>
            </article>
          ))}
          {!sortedWalls.length && (
            <p className="text-sm text-stone-500">
              {walls.length ? '조건에 맞는 담벼락이 없습니다.' : '아직 만든 담벼락이 없습니다.'}
            </p>
          )}
        </div>
        {!hasWallListFilter && hiddenWallCount > 0 && (
          <div className="mt-5 flex flex-col items-center gap-2 border-t border-stone-200 pt-4">
            <p className="text-sm font-semibold text-stone-500">
              최근 담벼락 {displayedWalls.length}개 표시 중 · 남은 담벼락 {hiddenWallCount}개
            </p>
            <button
              type="button"
              onClick={() => setVisibleWallCount((count) => count + INITIAL_WALL_LIST_COUNT)}
              className="rounded-[8px] border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm transition hover:bg-stone-50"
            >
              더 보기
            </button>
          </div>
        )}
      </section>

      {folderManagerOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-stone-950/45 px-4">
          <section className="w-full max-w-lg rounded-[18px] bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-stone-950">폴더 편집</h2>
                <p className="mt-1 text-sm text-stone-500">
                  폴더를 정리해도 담벼락 내용은 삭제되지 않습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFolderManagerOpen(false)}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="폴더 편집 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => openFolderModal()}
              disabled={folders.length >= 20}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-stone-900 text-sm font-bold text-white disabled:opacity-40"
            >
              <FolderPlus size={16} />
              폴더 추가
            </button>
            <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {!folders.length && (
                <p className="rounded-[10px] bg-stone-50 px-3 py-4 text-center text-sm text-stone-500">
                  아직 만든 폴더가 없습니다.
                </p>
              )}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {folder.color && (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: folderColorValue(folder.color) }}
                        />
                      )}
                      <p className="truncate text-sm font-bold text-stone-900">{folder.name}</p>
                    </div>
                    <p className="text-xs text-stone-500">
                      담벼락 {folderCounts[folder.id] || 0}개
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openFolderModal(folder)}
                      className="inline-flex items-center gap-1 rounded-[8px] bg-white px-3 py-2 text-xs font-bold text-stone-700"
                    >
                      <Pencil size={13} />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFolder(folder)}
                      className="inline-flex items-center gap-1 rounded-[8px] bg-white px-3 py-2 text-xs font-bold text-red-600"
                    >
                      <Trash2 size={13} />
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFolderManagerOpen(false)}
              className="mt-5 h-10 w-full rounded-[8px] border border-stone-200 text-sm font-bold text-stone-700"
            >
              닫기
            </button>
          </section>
        </div>
      )}

      {folderModalOpen && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-stone-950/45 px-4">
          <form
            onSubmit={saveFolder}
            className="w-full max-w-sm rounded-[18px] bg-white p-5 shadow-soft"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-950">
                  {folderEditing ? '폴더 이름 변경' : '폴더 만들기'}
                </h2>
                <p className="mt-1 text-sm text-stone-500">폴더는 최대 20개까지 만들 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFolderModalOpen(false);
                  setFolderColor('');
                }}
                className="rounded-full p-2 hover:bg-stone-100"
                aria-label="폴더 모달 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold text-stone-800">
              폴더 이름
              <input
                autoFocus
                value={folderName}
                onChange={(event) => setFolderName(event.target.value.slice(0, 20))}
                maxLength={20}
                className="mt-2 h-11 w-full rounded-[8px] border border-stone-200 px-3 text-sm outline-none focus:border-stone-900"
                placeholder="예: 1학기 활동"
              />
            </label>
            <div className="mt-5">
              <p className="text-sm font-bold text-stone-800">폴더 색상</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {FOLDER_COLOR_OPTIONS.map((option) => {
                  const selected = folderColor === option.value;
                  return (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() => setFolderColor(option.value)}
                      className={`grid h-8 w-8 place-items-center rounded-full border transition ${
                        selected
                          ? 'border-stone-900 ring-2 ring-stone-900/15'
                          : 'border-stone-200 hover:border-stone-400'
                      }`}
                      title={option.name}
                      aria-label={`폴더 색상 ${option.name}`}
                    >
                      {option.swatch ? (
                        <span
                          className="h-5 w-5 rounded-full"
                          style={{ backgroundColor: option.swatch }}
                        />
                      ) : (
                        <span className="h-5 w-5 rounded-full border border-dashed border-stone-300 bg-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
              <span>{folderName.trim().length}/20자</span>
              <span>{folders.length}/20개 사용 중</span>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="submit"
                disabled={!folderName.trim() || (!folderEditing && folders.length >= 20)}
                className="h-11 flex-1 rounded-[8px] bg-stone-900 text-sm font-bold text-white disabled:opacity-40"
              >
                {folderEditing ? '저장' : '폴더 만들기'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFolderModalOpen(false);
                  setFolderColor('');
                }}
                className="h-11 rounded-[8px] border border-stone-200 px-4 text-sm font-bold text-stone-700"
              >
                닫기
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
