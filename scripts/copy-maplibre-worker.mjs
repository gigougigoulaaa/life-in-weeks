// Copie le « worker » de MapLibre dans public/ : Next.js (Turbopack) ne sait pas le retrouver tout seul.
// Lancé automatiquement après « npm install » (voir "postinstall" dans package.json).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
const src = 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'
if (existsSync(src)) {
  mkdirSync('public', { recursive: true })
  copyFileSync(src, 'public/maplibre-gl-worker.mjs')
  console.log('MapLibre worker copié dans public/')
}
