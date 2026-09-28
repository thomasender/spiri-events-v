import sharp from 'sharp'
import {
  readdir,
  readFile,
  writeFile,
  stat,
  utimes,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const PUBLIC_DIR = 'public'
const CACHE_FILE = '.compression-cache.json'
const MIN_SAVINGS_PERCENT = 3
const MIN_FILE_SIZE_BYTES = 5 * 1024

const SKIP_PATTERNS = [
  /^favicon/i,
  /^apple-touch-icon/i,
  /^icon-(\d+|maskable)/i,
  /^mstile/i,
  /^logo-180x180/i,
  /\.svg$/i,
  /\.ico$/i,
]

const COMPRESSIBLE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

const cache = existsSync(CACHE_FILE)
  ? JSON.parse(await readFile(CACHE_FILE, 'utf-8'))
  : {}

let writtenCount = 0
let skippedCount = 0
let savedBytes = 0

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath)
    } else if (COMPRESSIBLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      await processFile(fullPath, entry.name)
    }
  }
}

async function processFile(filepath, filename) {
  const rel = relative('.', filepath)

  if (SKIP_PATTERNS.some((p) => p.test(filename))) {
    skippedCount++
    return
  }

  const stats = await stat(filepath)
  if (stats.size < MIN_FILE_SIZE_BYTES) {
    skippedCount++
    return
  }

  const cached = cache[rel]
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    skippedCount++
    return
  }

  const original = await readFile(filepath)
  const ext = extname(filename).toLowerCase()

  let output
  if (ext === '.png') {
    output = await sharp(original)
      .png({ compressionLevel: 9 })
      .toBuffer()
  } else {
    output = await sharp(original)
      .jpeg({ quality: 80, mozjpeg: true, progressive: true })
      .toBuffer()
  }

  const savings = original.length - output.length
  const savingsPercent = (savings / original.length) * 100

  if (savingsPercent >= MIN_SAVINGS_PERCENT) {
    await writeFile(filepath, output)
    await utimes(filepath, stats.atime, stats.mtime)
    savedBytes += savings
    writtenCount++
    cache[rel] = {
      mtimeMs: stats.mtimeMs,
      size: output.length,
      originalSize: original.length,
      compressedSize: output.length,
    }
    console.log(
      `  ✓ ${rel}: ${formatBytes(original.length)} → ${formatBytes(output.length)} (-${savingsPercent.toFixed(1)}%)`
    )
  } else {
    cache[rel] = {
      mtimeMs: stats.mtimeMs,
      size: original.length,
      originalSize: original.length,
      compressedSize: original.length,
      skipped: true,
    }
    const direction = savings >= 0 ? 'smaller' : 'larger'
    const pctAbs = Math.abs(savingsPercent).toFixed(1)
    console.log(
      `  · ${rel}: ${formatBytes(original.length)} (${pctAbs}% ${direction} after re-encode, keeping original)`
    )
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

await walk(PUBLIC_DIR)
await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2))

console.log(
  `\n${writtenCount} compressed, ${skippedCount} skipped, ${formatBytes(savedBytes)} saved`
)