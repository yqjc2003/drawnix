import { useEffect, useRef, useState } from 'react';
import { Drawnix, DrawnixToolState } from '@drawnix/drawnix';
import { PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import localforage from 'localforage';
import './cloud.scss';

type AppValue = { children: PlaitElement[]; viewport?: Viewport; theme?: PlaitTheme };
type Preference = { copyTransparent: boolean; exportTransparent: boolean };
type Board = { id: string; title: string; content: AppValue; version: number; updated_at: string };
type BoardSummary = Omit<Board, 'content'>;
const EMPTY: AppValue = { children: [] };
localforage.config({ name: 'Drawnix', storeName: 'drawnix_store', driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE] });

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `请求失败 (${response.status})`);
  }
  return response.json();
}

export function App() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [value, setValue] = useState<AppValue>(EMPTY);
  const valueRef = useRef(value);
  const [toolState, setToolState] = useState<Partial<DrawnixToolState>>();
  const [preference, setPreference] = useState<Preference>({ copyTransparent: false, exportTransparent: false });
  const [legacy, setLegacy] = useState<AppValue | null>(null);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const allowUnload = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(false);
  const listDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (showList) listDialogRef.current?.showModal();
  }, [showList]);

  const refresh = async () => setBoards((await api<{ boards: BoardSummary[] }>('/api/private/boards')).boards);
  useEffect(() => {
    Promise.all([
      localforage.getItem<AppValue>('main_board_content'),
      localforage.getItem<Partial<DrawnixToolState>>('main_board_tool_state'),
      localforage.getItem<Preference>('main_board_preference'),
    ]).then(([stored, tools, prefs]) => {
      if (stored) { setValue(stored); valueRef.current = stored; }
      if (stored?.children?.length) setLegacy(stored);
      if (tools) setToolState(tools);
      if (prefs) setPreference(prefs);
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    fetch('/api/private/me', { redirect: 'manual' }).then(async (response) => {
      if (!response.ok) return;
      const me = await response.json();
      if (!me.email) return;
      setEmail(me.email);
      await refresh();
    }).catch(() => { /* No Access session: anonymous editing remains available. */ });
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && !allowUnload.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const mayLeave = () => !dirty || window.confirm('当前画布有未保存的更改，确定离开吗？');
  const logout = () => {
    const warning = dirty ? '当前画布有未保存的更改，退出后这些更改将丢失。\n\n' : '';
    if (!window.confirm(`${warning}退出将同时结束此 Cloudflare Access 账户在其他受保护应用中的会话。确定退出登录吗？`)) return;
    allowUnload.current = true;
    window.location.assign(`/cdn-cgi/access/logout?returnTo=${encodeURIComponent(window.location.origin + '/')}`);
  };
  const open = (item: Board) => {
    setBoard(item); setTitle(item.title); valueRef.current = item.content; setValue(item.content); setDirty(false); setShowList(false);
  };
  const openLocal = async () => {
    const local = await localforage.getItem<AppValue>('main_board_content') || EMPTY;
    setBoard(null); valueRef.current = local; setValue(local); setDirty(false); setShowList(false);
  };
  const create = (content: AppValue = EMPTY, name = '未命名画布') => {
    if (!mayLeave()) return;
    void run(async () => {
      const item = await api<Board>('/api/private/boards', { method: 'POST', body: JSON.stringify({ title: name, content }) });
      open(item); await refresh();
    });
  };
  const load = (id: string) => {
    if (!mayLeave()) return;
    void run(async () => open(await api<Board>(`/api/private/boards/${id}`)));
  };
  const save = () => {
    if (!board || busy || !dirty || !title.trim()) return;
    void run(async () => {
      const savedValue = valueRef.current;
      const result = await api<{ version: number }>(`/api/private/boards/${board.id}`, { method: 'PUT', body: JSON.stringify({ title, content: savedValue, version: board.version }) });
      setBoard({ ...board, title: title.trim(), version: result.version, content: savedValue });
      if (valueRef.current === savedValue) setDirty(false);
      await refresh();
    });
  };
  useEffect(() => {
    if (!board || showList) return;
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) save();
    };
    window.addEventListener('keydown', handleSaveShortcut, true);
    return () => window.removeEventListener('keydown', handleSaveShortcut, true);
  }, [board, busy, dirty, title, showList]);
  const remove = (item: BoardSummary) => {
    if (!window.confirm(`确定删除“${item.title}”吗？此操作无法撤销。`)) return;
    if (board?.id === item.id && !mayLeave()) return;
    void run(async () => {
      await api(`/api/private/boards/${item.id}?version=${item.version}`, { method: 'DELETE' });
      if (board?.id === item.id) await openLocal();
      await refresh();
    });
  };
  const updatePreference = (partial: Partial<Preference>) => setPreference((current) => {
    const next = { ...current, ...partial }; void localforage.setItem('main_board_preference', next); return next;
  });

  return <div className="cloud-app">
    {error && !showList && <div className="cloud-error" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭">×</button></div>}
    <main className="cloud-main">
      {showList && <dialog ref={listDialogRef} className="cloud-list" aria-labelledby="cloud-list-title" onCancel={() => setShowList(false)} onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setShowList(false);
      }}>
        <div className="cloud-list-header"><h1 id="cloud-list-title">我的画布</h1><button disabled={busy} onClick={() => create()}>新建</button><button type="button" autoFocus onClick={() => setShowList(false)} aria-label="关闭画布列表">×</button></div>
        {error && <div className="cloud-error" role="alert">{error}<button onClick={() => setError('')} aria-label="关闭">×</button></div>}
        <button disabled={busy} onClick={() => { if (mayLeave()) void openLocal(); }}>返回本地白板</button>
        {legacy && <div className="cloud-import"><p>检测到此浏览器中的旧画布。</p><button disabled={busy} onClick={() => create(legacy, '导入的本地画布')}>导入到云端</button></div>}
        {loading ? <p>正在加载画布…</p> : boards.length === 0 ? <p>还没有画布，点击“新建”开始。</p> : <ul>{boards.map((item) => <li key={item.id} className={board?.id === item.id ? 'active' : ''}>
          <button className="cloud-board" disabled={busy} onClick={() => load(item.id)}><strong>{item.title}</strong><small>{new Date(item.updated_at).toLocaleString()}</small></button>
          <button className="cloud-delete" disabled={busy} onClick={() => remove(item)} aria-label={`删除 ${item.title}`}>×</button>
        </li>)}</ul>}
      </dialog>}
      <section className="cloud-editor">{!loading && <Drawnix key={board?.id ?? 'local'} value={value.children} viewport={value.viewport} theme={value.theme}
        initialToolState={toolState} initialLanguage="zh" showLanguageSwitcher={false} cloudSaveShortcut={!!board}
        initialPreference={{ copyTransparent: preference.copyTransparent, exportTransparent: preference.exportTransparent }}
        onPreferenceChange={({ copyTransparent, exportTransparent }) => updatePreference({ copyTransparent, exportTransparent })}
        appMenuAction={{ label: email ? '我的云端画布' : '登录', onSelect: () => {
          if (email) setShowList(true);
          else window.location.assign('/api/private/login');
        } }}
        appMenuAccount={email ? { email, onLogout: logout, disabled: busy } : undefined}
        appToolbarContent={board && <div className="cloud-board-controls">
          <input aria-label="画布名称" title={title} value={title} maxLength={120} disabled={busy} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          <button type="button" aria-label="保存画布" title={busy ? '正在保存' : dirty ? '保存画布 (Ctrl+S / ⌘S)' : '已保存'} disabled={busy || !dirty || !title.trim()} onClick={save}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 3.5h12l3.5 3.5v13.5H3.5V3.5H5Z" />
              <path d="M7 3.5v6h9v-6M7 20.5v-7h10v7" />
            </svg>
          </button>
        </div>}
        onChange={(next) => {
          const data = next as AppValue; valueRef.current = data; setValue(data);
          if (board) setDirty(true);
          else { void localforage.setItem('main_board_content', data); setLegacy(data); }
        }}
        onToolStateChange={(state) => { void localforage.setItem('main_board_tool_state', state); }} tutorial={!board && value.children.length === 0}
      />}</section>
    </main>
  </div>;
}
export default App;
