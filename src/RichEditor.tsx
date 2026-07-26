import { ChangeEvent, DragEvent, MouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Code2, Heading1, Heading2, ImagePlus,
  Italic, Link, List, ListOrdered, LoaderCircle, Minus, Quote, Redo2, RemoveFormatting,
  Sparkles, Strikethrough, Trash2, Underline, Undo2, X, Youtube,
} from 'lucide-react';
import { generateArticleWithAI } from './firebase';

interface RichEditorProps {
  initialHtml?: string;
  onChange: (html: string) => void;
  articleContext?: {
    title: string;
    category: string;
    summary: string;
  };
}

type MediaSelection = {
  element: HTMLElement;
  width: number;
};

type AiMode = 'draft' | 'continue' | 'improve' | 'summarize';
type SelectionAction = 'improve' | 'rewrite';
type TextSelection = {
  text: string;
  top: number;
  left: number;
};

const aiModeLabels: Record<AiMode, { title: string; description: string }> = {
  draft: { title: 'Buat artikel lengkap', description: 'Susun draf terstruktur dari judul, kategori, dan ringkasan.' },
  continue: { title: 'Lanjutkan tulisan', description: 'Tambahkan bagian berikutnya berdasarkan isi artikel saat ini.' },
  improve: { title: 'Rapikan seluruh artikel', description: 'Perjelas bahasa, alur, dan format tanpa mengubah maksud.' },
  summarize: { title: 'Buat ringkasan penutup', description: 'Tambahkan rangkuman singkat dan poin tindakan utama.' },
};

