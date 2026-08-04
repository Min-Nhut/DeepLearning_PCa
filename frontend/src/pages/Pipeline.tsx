import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Disclaimer } from '../components/Histology';
import { StateMessage } from '../components/ui/StateMessage';
import { Icon } from '../lib/icon';
import * as api from '../lib/api';
import type { ApiInferenceRun, ModelInfoApi } from '../types';

const POLL_MS = 2500;

// Real pipeline stages (backend/app/inference/pipeline.py's run_pipeline()) —
// shown as a static reference list, not an animated per-step tracker: the
// backend only reports coarse pending/running/completed/failed status, so
// ticking these off one by one would fabricate progress that isn't real.
const STAGES: [string, string, string][] = [
  ['Tách patch 500×500', 'Chia ảnh gốc thành các ô mô, bỏ qua nền', 'grid-2x2'],
  ['Segmentation', 'Phân đoạn 6 lớp mô trên từng patch', 'layers'],
  ['Lọc patch nghi ngờ', 'Chỉ giữ patch có pixel Gleason 3/4/5', 'filter'],
  ['Classification', 'Phân loại Gleason Pattern trên patch nghi ngờ', 'grid-2x2'],
  ['Tổng hợp kết quả', 'Ghép mask, tính primary/secondary theo diện tích', 'calculator'],
];

function metricsHint(m: ModelInfoApi | undefined): string {
  if (!m || m.metrics.length === 0) return '';
  return m.metrics.slice(0, 2).map((x) => `${x.name} ${x.value}`).join(' · ');
}

function firstAvailable(models: ModelInfoApi[], task: 'segmentation' | 'classification'): string {
  return models.find((m) => m.task_type === task && m.checkpoint_available)?.arch_key || '';
}

