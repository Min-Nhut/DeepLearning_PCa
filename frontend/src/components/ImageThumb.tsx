import { useEffect, useState } from 'react';
import * as api from '../lib/api';
import { Icon } from '../lib/icon';

/**
 * Renders a real uploaded image by id (fetched as an authenticated blob, since
 * a plain <img src> can't carry an Authorization header). Falls back to a
 * neutral placeholder while loading or on error — never silently shows
 * nothing, since a blank tile in a pathology viewer reads as "no problem".
 */
export function ImageThumb({ imageId, token, size = 'thumb', style }: {
  imageId: number;
  token: string;
  size?: 'thumb' | 'view' | 'original';
  style?: React.CSSProperties;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    api.getImageBlobUrl(token, imageId, size)
      .then((u) => { if (!cancelled) { objectUrl = u; setUrl(u); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, token, size]);

  const base: React.CSSProperties = {
    width: '100%', height: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden',
    background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
  };

  if (failed) {
    return <div style={{ ...base, color: 'var(--text-muted)' }}><Icon name="image-off" size={18} /></div>;
  }
  if (!url) {
    return <div style={{ ...base, color: 'var(--text-muted)' }}><Icon name="loader-2" size={18} style={{ animation: 'pa-spin 1s linear infinite' }} /></div>;
  }
  return (
    <div style={base}>
      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}
