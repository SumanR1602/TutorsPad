// Generates icon-192.png and icon-512.png in /public
// Uses only Node built-ins (zlib + fs) — no extra packages needed
import { createDeflate } from 'zlib'
import { createWriteStream, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
mkdirSync(publicDir, { recursive: true })

// Indigo #6366f1 → R=99 G=102 B=241
const R = 99, G = 102, B = 241

function crc32(buf) {
  const table = (() => {
    const t = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[i] = c
    }
    return t
  })()
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBytes, data])
  return Buffer.concat([u32be(data.length), typeBytes, data, u32be(crc32(crcInput))])
}

async function generatePNG(size, outPath) {
  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // RGB color type
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  // Raw pixel rows: filter byte (0) + RGB per pixel
  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(size * rowSize)
  for (let y = 0; y < size; y++) {
    const base = y * rowSize
    raw[base] = 0 // filter none
    for (let x = 0; x < size; x++) {
      // Draw a rounded square background with a white "T" letter (TutorDesk)
      const pad = size * 0.12
      const inSquare = x >= pad && x < size - pad && y >= pad && y < size - pad
      const px = base + 1 + x * 3
      if (inSquare) {
        // White "T": horizontal bar across top third, vertical stem down centre
        const nx = (x - size / 2) / size   // normalised -0.5..0.5
        const ny = (y - size / 2) / size
        const barHeight = 0.08
        const barTop    = -0.26
        const stemWidth = 0.06
        const inBar  = ny > barTop && ny < barTop + barHeight && nx > -0.22 && nx < 0.22
        const inStem = nx > -stemWidth && nx < stemWidth && ny > barTop && ny < 0.26
        if (inBar || inStem) {
          raw[px] = 255; raw[px + 1] = 255; raw[px + 2] = 255
        } else {
          raw[px] = R; raw[px + 1] = G; raw[px + 2] = B
        }
      } else {
        raw[px] = R; raw[px + 1] = G; raw[px + 2] = B
      }
    }
  }

  // Compress the raw pixel data
  const compressed = await new Promise((resolve, reject) => {
    const chunks = []
    const deflate = createDeflate({ level: 6 })
    deflate.on('data', c => chunks.push(c))
    deflate.on('end', () => resolve(Buffer.concat(chunks)))
    deflate.on('error', reject)
    deflate.end(raw)
  })

  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])

  await pipeline(Readable.from(png), createWriteStream(outPath))
  console.log(`✓ ${outPath} (${size}x${size})`)
}

await generatePNG(192, join(publicDir, 'icon-192.png'))
await generatePNG(512, join(publicDir, 'icon-512.png'))
console.log('Icons generated!')
