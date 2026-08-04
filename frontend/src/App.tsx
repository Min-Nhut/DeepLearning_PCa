import { useEffect, useState } from 'react';
import { Button } from './components/ui/Button';
import { StateMessage } from './components/ui/StateMessage';
import { Icon } from './lib/icon';
import { navFor, titleFor, SIDE_MAP } from './lib/nav';
import * as api from './lib/api';
import { useApiData } from './lib/useApiData';
import { caseFromApi } from './lib/caseAdapter';
import type { Case, MeResponse, Nav, Role } from './types';
import prostaMark from './assets/prosta-mark.png';

import { Login } from './pages/Login';
import { DoctorDashboard } from './pages/DoctorDashboard';
import { Cases } from './pages/Cases';
import { CaseDetail } from './pages/CaseDetail';
import { CaseForm } from './pages/CaseForm';
import { Upload } from './pages/Upload';
import { Pipeline } from './pages/Pipeline';
import { Viewer } from './pages/Viewer';
import { Report } from './pages/Report';
import { Annotate } from './pages/Annotate';
import { AdminDashboard } from './pages/AdminDashboard';
import { Log } from './pages/Log';
import { Models } from './pages/Models';
import { Users } from './pages/Users';
import { Migration } from './pages/Migration';
import { Library } from './pages/Library';

const EMPTY_CASE: Case = { id: '', maSo: '', maNam: '2026', hoTen: '', tuoi: '', ketLuan: '', ngayTao: '', status: 'new', gleason: null, primary: null, secondary: null, confidence: null, tumorArea: '—', regionsCount: 0, slides: [] };

