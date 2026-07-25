import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Code2, Heading1, Heading2, ImagePlus,
  Italic, Link, List, ListOrdered, Minus, Quote, Redo2, RemoveFormatting,
  Strikethrough, Trash2, Underline, Undo2, X, Youtube,
} from 'lucide-react';

interface RichEditorProps {
  initialHtml?: string;
  onChange: (html: string) => void;
}

type MediaSelection = {
  element: HTMLElement;
  width: number;
};

const youtubeId = (value: string) => {
  try {
    const url = new URL(value.trim());
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('/')[0];
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2];
    return url.searchParams.get('v');
  } catch {
    return null;
  }
};

export default function RichEditor({ initialHtml = '', onChange }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const initialized = useRef(false);
  const [selected, setSelected] = useState<MediaSelection | null>(null);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeError, setYoutubeError] = useState('');

  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = initialHtml;
      initialized.current = true;
    }
  }, [initialHtml]);

  const emit = () => {
    if (!editorRef.current) return;
    const clean = editorRef.current.cloneNode(true) as HTMLElement;
    clean.querySelectorAll('.editor-media').forEach((item) => {
      item.classList.remove('selected');
      item.removeAttribute('data-drag-id');
    });
    onChange(clean.innerHTML);
  };

  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    editorRef.current?.focus();
    const selection = window.getSelection();
    if (selection && savedRange.current) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
  };

  const command = (name: string, value?: string) => {
    restoreSelection();
    document.execCommand(name, false, value);
    rememberSelection();
    emit();
  };

  const insertHtml = (html: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    emit();
  };

  const addLink = () => {
    const value = window.prompt('Masukkan alamat tautan lengkap:');
    if (!value) return;
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    command('createLink', href);
  };

  const addImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      insertHtml(`<figure class="editor-media" contenteditable="false" style="width:70%;margin-left:auto;margin-right:auto" draggable="true"><img src="${reader.result}" alt="${file.name.replace(/"/g, '&quot;')}"><figcaption contenteditable="true">Tambahkan keterangan gambar…</figcaption><span class="media-resize" aria-hidden="true"></span></figure><p><br></p>`);
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const addYoutube = () => {
    const id = youtubeId(youtubeUrl);
    if (!id) {
      setYoutubeError('Link YouTube tidak dikenali. Gunakan link video, Shorts, atau youtu.be.');
      return;
    }
    insertHtml(`<figure class="editor-media video-media" contenteditable="false" style="width:80%;margin-left:auto;margin-right:auto" draggable="true"><div class="video-frame"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube video" allowfullscreen></iframe></div><figcaption contenteditable="true">Tambahkan keterangan video…</figcaption><span class="media-resize" aria-hidden="true"></span></figure><p><br></p>`);
    setYoutubeOpen(false);
    setYoutubeUrl('');
    setYoutubeError('');
  };

  const selectMedia = (element: HTMLElement | null) => {
    editorRef.current?.querySelectorAll('.editor-media.selected').forEach((item) => item.classList.remove('selected'));
    if (!element) {
      setSelected(null);
      return;
    }
    element.classList.add('selected');
    setSelected({ element, width: Math.round(element.getBoundingClientRect().width / (editorRef.current?.clientWidth || 1) * 100) });
  };

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const media = (event.target as HTMLElement).closest('.editor-media') as HTMLElement | null;
    if (media) {
      event.preventDefault();
      event.stopPropagation();
    }
    selectMedia(media);
  };

  const setMediaWidth = (width: number) => {
    if (!selected) return;
    const safeWidth = Math.max(25, Math.min(100, width));
    selected.element.style.width = `${safeWidth}%`;
    setSelected({ element: selected.element, width: safeWidth });
    emit();
  };

  const alignMedia = (alignment: 'left' | 'center' | 'right') => {
    if (!selected) return;
    selected.element.style.marginLeft = alignment === 'left' ? '0' : 'auto';
    selected.element.style.marginRight = alignment === 'right' ? '0' : 'auto';
    emit();
  };

  const removeMedia = () => {
    if (!selected) return;
    selected.element.remove();
    setSelected(null);
    emit();
  };

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    const handle = (event.target as HTMLElement).closest('.media-resize');
    const media = (event.target as HTMLElement).closest('.editor-media') as HTMLElement | null;
    if (!handle || !media || !editorRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    selectMedia(media);
    media.setAttribute('draggable', 'false');
    document.body.classList.add('is-resizing-media');
    const startX = event.clientX;
    const startWidth = media.getBoundingClientRect().width;
    const parentWidth = editorRef.current.clientWidth;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const width = Math.max(25, Math.min(100, ((startWidth + moveEvent.clientX - startX) / parentWidth) * 100));
      media.style.width = `${width}%`;
      setSelected({ element: media, width: Math.round(width) });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      media.setAttribute('draggable', 'true');
      document.body.classList.remove('is-resizing-media');
      emit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.media-resize')) {
      event.preventDefault();
      return;
    }
    const media = (event.target as HTMLElement).closest('.editor-media') as HTMLElement | null;
    if (!media) return;
    event.dataTransfer.setData('text/editor-media-id', media.dataset.dragId || '');
    if (!media.dataset.dragId) {
      media.dataset.dragId = `media-${Date.now()}`;
      event.dataTransfer.setData('text/editor-media-id', media.dataset.dragId);
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const id = event.dataTransfer.getData('text/editor-media-id');
    if (!id || !editorRef.current) return;
    event.preventDefault();
    const media = editorRef.current.querySelector(`[data-drag-id="${id}"]`);
    const target = (event.target as HTMLElement).closest('p,h1,h2,h3,blockquote,ul,ol,figure');
    if (media && target && media !== target) {
      target.insertAdjacentElement(event.clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2 ? 'beforebegin' : 'afterend', media);
      emit();
    }
  };

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" onMouseDown={(event) => event.preventDefault()}>
        <div className="tool-group">
          <Tool title="Batalkan" onClick={() => command('undo')}><Undo2 /></Tool>
          <Tool title="Ulangi" onClick={() => command('redo')}><Redo2 /></Tool>
        </div>
        <div className="tool-group">
          <Tool title="Judul utama" onClick={() => command('formatBlock', 'h1')}><Heading1 /></Tool>
          <Tool title="Subjudul" onClick={() => command('formatBlock', 'h2')}><Heading2 /></Tool>
          <Tool title="Paragraf" onClick={() => command('formatBlock', 'p')}>P</Tool>
        </div>
        <div className="tool-group">
          <Tool title="Tebal" onClick={() => command('bold')}><Bold /></Tool>
          <Tool title="Miring" onClick={() => command('italic')}><Italic /></Tool>
          <Tool title="Garis bawah" onClick={() => command('underline')}><Underline /></Tool>
          <Tool title="Coret" onClick={() => command('strikeThrough')}><Strikethrough /></Tool>
        </div>
        <div className="tool-group">
          <Tool title="Daftar poin" onClick={() => command('insertUnorderedList')}><List /></Tool>
          <Tool title="Daftar nomor" onClick={() => command('insertOrderedList')}><ListOrdered /></Tool>
          <Tool title="Kutipan" onClick={() => command('formatBlock', 'blockquote')}><Quote /></Tool>
          <Tool title="Kode" onClick={() => command('formatBlock', 'pre')}><Code2 /></Tool>
        </div>
        <div className="tool-group">
          <Tool title="Rata kiri" onClick={() => command('justifyLeft')}><AlignLeft /></Tool>
          <Tool title="Rata tengah" onClick={() => command('justifyCenter')}><AlignCenter /></Tool>
          <Tool title="Rata kanan" onClick={() => command('justifyRight')}><AlignRight /></Tool>
        </div>
        <div className="tool-group">
          <Tool title="Tambah tautan" onClick={addLink}><Link /></Tool>
          <Tool title="Upload gambar" onClick={() => { rememberSelection(); uploadRef.current?.click(); }}><ImagePlus /></Tool>
          <Tool title="Embed YouTube" onClick={() => { rememberSelection(); setYoutubeOpen(true); }}><Youtube /></Tool>
          <Tool title="Hapus format" onClick={() => command('removeFormat')}><RemoveFormatting /></Tool>
        </div>
      </div>

      {selected && (
        <div className="media-inspector">
          <strong>Media dipilih</strong>
          <button onClick={() => setMediaWidth(selected.width - 10)} title="Perkecil"><Minus /></button>
          <input type="range" min="25" max="100" value={selected.width} onChange={(event) => setMediaWidth(Number(event.target.value))} />
          <span>{selected.width}%</span>
          <button onClick={() => setMediaWidth(selected.width + 10)} title="Perbesar">+</button>
          <span className="inspector-divider" />
          <button onClick={() => alignMedia('left')} title="Posisi kiri"><AlignLeft /></button>
          <button onClick={() => alignMedia('center')} title="Posisi tengah"><AlignCenter /></button>
          <button onClick={() => alignMedia('right')} title="Posisi kanan"><AlignRight /></button>
          <button className="danger" onClick={removeMedia} title="Hapus media"><Trash2 /></button>
        </div>
      )}

      <div
        ref={editorRef}
        className="editable-surface"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Mulai menulis artikel di sini…"
        onInput={emit}
        onBlur={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onClick={handleEditorClick}
        onPointerDown={startResize}
        onDragStart={onDragStart}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      />
      <input ref={uploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={addImage} />
      <div className="editor-help">Tip: klik media untuk mengatur ukuran dan posisi. Tarik blok media ke paragraf lain untuk memindahkannya.</div>

      {youtubeOpen && (
        <div className="editor-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setYoutubeOpen(false)}>
          <div className="editor-dialog">
            <button className="dialog-close" onClick={() => setYoutubeOpen(false)}><X /></button>
            <Youtube className="youtube-mark" />
            <h3>Sematkan video YouTube</h3>
            <p>Tempel link video biasa, Shorts, atau link youtu.be.</p>
            <input autoFocus value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setYoutubeError(''); }} placeholder="https://www.youtube.com/watch?v=…" />
            {youtubeError && <span className="dialog-error">{youtubeError}</span>}
            <div><button className="button secondary" onClick={() => setYoutubeOpen(false)}>Batal</button><button className="button primary" onClick={addYoutube}>Sematkan video</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tool({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick}>{children}</button>;
}
