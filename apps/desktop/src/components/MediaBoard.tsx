import React, { useState } from 'react';
import { makeMedia, mediaLabel, parseMediaUrl, sortMedia, type Media } from '@mission/core';
import { useStore } from '../store';
import { Button } from './ui';

interface Props {
  media: Media[] | undefined;
  onChange?: (media: Media[]) => void;
  /** 'grid' for the board itself, 'strip' for a scrolling row in a card. */
  variant?: 'grid' | 'strip';
  emptyHint?: string;
}

/**
 * The vision board. Photos are copied into the app's own folder (and uploaded
 * when sync is on); video and web links are stored as links, with YouTube and
 * Vimeo resolved down to a thumbnail so the board is all pictures rather than
 * a list of blue text.
 */
export function MediaBoard({ media, onChange, variant = 'grid', emptyHint }: Props) {
  const { ingestMedia } = useStore();
  const [pasting, setPasting] = useState(false);
  const [url, setUrl] = useState('');
  const items = sortMedia(media);
  const editable = Boolean(onChange);

  const append = async (urls: string[]) => {
    if (!onChange || urls.length === 0) return;
    const stored = await ingestMedia(urls);
    onChange([...items, ...stored.map((u, i) => makeMedia(u, items.length + i))]);
  };

  const addFromDisk = async () => {
    const picked = await window.mission?.pickMedia();
    await append(picked ?? []);
  };

  const addFromUrl = async () => {
    if (!url.trim()) return;
    await append([url.trim()]);
    setUrl('');
    setPasting(false);
  };

  const open = (m: Media) => {
    const parsed = parseMediaUrl(m.url);
    if (/^https?:/i.test(parsed.openUrl)) window.mission?.openExternal(parsed.openUrl);
  };

  return (
    <div className="stack">
      {items.length === 0 && !editable && emptyHint && (
        <p className="small muted">{emptyHint}</p>
      )}

      {items.length > 0 && (
        <div className={variant === 'grid' ? 'media-grid' : 'media-strip'}>
          {items.map((m) => {
            const parsed = parseMediaUrl(m.url);
            return (
              <div key={m.id} className={`media-card ${parsed.thumbnailUrl ? '' : 'media-link'}`}
                   onClick={() => open(m)} title={m.caption ?? m.url}>
                {parsed.thumbnailUrl ? (
                  <img src={parsed.thumbnailUrl} alt={m.caption ?? ''} loading="lazy" />
                ) : (
                  <span className="small">{mediaLabel(m)}</span>
                )}
                {parsed.kind === 'video' && <span className="media-play">▶</span>}
                {parsed.provider === 'file' && <span className="media-badge">on this pc</span>}
                {m.caption && parsed.thumbnailUrl && (
                  <span className="media-caption">{m.caption}</span>
                )}
                {editable && (
                  <button className="media-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChange!(items.filter((x) => x.id !== m.id));
                          }}
                          aria-label="Remove">
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editable && (
        <>
          {items.length > 0 && (
            <div className="grid grid-2">
              {items.map((m) => (
                <input key={m.id} value={m.caption ?? ''} placeholder={`Caption — ${mediaLabel(m)}`}
                       onChange={(e) => onChange!(items.map((x) =>
                         x.id === m.id ? { ...x, caption: e.target.value || undefined } : x))} />
              ))}
            </div>
          )}

          <div className="row">
            <Button onClick={addFromDisk}>Add photo or video</Button>
            <Button onClick={() => setPasting((v) => !v)}>Paste a link</Button>
          </div>

          {pasting && (
            <div className="row">
              <input autoFocus value={url} placeholder="YouTube, Vimeo, an image URL, anything"
                     onChange={(e) => setUrl(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') void addFromUrl(); }} />
              <Button variant="primary" onClick={addFromUrl}>Add</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
