import React, { useEffect, useState } from 'react';
import { fetchProtectedFile, openProtectedFile } from '../../services/api';

/**
 * An image stored behind the API's session check (maintenance photos). A plain
 * <img src> cannot load it because the browser sends no token, so the file is fetched
 * with the session and shown from an object URL. Clicking opens the full-size file.
 */
export default function ProtectedImage({ src, alt, className = '' }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    setUrl(null);
    setFailed(false);

    fetchProtectedFile(src)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else { objectUrl = u; setUrl(u); }
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) {
    return (
      <div role="img" aria-label={alt} title="This photo could not be loaded" className={`${className} bg-slate-100 text-slate-400 text-[10px] flex items-center justify-center`}>
        Unavailable
      </div>
    );
  }
  if (!url) {
    return <div aria-hidden="true" className={`${className} bg-slate-100 animate-pulse`} />;
  }
  return (
    <button
      type="button"
      onClick={() => openProtectedFile(src).catch(() => {})}
      title="Open full size"
      className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      <img src={url} alt={alt} className={className} />
    </button>
  );
}