const TOKEN_STORAGE_KEY = 'prostaai_token';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [me, setMe] = useState<MeResponse | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [nav, setNav] = useState<Nav>('dashboard');

  const [casesState, reloadCases] = useApiData(
    () => (token ? api.getCases(token).then((cs) => cs.map(caseFromApi)) : Promise.resolve([])),
    [token],
  );
  const cases = casesState.status === 'data' ? casesState.data : [];
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [uploadContext, setUploadContext] = useState<{ caseDbId: number; slideDbId?: number } | null>(null);
  const [annotateImageId, setAnnotateImageId] = useState<number | null>(null);
  const [aiImageId, setAiImageId] = useState<number | null>(null);

  const [editing, setEditing] = useState<Case | null>(null);

  // Hydrate the session from a token left in localStorage (e.g. after a page refresh).
  useEffect(() => {
    if (!token) { setHydrating(false); return; }
    api.getMe(token)
      .then((m) => { setMe(m); setNav(m.role === 'admin' ? 'adashboard' : 'dashboard'); })
      .catch(() => { localStorage.removeItem(TOKEN_STORAGE_KEY); setToken(null); })
      .finally(() => setHydrating(false));
  }, [token]);

  const activeCase = cases.find((c) => c.id === activeCaseId) ?? null;

  function handleLoggedIn(newToken: string, newMe: MeResponse) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setMe(newMe);
    setNav(newMe.role === 'admin' ? 'adashboard' : 'dashboard');
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setMe(null);
  }

  function go(n: Nav) { setNav(n); }

  function openCase(c: Case) {
    setActiveCaseId(c.id);
    setNav('caseDetail');
  }

  function goPipeline(imageId: number, caseId?: string) {
    if (caseId) setActiveCaseId(caseId);
    setAiImageId(imageId);
    go('pipeline');
  }

  function goViewer(imageId: number) {
    setAiImageId(imageId);
    go('viewer');
  }

  function newCase() {
    setEditing({ ...EMPTY_CASE });
    setNav('caseForm');
  }

  function editCase(c: Case) {
    setEditing(JSON.parse(JSON.stringify(c)));
    setNav('caseForm');
  }

  function caseSaved(saved: Case) {
    reloadCases();
    setEditing(null);
    setActiveCaseId(saved.id);
    setNav('caseDetail');
  }

  function goUpload(slideDbId?: number) {
    if (activeCase?.dbId) setUploadContext({ caseDbId: activeCase.dbId, slideDbId });
    go('upload');
  }

  function goAnnotate(imageDbId: number) {
    setAnnotateImageId(imageDbId);
    go('annotate');
  }

  if (hydrating) return null;
  if (!me || !token) return <Login onLoggedIn={handleLoggedIn} />;

  // The rest of the app still models doctor/admin as 'doctor'|'admin' ("role"
  // predates real auth, which uses the schema's 'user'|'admin'); map once here.
  const role: Role = me.role === 'admin' ? 'admin' : 'doctor';

  const items = navFor(role);
  const activeKey = SIDE_MAP[nav] || nav;
  const [crumb, title] = titleFor(nav);
  const displayName = me.full_name || me.username;
  const initials = (me.full_name || me.username).trim().split(/\s+/).slice(-1)[0][0].toUpperCase();

  let topActions = null;
  if (nav === 'viewer') topActions = <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={() => go('cases')}>Danh sách</Button>;
  else if (nav === 'dashboard') topActions = <Button variant="primary" size="sm" iconLeft={<Icon name="plus" />} onClick={() => go('upload')}>Phân tích mới</Button>;
  else if (nav === 'adashboard') topActions = <Button variant="secondary" size="sm" iconLeft={<Icon name="download" />}>Xuất báo cáo hệ thống</Button>;

  const noCaseSelected = <StateMessage kind="error">Chưa chọn ca bệnh. Quay lại danh sách ca bệnh.</StateMessage>;
  const noImageSelected = <StateMessage kind="error">Chưa chọn ảnh. Quay lại chi tiết ca bệnh.</StateMessage>;

  let screen: React.ReactNode;
  switch (nav) {
    case 'dashboard':
      screen = casesState.status === 'error'
        ? <StateMessage kind="error">{casesState.message}</StateMessage>
        : <DoctorDashboard cases={cases} onOpenCase={openCase} onGo={go} />;
      break;
    case 'cases':
      screen = casesState.status === 'error'
        ? <StateMessage kind="error">{casesState.message}</StateMessage>
        : <Cases cases={cases} onOpenCase={openCase} onNewCase={newCase} onExportLibrary={() => go('library')} />;
      break;
    case 'caseDetail':
      screen = activeCase
        ? <CaseDetail case={activeCase} token={token} onBack={() => go('cases')} onEdit={editCase} onGoResult={goViewer} onGoUpload={goUpload} onAnnotate={goAnnotate} onReload={reloadCases} />
        : noCaseSelected;
      break;
    case 'caseForm': screen = editing && <CaseForm editing={editing} token={token} onCancel={() => go(editing.dbId ? 'caseDetail' : 'cases')} onSaved={caseSaved} />; break;
    case 'upload': screen = (
      <Upload
        token={token} cases={cases}
        initialCaseDbId={uploadContext?.caseDbId} initialSlideDbId={uploadContext?.slideDbId}
        onReload={reloadCases} onGoPipeline={goPipeline}
      />
    ); break;
    case 'pipeline': screen = aiImageId
      ? <Pipeline token={token} imageId={aiImageId} onDone={() => go('viewer')} onBack={() => go('caseDetail')} />
      : noImageSelected;
      break;
    case 'viewer': screen = aiImageId
      ? <Viewer
          token={token} imageId={aiImageId} caseLabel={activeCase?.id}
          onBack={() => go('caseDetail')} onGoReport={() => go('report')} onRunAI={() => goPipeline(aiImageId)}
        />
      : noImageSelected;
      break;
    case 'report': screen = aiImageId
      ? <Report token={token} imageId={aiImageId} caseLabel={activeCase?.id} patientName={activeCase?.hoTen} onBack={() => go('viewer')} />
      : noImageSelected;
      break;
    case 'annotate': screen = annotateImageId
      ? <Annotate token={token} imageId={annotateImageId} onBack={() => go('caseDetail')} />
      : noCaseSelected;
      break;
    case 'adashboard': screen = <AdminDashboard token={token} onGo={go} />; break;
    case 'alog': screen = <Log token={token} />; break;
    case 'models': screen = <Models token={token} />; break;
    case 'users': screen = <Users token={token} />; break;
    case 'migration': screen = <Migration token={token} onFinish={() => go('adashboard')} />; break;
    case 'library': screen = <Library token={token} />; break;
    default: screen = null;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--surface-page)', fontFamily: 'var(--font-sans)', color: 'var(--text-body)' }}>
      <aside style={{ width: 248, flexShrink: 0, height: '100%', boxSizing: 'border-box', background: 'var(--white)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 14px' }}>
          <img src={prostaMark} alt="" style={{ height: 34, width: 34, objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--blue-900)', letterSpacing: '-0.02em' }}>Prosta<span style={{ color: 'var(--blue-500)' }}>AI</span></span>
        </div>
        <div style={{ margin: '0 8px 12px', padding: '7px 10px', borderRadius: 'var(--radius-md)', background: 'var(--blue-50)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={role === 'doctor' ? 'stethoscope' : 'shield-check'} size={15} style={{ color: 'var(--blue-600)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-800)' }}>{role === 'doctor' ? 'Vai trò: Bác sĩ' : 'Vai trò: Quản trị viên'}</span>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {items.map(([key, label, icon]) => {
            const on = key === activeKey;
            return (
              <button key={key} className="nav-btn" onClick={() => go(key)} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: on ? 600 : 500, background: on ? 'var(--blue-50)' : 'transparent', color: on ? 'var(--blue-800)' : 'var(--gray-600)' }}>
                <Icon name={icon} size={18} /> {label}
              </button>
            );
          })}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-700)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-display)' }}>{initials}</div>
          <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{role === 'doctor' ? 'Bác sĩ giải phẫu bệnh' : 'Quản trị viên'}</div>
          </div>
          <button className="tb-ic" onClick={handleLogout} aria-label="Đăng xuất" style={{ width: 30, height: 30 }}><Icon name="log-out" size={16} /></button>
        </div>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ height: 60, flexShrink: 0, boxSizing: 'border-box', background: 'var(--white)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 22px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600 }}>{crumb}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)', letterSpacing: '-0.01em' }}>{title}</div>
          </div>
          {topActions}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="tb-ic" aria-label="Trợ giúp"><Icon name="life-buoy" size={18} /></button>
            <button className="tb-ic" aria-label="Thông báo"><Icon name="bell" size={18} /></button>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{screen}</main>
      </div>
    </div>
  );
}