const sanitizeAiHtml = (raw: string) => {
  const parser = new DOMParser();
  const document = parser.parseFromString(raw.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, ''), 'text/html');
  const allowed = new Set(['H1', 'H2', 'H3', 'P', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'U', 'S', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'BR', 'HR', 'DIV', 'SPAN']);
  const removable = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON']);

  Array.from(document.body.querySelectorAll('*')).forEach((element) => {
    if (removable.has(element.tagName)) {
      element.remove();
      return;
    }
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    const className = element.getAttribute('class') || '';
    const safeClasses = className.split(/\s+/).filter((name) => ['lead', 'callout', 'danger', 'check-list'].includes(name));
    const href = element.tagName === 'A' ? element.getAttribute('href') || '' : '';
    Array.from(element.attributes).forEach((attribute) => element.removeAttribute(attribute.name));
    if (safeClasses.length) element.setAttribute('class', safeClasses.join(' '));
    if (element.tagName === 'A' && /^https?:\/\//i.test(href)) {
      element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return document.body.innerHTML.trim();
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

export default function RichEditor({ initialHtml = '', onChange, articleContext }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const spacingRange = useRef<Range | null>(null);
  const selectedTextRange = useRef<Range | null>(null);
  const initialized = useRef(false);
  const [selected, setSelected] = useState<MediaSelection | null>(null);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeError, setYoutubeError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>('draft');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [selectionAction, setSelectionAction] = useState<SelectionAction>('improve');
  const [selectionInstruction, setSelectionInstruction] = useState('');
  const [selectionResult, setSelectionResult] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [spacingBefore, setSpacingBefore] = useState(0);
  const [spacingAfter, setSpacingAfter] = useState(8);
  const [spacingTargetCount, setSpacingTargetCount] = useState(0);

  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = initialHtml;
      initialized.current = true;
    }
  }, [initialHtml]);

  useEffect(() => {
    const clearCollapsedSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) setTextSelection(null);
    };
    const clearOnScroll = () => setTextSelection(null);
    document.addEventListener('selectionchange', clearCollapsedSelection);
    window.addEventListener('scroll', clearOnScroll, true);
    return () => {
      document.removeEventListener('selectionchange', clearCollapsedSelection);
      window.removeEventListener('scroll', clearOnScroll, true);
    };
  }, []);

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
      const range = selection.getRangeAt(0).cloneRange();
      savedRange.current = range;
      spacingRange.current = range.cloneRange();
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

  const spacingTargets = () => {
    const root = editorRef.current;
    const range = spacingRange.current;
    const matches: HTMLElement[] = [];
    if (!root || !range) return new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>('p,h1,h2,h3,blockquote,pre,li').forEach((block) => {
      if (range.intersectsNode(block)) matches.push(block);
    });
    const deepestMatches = matches.filter((block) => !matches.some((candidate) => candidate !== block && block.contains(candidate)));
    return new Set(deepestMatches);
  };

  const spacingInPoints = (value: string) => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return 0;
    const points = value.trim().endsWith('pt') ? parsed : parsed * 0.75;
    return Math.round(points * 2) / 2;
  };

  const syncSpacingFromSelection = () => {
    const targets = spacingTargets();
    const block = targets.values().next().value as HTMLElement | undefined;
    setSpacingTargetCount(targets.size);
    if (!block) return;
    const computed = window.getComputedStyle(block);
    const before = block.style.marginTop
      ? spacingInPoints(block.style.marginTop)
      : spacingInPoints(computed.marginTop);
    const after = block.style.marginBottom
      ? spacingInPoints(block.style.marginBottom)
      : spacingInPoints(computed.marginBottom);
    setSpacingBefore(before);
    setSpacingAfter(after);
  };

  const applyParagraphSpacing = (beforeValue: number, afterValue: number, reset = false) => {
    const targets = spacingTargets();
    if (!targets.size) return;
    const before = Math.max(0, Math.min(144, beforeValue || 0));
    const after = Math.max(0, Math.min(144, afterValue || 0));
    targets.forEach((target) => {
      target.classList.remove('spacing-tight', 'spacing-relaxed');
      if (target.tagName === 'LI') target.closest('ul,ol')?.classList.remove('spacing-tight', 'spacing-relaxed');
      if (reset) {
        target.style.removeProperty('margin-top');
        target.style.removeProperty('margin-bottom');
      } else {
        target.style.marginTop = `${before}pt`;
        target.style.marginBottom = `${after}pt`;
      }
    });
    emit();
  };

  const updateSpacingBefore = (value: number) => {
    const next = Math.max(0, Math.min(144, value || 0));
    setSpacingBefore(next);
    applyParagraphSpacing(next, spacingAfter);
  };

  const updateSpacingAfter = (value: number) => {
    const next = Math.max(0, Math.min(144, value || 0));
    setSpacingAfter(next);
    applyParagraphSpacing(spacingBefore, next);
  };

  const resetParagraphSpacing = () => {
    applyParagraphSpacing(0, 0, true);
    syncSpacingFromSelection();
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

  const captureTextSelection = () => {
    rememberSelection();
    syncSpacingFromSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !editorRef.current) {
      setTextSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      setTextSelection(null);
      return;
    }

    const text = selection.toString().trim();
    if (text.length < 2) {
      setTextSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    selectedTextRange.current = range.cloneRange();
    setTextSelection({
      text,
      top: rect.top > 58 ? rect.top - 48 : rect.bottom + 8,
      left: Math.max(138, Math.min(window.innerWidth - 138, rect.left + rect.width / 2)),
    });
  };

  const closeAi = () => {
    if (aiLoading) return;
    setAiOpen(false);
    setAiResult('');
    setAiError('');
  };

  const requestAi = async () => {
    if (aiMode === 'draft' && !articleContext?.title.trim()) {
      setAiError('Isi judul artikel terlebih dahulu agar AI memahami topiknya.');
      return;
    }

    const currentHtml = editorRef.current?.innerHTML || '';
    const tasks: Record<AiMode, string> = {
      draft: 'Tulis artikel operasional yang lengkap, praktis, dan siap digunakan. Buat pembuka singkat, beberapa bagian H2, langkah atau checklist bila relevan, dan penutup.',
      continue: 'Lanjutkan artikel ini dengan bagian baru yang paling logis. Jangan ulangi isi yang sudah ada.',
      improve: 'Tulis ulang seluruh isi agar lebih jelas, ringkas, konsisten, dan mudah dipraktikkan. Pertahankan semua fakta penting.',
      summarize: 'Buat bagian penutup berisi rangkuman singkat dan poin tindakan utama. Jangan ulangi paragraf panjang.',
    };
    const prompt = `Anda adalah editor SOP dan knowledge base gudang berbahasa Indonesia.

Judul: ${articleContext?.title || 'Belum diisi'}
Kategori: ${articleContext?.category || 'Belum diisi'}
Ringkasan: ${articleContext?.summary || 'Belum diisi'}

Tugas: ${tasks[aiMode]}
Instruksi tambahan dari pengguna: ${aiInstruction.trim() || 'Tidak ada.'}

Isi artikel saat ini:
${currentHtml.slice(0, 14000)}

Aturan keluaran:
- Kembalikan HANYA HTML isi artikel, tanpa markdown dan tanpa tag html/body.
- Gunakan hanya h1, h2, h3, p, ul, ol, li, strong, em, blockquote, pre, code, a, br, hr.
- Jangan mengarang nomor peraturan, statistik, nama sistem, atau fakta yang tidak diberikan.
- Gunakan bahasa Indonesia profesional, jelas, dan langsung dapat dipraktikkan.
- Jangan menyertakan gambar, iframe, script, style, formulir, atau tombol.`;

    setAiLoading(true);
    setAiError('');
    setAiResult('');
    try {
      const response = await generateArticleWithAI(prompt);
      const clean = sanitizeAiHtml(response);
      if (!clean) throw new Error('AI tidak menghasilkan isi yang dapat digunakan.');
      setAiResult(clean);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Permintaan AI gagal. Coba lagi beberapa saat.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAi = (replace: boolean) => {
    if (!aiResult || !editorRef.current) return;
    if (replace) {
      editorRef.current.innerHTML = aiResult;
      emit();
    } else {
      insertHtml(aiResult);
    }
    setAiOpen(false);
    setAiResult('');
    setAiError('');
  };

  const openSelectionAssistant = (action: SelectionAction) => {
    setSelectionAction(action);
    setSelectionInstruction('');
    setSelectionResult('');
    setSelectionError('');
    setSelectionOpen(true);
    setTextSelection(null);
  };

  const closeSelectionAssistant = () => {
    if (selectionLoading) return;
    setSelectionOpen(false);
    setSelectionResult('');
    setSelectionError('');
  };

  const requestSelectionSuggestion = async () => {
    const selectedText = selectedTextRange.current?.toString().trim() || '';
    if (!selectedText) {
      setSelectionError('Teks yang dipilih sudah tidak tersedia. Pilih kembali kalimat pada artikel.');
      return;
    }
    if (selectedText.length > 2500) {
      setSelectionError('Teks yang dipilih terlalu panjang. Pilih maksimal beberapa paragraf pendek.');
      return;
    }

    const task = selectionAction === 'improve'
      ? 'Perbaiki ejaan, tata bahasa, kejelasan, dan efektivitas kalimat tanpa mengubah fakta atau maksud.'
      : 'Tulis ulang teks sesuai instruksi pengguna. Pertahankan fakta dan jangan menambahkan informasi baru.';
    const prompt = `Anda adalah editor SOP dan knowledge base gudang berbahasa Indonesia.

Tugas: ${task}
Instruksi pengguna: ${selectionInstruction.trim() || (selectionAction === 'rewrite' ? 'Buat lebih jelas dan profesional.' : 'Tidak ada instruksi tambahan.')}

Teks yang dipilih:
${selectedText}

Konteks artikel:
${(editorRef.current?.innerText || '').slice(0, 6000)}

Aturan panjang dan kelengkapan:
- Jangan otomatis meringkas atau memendekkan teks.
- Tentukan panjang yang wajar dari maksud teks, konteks artikel, dan instruksi pengguna; hasil boleh pendek atau panjang sesuai kebutuhan.
- Jika pengguna meminta hasil lengkap, mendalam, panjang, tajam, atau terperinci, kembangkan teks secara proporsional menjadi beberapa kalimat atau paragraf bila diperlukan.
- Jika tidak ada permintaan khusus tentang panjang, pertahankan kurang lebih tingkat rincian dan cakupan teks asli.
- Hilangkan pengulangan yang tidak perlu, tetapi jangan menghapus rincian penting hanya demi membuat hasil lebih singkat.
- Jangan menambahkan fakta, angka, kebijakan, atau prosedur baru yang tidak tersedia pada teks atau konteks.

Kembalikan HANYA teks pengganti yang utuh, tanpa tanda kutip, penjelasan, markdown, atau HTML. Tidak ada batas jumlah kalimat selama semuanya relevan.`;

    setSelectionLoading(true);
    setSelectionError('');
    setSelectionResult('');
    try {
      const response = await generateArticleWithAI(prompt);
      const cleanResponse = response.replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/i, '');
      const document = new DOMParser().parseFromString(cleanResponse, 'text/html');
      const clean = (document.body.textContent || '').trim().replace(/^["“]|["”]$/g, '');
      if (!clean) throw new Error('Gemini tidak menghasilkan saran yang dapat digunakan.');
      setSelectionResult(clean);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : 'Gemini belum dapat membuat saran. Coba lagi.');
    } finally {
      setSelectionLoading(false);
    }
  };

  const applySelectionSuggestion = () => {
    const range = selectedTextRange.current;
    if (!range || !selectionResult) {
      setSelectionError('Teks yang dipilih sudah tidak tersedia. Pilih kembali kalimat pada artikel.');
      return;
    }

    const replacement = document.createTextNode(selectionResult);
    range.deleteContents();
    range.insertNode(replacement);
    range.setStartAfter(replacement);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange.current = range.cloneRange();
    selectedTextRange.current = null;
    setSelectionOpen(false);
    setSelectionResult('');
    setSelectionError('');
    emit();
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
        <div className="tool-group spacing-live-group" onMouseDown={(event) => event.stopPropagation()}>
          <span
            className={`spacing-live-mark${spacingTargetCount ? ' active' : ''}`}
            title={spacingTargetCount ? `${spacingTargetCount} blok teks dipilih` : 'Klik paragraf atau sorot beberapa paragraf'}
          >↕</span>
          <label title="Jarak sebelum paragraf">
            <span>Sebelum</span>
            <span className="spacing-live-input">
              <input
                type="number"
                min="0"
                max="144"
                step="0.5"
                value={spacingBefore}
                disabled={!spacingTargetCount}
                onChange={(event) => updateSpacingBefore(Number(event.target.value))}
              />
              <em>pt</em>
            </span>
          </label>
          <label title="Jarak sesudah paragraf">
            <span>Sesudah</span>
            <span className="spacing-live-input">
              <input
                type="number"
                min="0"
                max="144"
                step="0.5"
                value={spacingAfter}
                disabled={!spacingTargetCount}
                onChange={(event) => updateSpacingAfter(Number(event.target.value))}
              />
              <em>pt</em>
            </span>
          </label>
          <button type="button" className="spacing-live-reset" disabled={!spacingTargetCount} onClick={resetParagraphSpacing} title="Gunakan jarak bawaan">Bawaan</button>
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
        <div className="tool-group ai-tool-group">
          <Tool title="Bantuan AI" onClick={() => { rememberSelection(); setAiOpen(true); }}><Sparkles /></Tool>
        </div>
      </div>

      {selected && (
        <div className="media-inspector">
          <strong>Media dipilih</strong>
          <button type="button" onClick={() => setMediaWidth(selected.width - 10)} title="Perkecil"><Minus /></button>
          <input type="range" min="25" max="100" value={selected.width} onChange={(event) => setMediaWidth(Number(event.target.value))} />
          <span>{selected.width}%</span>
          <button type="button" onClick={() => setMediaWidth(selected.width + 10)} title="Perbesar">+</button>
          <span className="inspector-divider" />
          <button type="button" onClick={() => alignMedia('left')} title="Posisi kiri"><AlignLeft /></button>
          <button type="button" onClick={() => alignMedia('center')} title="Posisi tengah"><AlignCenter /></button>
          <button type="button" onClick={() => alignMedia('right')} title="Posisi kanan"><AlignRight /></button>
          <button type="button" className="danger" onClick={removeMedia} title="Hapus media"><Trash2 /></button>
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
        onKeyUp={captureTextSelection}
        onMouseUp={captureTextSelection}
        onClick={handleEditorClick}
        onPointerDown={startResize}
        onDragStart={onDragStart}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      />
      {textSelection && (
        <div
          className="selection-ai-popover"
          style={{ top: textSelection.top, left: textSelection.left }}
          onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
        >
          <span><Sparkles />Gemini</span>
          <button type="button" onClick={() => openSelectionAssistant('improve')}>Perbaiki</button>
          <button type="button" onClick={() => openSelectionAssistant('rewrite')}>Ubah</button>
        </div>
      )}
      <input ref={uploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={addImage} />
      <div className="editor-help">Tip: klik media untuk mengatur ukuran dan posisi. Tarik blok media ke paragraf lain untuk memindahkannya.</div>

      {youtubeOpen && (
        <div className="editor-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setYoutubeOpen(false)}>
          <div className="editor-dialog">
            <button type="button" className="dialog-close" onClick={() => setYoutubeOpen(false)}><X /></button>
            <Youtube className="youtube-mark" />
            <h3>Sematkan video YouTube</h3>
            <p>Tempel link video biasa, Shorts, atau link youtu.be.</p>
            <input autoFocus value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); setYoutubeError(''); }} placeholder="https://www.youtube.com/watch?v=…" />
            {youtubeError && <span className="dialog-error">{youtubeError}</span>}
            <div><button type="button" className="button secondary" onClick={() => setYoutubeOpen(false)}>Batal</button><button type="button" className="button primary" onClick={addYoutube}>Sematkan video</button></div>
          </div>
        </div>
      )}

      {aiOpen && (
        <div className="editor-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeAi()}>
          <div className="editor-dialog ai-dialog">
            <button type="button" className="dialog-close" disabled={aiLoading} onClick={closeAi}><X /></button>
            <Sparkles className="ai-mark" />
            <h3>Bantuan menulis dengan AI</h3>
            <p>Pilih bantuan yang dibutuhkan. Hasilnya selalu ditampilkan untuk ditinjau sebelum dimasukkan ke artikel.</p>

            {!aiResult ? (
              <>
                <div className="ai-mode-grid">
                  {(Object.keys(aiModeLabels) as AiMode[]).map((mode) => (
                    <button type="button" key={mode} className={aiMode === mode ? 'active' : ''} onClick={() => setAiMode(mode)}>
                      <strong>{aiModeLabels[mode].title}</strong>
                      <span>{aiModeLabels[mode].description}</span>
                    </button>
                  ))}
                </div>
                <label className="ai-instruction">Instruksi tambahan (opsional)
                  <textarea rows={3} value={aiInstruction} onChange={(event) => setAiInstruction(event.target.value)} placeholder="Contoh: gunakan bahasa sederhana untuk staf baru…" />
                </label>
                {aiError && <span className="dialog-error">{aiError}</span>}
                <div className="ai-dialog-actions">
                  <button type="button" className="button secondary" disabled={aiLoading} onClick={closeAi}>Batal</button>
                  <button type="button" className="button primary" disabled={aiLoading} onClick={() => void requestAi()}>
                    {aiLoading ? <><LoaderCircle className="spin" />AI sedang menulis…</> : <><Sparkles />Buat draf</>}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ai-preview" dangerouslySetInnerHTML={{ __html: aiResult }} />
                {aiError && <span className="dialog-error">{aiError}</span>}
                <div className="ai-dialog-actions ai-result-actions">
                  <button type="button" className="button secondary" onClick={() => setAiResult('')}>Ubah permintaan</button>
                  <button type="button" className="button secondary" onClick={() => applyAi(false)}>Sisipkan di kursor</button>
                  <button type="button" className="button primary" onClick={() => applyAi(true)}>Ganti isi artikel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {selectionOpen && (
        <div className="editor-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeSelectionAssistant()}>
          <div className="editor-dialog selection-ai-dialog">
            <button type="button" className="dialog-close" disabled={selectionLoading} onClick={closeSelectionAssistant}><X /></button>
            <Sparkles className="ai-mark" />
            <h3>Saran Gemini untuk teks pilihan</h3>
            <p>Gemini hanya akan mengolah bagian yang Anda sorot. Artikel tidak berubah sebelum Anda menyetujui hasilnya.</p>

            <div className="selection-action-tabs">
              <button type="button" className={selectionAction === 'improve' ? 'active' : ''} onClick={() => { setSelectionAction('improve'); setSelectionResult(''); setSelectionError(''); }}>Perbaiki kalimat</button>
              <button type="button" className={selectionAction === 'rewrite' ? 'active' : ''} onClick={() => { setSelectionAction('rewrite'); setSelectionResult(''); setSelectionError(''); }}>Ubah kalimat</button>
            </div>

            <div className="selection-original">
              <span>Teks asli</span>
              <p>{selectedTextRange.current?.toString()}</p>
            </div>

            <label className="ai-instruction">Instruksi tambahan (opsional)
              <textarea
                rows={3}
                value={selectionInstruction}
                onChange={(event) => setSelectionInstruction(event.target.value)}
                placeholder={selectionAction === 'rewrite' ? 'Contoh: buat lebih lengkap dan tajam, lebih formal, atau lebih singkat…' : 'Contoh: pertahankan semua rincian dan istilah teknis…'}
              />
            </label>

            {selectionResult && (
              <div className="selection-suggestion">
                <span>Saran Gemini</span>
                <p>{selectionResult}</p>
              </div>
            )}
            {selectionError && <span className="dialog-error">{selectionError}</span>}

            <div className="ai-dialog-actions">
              <button type="button" className="button secondary" disabled={selectionLoading} onClick={closeSelectionAssistant}>Batal</button>
              {selectionResult
                ? <>
                    <button type="button" className="button secondary" onClick={() => void requestSelectionSuggestion()}>Coba lagi</button>
                    <button type="button" className="button primary" onClick={applySelectionSuggestion}>Ganti teks pilihan</button>
                  </>
                : <button type="button" className="button primary" disabled={selectionLoading} onClick={() => void requestSelectionSuggestion()}>
                    {selectionLoading ? <><LoaderCircle className="spin" />Gemini sedang menulis…</> : <><Sparkles />Buat saran</>}
                  </button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tool({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick}>{children}</button>;
}
