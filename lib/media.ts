// Envoi des photos et vidéos vers Supabase Storage.
// - Les photos sont réduites (2048 px max) et compressées avant l'envoi : plus rapide, moins de stockage.
// - Les vidéos sont limitées en taille et en format (ceux que les navigateurs savent lire).
// - Les noms de fichiers sont remplacés par un nom sûr (pas d'espaces, d'accents ni d'emojis).
import { supabase } from './supabase'

export const MAX_VIDEO_MB = 50
export const MAX_IMAGE_MB = 25

const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']

export type UploadError = 'tooBig' | 'unsupported' | 'failed'

export const isVideoUrl = (url: string) => /\.(mp4|mov|webm|m4v|ogv)(\?|#|$)/i.test(url)

function extOf(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  if (fromName) return fromName
  const fromType = file.type.split('/')[1] || ''
  return fromType === 'quicktime' ? 'mov' : fromType
}

function safeName(ext: string): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
}

// Réduit une photo. Si le navigateur ne sait pas la lire (ex. HEIC hors Safari), renvoie null.
async function compressImage(file: File, maxDim = 2048, quality = 0.85): Promise<Blob | null> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return null
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : null
  } catch {
    return null
  }
}

// Format photo des téléphones récents (iPhone, certains Android) : les navigateurs ne savent pas l'afficher
const isHeic = (file: File) => /hei[cf]/i.test(file.type) || ['heic', 'heif'].includes(extOf(file))

// Convertit une photo HEIC/HEIF en JPEG. Renvoie null si la conversion échoue.
async function heicToJpeg(file: File, quality = 0.85): Promise<Blob | null> {
  try {
    const { default: heic2any } = await import('heic2any')
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality })
    return Array.isArray(out) ? out[0] : out
  } catch {
    return null
  }
}

export function checkMedia(file: File): UploadError | null {
  if (isHeic(file)) return file.size > MAX_IMAGE_MB * 1024 * 1024 ? 'tooBig' : null
  const isVid = file.type.startsWith('video/') || VIDEO_EXT.includes(extOf(file))
  if (isVid) {
    if (!VIDEO_TYPES.includes(file.type) && !VIDEO_EXT.includes(extOf(file))) return 'unsupported'
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) return 'tooBig'
    return null
  }
  if (!file.type.startsWith('image/')) return 'unsupported'
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return 'tooBig'
  return null
}

// Envoie un fichier dans bucket/folder et renvoie son adresse publique.
export async function uploadMedia(bucket: string, folder: string, file: File, opts: { maxDim?: number, upsertName?: string } = {}):
  Promise<{ url?: string, error?: UploadError }> {
  const problem = checkMedia(file)
  if (problem) return { error: problem }

  const isVid = file.type.startsWith('video/') || VIDEO_EXT.includes(extOf(file))
  let body: Blob = file
  let ext = extOf(file) || 'bin'
  let contentType = file.type || undefined
  if (!isVid) {
    let source: Blob | File = file
    if (isHeic(file)) {
      const jpeg = await heicToJpeg(file)
      if (!jpeg) return { error: 'unsupported' }
      source = new File([jpeg], 'photo.jpg', { type: 'image/jpeg' })
      body = jpeg; ext = 'jpg'; contentType = 'image/jpeg'
    }
    const small = await compressImage(source as File, opts.maxDim)
    if (small) { body = small; ext = 'jpg'; contentType = 'image/jpeg' }
  }
  if (ext === 'm4v') ext = 'mp4'

  const name = opts.upsertName ? `${opts.upsertName}.${ext}` : safeName(ext)
  const path = folder ? `${folder}/${name}` : name
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    upsert: !!opts.upsertName, contentType, cacheControl: '31536000',
  })
  if (error) return { error: 'failed' }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  // Un paramètre de version évite qu'un ancien avatar reste affiché (cache)
  return { url: opts.upsertName ? `${data.publicUrl}?v=${Date.now()}` : data.publicUrl }
}