export function Pipeline({ token, imageId, onDone, onBack }: {
  token: string;
  imageId: number;
  onDone: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'loading' | 'pick' | 'progress'>('loading');
  const [models, setModels] = useState<ModelInfoApi[]>([]);
  const [run, setRun] = useState<ApiInferenceRun | null>(null);
  const [segChoice, setSegChoice] = useState('');
  const [clfChoice, setClfChoice] = useState('');
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  function stopPolling() {
    clearInterval(pollTimer.current);
    pollTimer.current = undefined;
  }

  function startPolling() {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const r = await api.getInference(token, imageId);
        if (r) setRun(r);
        if (r && r.status !== 'pending' && r.status !== 'running') stopPolling();
      } catch {
        // transient network hiccup — keep polling, the next tick may succeed
      }
    }, POLL_MS);
  }

  useEffect(() => {
    let cancelled = false;
    setMode('loading');
    setInitError(null);
    (async () => {
      try {
        const [existing, modelList] = await Promise.all([
          api.getInference(token, imageId),
          api.getAvailableModels(token),
        ]);
        if (cancelled) return;
        setModels(modelList);
        if (existing) {
          setRun(existing);
          setMode('progress');
          if (existing.status === 'pending' || existing.status === 'running') startPolling();
        } else {
          setSegChoice(firstAvailable(modelList, 'segmentation'));
          setClfChoice(firstAvailable(modelList, 'classification'));
          setMode('pick');
        }
      } catch (err) {
        if (cancelled) return;
        setInitError(err instanceof api.ApiError ? err.message : 'Không thể tải thông tin phân tích AI.');
        setMode('pick');
      }
    })();
    return () => { cancelled = true; stopPolling(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, imageId]);

  async function handleStart() {
    setTriggerBusy(true);
    setInitError(null);
    try {
      const r = await api.triggerInference(token, imageId, {
        segmentation_model: segChoice || undefined,
        classification_model: clfChoice || undefined,
      });
      setRun(r);
      setMode('progress');
      if (r.status === 'pending' || r.status === 'running') startPolling();
    } catch (err) {
      setInitError(err instanceof api.ApiError ? err.message : 'Không thể khởi động phân tích AI.');
    } finally {
      setTriggerBusy(false);
    }
  }

  function handleRetry() {
    stopPolling();
    // Only reuse the failed run's own architecture choice if it's still a real,
    // available checkpoint — e.g. a bogus/unsupported arch_key (or one whose
    // checkpoint has since been removed) must not get silently resubmitted,
    // which would just fail again with the doctor never having picked anything.
    if (run) {
      const segStillAvailable = models.some((m) => m.task_type === 'segmentation' && m.checkpoint_available && m.arch_key === run.segmentation_model_version);
      const clfStillAvailable = models.some((m) => m.task_type === 'classification' && m.checkpoint_available && m.arch_key === run.classification_model_version);
      if (segStillAvailable && run.segmentation_model_version) setSegChoice(run.segmentation_model_version);
      else setSegChoice(firstAvailable(models, 'segmentation'));
      if (clfStillAvailable && run.classification_model_version) setClfChoice(run.classification_model_version);
      else setClfChoice(firstAvailable(models, 'classification'));
    }
    setInitError(null);
    setMode('pick');
  }

  const segOptions = models.filter((m) => m.task_type === 'segmentation' && m.checkpoint_available);
  const clfOptions = models.filter((m) => m.task_type === 'classification' && m.checkpoint_available);
  const selectedSeg = segOptions.find((m) => m.arch_key === segChoice);
  const selectedClf = clfOptions.find((m) => m.arch_key === clfChoice);
  const canStart = !!segChoice && !!clfChoice && !triggerBusy;

  if (mode === 'loading') return <StateMessage kind="loading" />;

  if (mode === 'pick') {
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
        <div style={{ marginBottom: 8 }}>
          <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Quay lại</Button>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px', color: 'var(--text-strong)' }}>Chọn mô hình AI</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Segmentation chạy trước, sau đó Classification trên các patch nghi ngờ.</p>
        </div>
        <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <Select
              label="Segmentation"
              value={segChoice}
              disabled={segOptions.length === 0}
              onChange={(e) => setSegChoice(e.target.value)}
              options={segOptions.length > 0
                ? segOptions.map((m) => ({ value: m.arch_key, label: m.name }))
                : [{ value: '', label: 'Chưa có checkpoint khả dụng' }]}
            />
            {selectedSeg && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{metricsHint(selectedSeg)}</div>}
          </div>
          <div>
            <Select
              label="Classification"
              value={clfChoice}
              disabled={clfOptions.length === 0}
              onChange={(e) => setClfChoice(e.target.value)}
              options={clfOptions.length > 0
                ? clfOptions.map((m) => ({ value: m.arch_key, label: m.name }))
                : [{ value: '', label: 'Chưa có checkpoint khả dụng' }]}
            />
            {selectedClf && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{metricsHint(selectedClf)}</div>}
          </div>
          {(segOptions.length === 0 || clfOptions.length === 0) && (
            <div style={{ fontSize: 12, color: 'var(--danger)' }}>Chưa có checkpoint khả dụng cho một trong hai tác vụ — không thể chạy phân tích.</div>
          )}
          {initError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{initError}</div>}
          <Button variant="accent" iconRight={<Icon name="arrow-right" />} disabled={!canStart} onClick={handleStart}>
            {triggerBusy ? 'Đang khởi động…' : 'Bắt đầu phân tích'}
          </Button>
        </div>
        <div style={{ marginTop: 18 }}><Disclaimer compact /></div>
      </div>
    );
  }

  const status = run?.status;
  const running = status === 'pending' || status === 'running';
  const failed = status === 'failed';
  const done = status === 'completed';

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <Button variant="ghost" size="sm" iconLeft={<Icon name="arrow-left" />} onClick={onBack}>Quay lại</Button>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: failed ? 'var(--danger-soft)' : done ? 'var(--success-soft)' : 'var(--blue-50)',
          color: failed ? 'var(--danger)' : done ? 'var(--success)' : 'var(--blue-600)',
        }}>
          {failed ? <Icon name="triangle-alert" size={28} /> : done ? <Icon name="check" size={28} /> : (
            <span style={{ display: 'inline-flex', animation: 'pa-spin 1s linear infinite' }}><Icon name="loader-2" size={28} /></span>
          )}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px', color: 'var(--text-strong)' }}>
          {failed ? 'Phân tích thất bại' : done ? 'Phân tích hoàn tất' : 'Đang chạy pipeline AI…'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          {failed ? run?.error_message : running ? 'Chạy trên CPU nên có thể mất một lúc — không cần tải lại trang.' : 'Segmentation → Classification → Tổng hợp Gleason'}
        </p>
        {run && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
            {run.segmentation_model_version} · {run.classification_model_version}
          </p>
        )}
      </div>
      <div style={{ background: 'var(--white)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 8 }}>
        {STAGES.map(([name, desc, icon]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', opacity: done ? 1 : failed ? 0.5 : 0.85 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--success-soft)' : 'var(--gray-100)', color: done ? 'var(--success)' : 'var(--text-muted)' }}>
              <Icon name={done ? 'check' : icon} size={15} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
        {done && <Button variant="accent" iconRight={<Icon name="arrow-right" />} onClick={onDone}>Xem kết quả</Button>}
        {failed && <Button variant="accent" iconLeft={<Icon name="refresh-cw" />} onClick={handleRetry}>Thử lại</Button>}
      </div>
      <div style={{ marginTop: 18 }}><Disclaimer compact /></div>
    </div>
  );
}
