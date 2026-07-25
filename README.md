# Warehouse Knowledge Base

Knowledge base operasional gudang berbasis React dan Vite. Aplikasi menyediakan pencarian dan filter artikel, mode baca, pengelolaan artikel, serta editor visual dengan gambar, embed YouTube, drag-and-drop, resize media, dan formatting teks.

## Menjalankan proyek

```bash
npm ci
npm run dev
```

## Validasi produksi

```bash
npm run build
```

Perintah build menjalankan pemeriksaan TypeScript sebelum menghasilkan folder `dist`.

## Deployment

Workflow `.github/workflows/deploy.yml` otomatis membangun dan menerbitkan aplikasi ke GitHub Pages setiap kali branch `main` menerima push.

Base path GitHub Pages dikonfigurasi sebagai:

```text
/warehouse-knowledge-base/
```

## Struktur

```text
.github/workflows/deploy.yml
src/App.tsx
src/RichEditor.tsx
src/index.css
src/main.tsx
index.html
package.json
package-lock.json
tsconfig.json
vite.config.ts
```

`node_modules` dan `dist` tidak disimpan di Git karena keduanya dibuat ulang melalui instalasi dan build.
