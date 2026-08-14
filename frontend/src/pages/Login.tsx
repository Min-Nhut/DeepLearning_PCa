import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { OTHER_PORTAL_LABEL, OTHER_PORTAL_URL, PORTAL, PORTAL_LABEL, roleMatchesPortal } from '../lib/portal';
import prostaMark from '../assets/prosta-mark.png';
import type { MeResponse } from '../types';

export function Login({ onLoggedIn }: { onLoggedIn: (token: string, me: MeResponse) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wrongPortal, setWrongPortal] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setError(null);
    setWrongPortal(false);
    setLoading(true);
    try {
      const { access_token } = await api.login(username, password);
      const me = await api.getMe(access_token);
      // The credentials are valid — they just belong to the other portal. Say so
      // plainly instead of letting the wrong UI load and 403 on every request.
      if (!roleMatchesPortal(me.role)) {
        setWrongPortal(true);
        setError(`Tài khoản này thuộc ${OTHER_PORTAL_LABEL}, không đăng nhập được ở ${PORTAL_LABEL}.`);
        return;
      }
      onLoggedIn(access_token, me);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : 'Không thể kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 8%', background: 'var(--white)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <img src={prostaMark} alt="" style={{ height: 44, width: 44, objectFit: 'contain' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--blue-900)', letterSpacing: '-0.02em' }}>
            Prosta<span style={{ color: 'var(--blue-500)' }}>AI</span>
          </span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start', padding: '5px 11px', marginBottom: 14, borderRadius: 999, background: 'var(--blue-50)' }}>
          <Icon name={PORTAL === 'admin' ? 'shield-check' : 'stethoscope'} size={14} style={{ color: 'var(--blue-600)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue-800)' }}>{PORTAL_LABEL}</span>
        </div>
        <h1 style={{ fontSize: 30, marginBottom: 8, fontFamily: 'var(--font-display)', color: 'var(--text-strong)' }}>Chào mừng trở lại</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          {PORTAL === 'admin' ? 'Đăng nhập vào khu vực quản trị hệ thống.' : 'Đăng nhập vào không gian chẩn đoán của bạn.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 380 }}>
          <Input
            label="Tên đăng nhập"
            placeholder="ten@benhvien.vn"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            iconLeft={<Icon name="mail" />}
          />
          <Input
            label="Mật khẩu"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            iconLeft={<Icon name="lock" />}
          />
          {error && <div style={{ fontSize: 13, color: 'var(--red-600)' }}>{error}</div>}
          {wrongPortal && (
            <a href={OTHER_PORTAL_URL} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--blue-600)', textDecoration: 'none' }}>
              <Icon name="external-link" size={14} /> Chuyển sang {OTHER_PORTAL_LABEL}
            </a>
          )}
          <Button variant="primary" fullWidth iconLeft={<Icon name="log-in" />} onClick={handleLogin} disabled={loading}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>

        </div>
      </div>
      <div style={{ position: 'relative', background: 'linear-gradient(150deg, var(--blue-950), var(--blue-700))', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 8%', color: '#fff', overflow: 'hidden' }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 16 }}>Explainable AI</div>
          <h2 style={{ color: '#fff', fontSize: 32, lineHeight: 1.25, marginBottom: 16, maxWidth: 440, fontFamily: 'var(--font-display)' }}>
            Hỗ trợ chẩn đoán ung thư tuyến tiền liệt bằng AI giải thích được.
          </h2>
          <p style={{ color: 'rgba(255,255,255,.82)', maxWidth: 420, lineHeight: 1.6 }}>
            Phân đoạn tuyến, phân loại Gleason pattern và overlay tương tác — bác sĩ luôn là người ra quyết định cuối cùng.
          </p>
          <div style={{ display: 'flex', gap: 22, marginTop: 30 }}>
            {([['shield-check', 'Chính xác'], ['lock', 'Bảo mật'], ['heart-pulse', 'Tận tâm']] as const).map(([i, t]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,.9)' }}>
                <Icon name={i} size={18} /> {t}
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', right: -40, bottom: -40, width: 320, height: 320, borderRadius: '50%', border: '40px solid rgba(255,255,255,.06)' }} />
      </div>
    </div>
  );
}
