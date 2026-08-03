import { useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import { useApiData } from '../lib/useApiData';
import type { ApiRole } from '../types';

const ROLE_LABEL: Record<ApiRole, string> = { admin: 'Quản trị viên', user: 'Bác sĩ' };
const ROLE_OPTIONS = [{ value: 'user', label: 'Bác sĩ' }, { value: 'admin', label: 'Quản trị viên' }];

export function Users({ token }: { token: string }) {
  const [users, reload] = useApiData(() => api.getUsers(token), [token]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'user' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate() {
    if (!form.username || !form.password) {
      setFormError('Cần nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.createUser(token, form);
      setForm({ username: '', password: '', full_name: '', role: 'user' });
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(err instanceof api.ApiError ? err.message : 'Không thể tạo người dùng.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(id: number, nextActive: boolean) {
    try {
      await api.updateUser(token, id, { is_active: nextActive });
      reload();
    } catch {
      // best-effort — the row simply won't update; user can retry the click
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <Button variant="primary" iconLeft={<Icon name="user-plus" />} onClick={() => setShowForm((v) => !v)}>Thêm người dùng</Button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
            <Input label="Tên đăng nhập" placeholder="ten@benhvien.vn" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            <Input label="Mật khẩu" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            <Input label="Họ tên" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            <Select label="Vai trò" options={ROLE_OPTIONS} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
          </div>
          {formError && <div style={{ fontSize: 13, color: 'var(--red-600)', marginBottom: 12 }}>{formError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Hủy</Button>
            <Button variant="primary" iconLeft={<Icon name="check" />} onClick={handleCreate} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu'}</Button>
          </div>
        </Card>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 110px', gap: 14, padding: '11px 18px', background: 'var(--gray-50)', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {['Người dùng · Tên đăng nhập', 'Vai trò', 'Lần chạy', 'Trạng thái'].map((t, i) => <span key={i}>{t}</span>)}
        </div>
        {users.status !== 'data' && <StateMessage kind={users.status === 'error' ? 'error' : 'loading'}>{users.status === 'error' ? users.message : undefined}</StateMessage>}
        {users.status === 'data' && users.data.map((u) => {
          const initial = (u.full_name || u.username).trim()[0].toUpperCase();
          return (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 110px 110px', gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--blue-700)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {initial}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{u.full_name || u.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.username}{u.last_activity ? ` · ${u.last_activity}` : ''}
                  </div>
                </div>
              </div>
              <Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-body)' }}>{u.run_count}</span>
              <Badge
                tone={u.is_active ? 'success' : 'neutral'}
                dot
                onClick={() => handleToggleActive(u.id, !u.is_active)}
                style={{ cursor: 'pointer' }}
                title={u.is_active ? 'Bấm để ngưng tài khoản' : 'Bấm để kích hoạt lại'}
              >
                {u.is_active ? 'Hoạt động' : 'Ngưng'}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
