// Generates a realistic test library with real STL and 3MF files.
//   node scripts/make-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { zipSync } from '../node_modules/three/examples/jsm/libs/fflate.module.js'

const ROOT = join(import.meta.dirname, '..', 'dev-assets', 'test-library')

// ---------------------------------------------------------------------------
// Mesh primitives (return { vertices: [x,y,z,...], triangles: [a,b,c,...] })
// ---------------------------------------------------------------------------

function box(sx, sy, sz, cx = 0, cy = 0, cz = 0) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2
  const v = [
    [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
  ]
  const t = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [3, 2, 6], [3, 6, 7],
    [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ]
  return { vertices: v.flat(), triangles: t.flat() }
}

function cylinder(radius, height, segments = 32, axis = 'y') {
  const vertices = []
  const triangles = []
  const half = height / 2
  const push = (x, y, z) => vertices.push(x, y, z)
  for (const [y, dir] of [[-half, -1], [half, 1]]) {
    const centerIndex = vertices.length / 3
    push(0, y, 0)
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      push(Math.cos(a) * radius, y, Math.sin(a) * radius)
    }
    for (let i = 0; i < segments; i++) {
      const a = centerIndex + 1 + i
      const b = centerIndex + 1 + ((i + 1) % segments)
      if (dir > 0) triangles.push(centerIndex, b, a)
      else triangles.push(centerIndex, a, b)
    }
  }
  const base = vertices.length / 3
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    push(Math.cos(a) * radius, -half, Math.sin(a) * radius)
  }
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    push(Math.cos(a) * radius, half, Math.sin(a) * radius)
  }
  for (let i = 0; i < segments; i++) {
    const i0 = base + i
    const i1 = base + ((i + 1) % segments)
    const i2 = base + segments + i
    const i3 = base + segments + ((i + 1) % segments)
    triangles.push(i0, i1, i3, i0, i3, i2)
  }
  if (axis === 'z') {
    for (let i = 0; i < vertices.length; i += 3) {
      const [x, y, z] = [vertices[i], vertices[i + 1], vertices[i + 2]]
      vertices[i] = x; vertices[i + 1] = -z; vertices[i + 2] = y
    }
  }
  return { vertices, triangles }
}

function merge(...parts) {
  const vertices = []
  const triangles = []
  let offset = 0
  for (const p of parts) {
    vertices.push(...p.vertices)
    for (const t of p.triangles) triangles.push(t + offset)
    offset += p.vertices.length / 3
  }
  return { vertices, triangles }
}

// ---------------------------------------------------------------------------
// STL writers
// ---------------------------------------------------------------------------

function crc32(bytes) {
  let c, table = crc32.table
  if (!table) {
    table = crc32.table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  c = 0xffffffff
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Normalised (outward-facing) triangle normals are required by STL. */
function triNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

function writeBinaryStl(path, mesh, name) {
  const triangleCount = mesh.triangles.length / 3
  const buffer = new ArrayBuffer(84 + triangleCount * 50)
  const view = new DataView(buffer)
  const header = `PrintVault fixture: ${name}`.slice(0, 80)
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i))
  view.setUint32(80, triangleCount, true)
  let offset = 84
  for (let i = 0; i < triangleCount; i++) {
    const idx = (j) => {
      const vi = mesh.triangles[i * 3 + j] * 3
      return [mesh.vertices[vi], mesh.vertices[vi + 1], mesh.vertices[vi + 2]]
    }
    const a = idx(0), b = idx(1), c = idx(2)
    const n = triNormal(a, b, c)
    for (const comp of n) view.setFloat32(offset, comp, true), (offset += 4)
    for (const p of [a, b, c]) {
      for (const comp of p) view.setFloat32(offset, comp, true), (offset += 4)
    }
    view.setUint16(offset, 0, true)
    offset += 2
  }
  writeFileSync(path, Buffer.from(buffer))
}

function writeAsciiStl(path, mesh, name) {
  const lines = [`solid ${name}`]
  const count = mesh.triangles.length / 3
  for (let i = 0; i < count; i++) {
    const idx = (j) => {
      const vi = mesh.triangles[i * 3 + j] * 3
      return [mesh.vertices[vi], mesh.vertices[vi + 1], mesh.vertices[vi + 2]]
    }
    const a = idx(0), b = idx(1), c = idx(2)
    const n = triNormal(a, b, c)
    const f = (x) => x.toFixed(4)
    lines.push(`  facet normal ${f(n[0])} ${f(n[1])} ${f(n[2])}`)
    lines.push('    outer loop')
    for (const p of [a, b, c]) lines.push(`      vertex ${f(p[0])} ${f(p[1])} ${f(p[2])}`)
    lines.push('    endloop')
    lines.push('  endfacet')
  }
  lines.push(`endsolid ${name}`)
  writeFileSync(path, lines.join('\n') + '\n')
}

// ---------------------------------------------------------------------------
// 3MF writer
// ---------------------------------------------------------------------------

function write3mf(path, mesh, name) {
  const f = (x) => (Math.round(x * 1000) / 1000).toString()
  const vertices = []
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    vertices.push(`<vertex x="${f(mesh.vertices[i])}" y="${f(mesh.vertices[i + 1])}" z="${f(mesh.vertices[i + 2])}" />`)
  }
  const triangles = []
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    triangles.push(`<triangle v1="${mesh.triangles[i]}" v2="${mesh.triangles[i + 1]}" v3="${mesh.triangles[i + 2]}" />`)
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${name}</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          ${vertices.join('\n          ')}
        </vertices>
        <triangles>
          ${triangles.join('\n          ')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>
`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>
`
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>
`
  const encoder = new TextEncoder()
  const zip = zipSync({
    '[Content_Types].xml': encoder.encode(contentTypes),
    '_rels/.rels': encoder.encode(rels),
    '3D/3dmodel.model': encoder.encode(model),
  })
  writeFileSync(path, Buffer.from(zip))
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function put(relPath, fn) {
  const path = join(ROOT, relPath)
  mkdirSync(dirname(path), { recursive: true })
  fn(path)
  console.log('  +', relPath)
}

mkdirSync(ROOT, { recursive: true })

console.log('Generating test library in', ROOT)

// Impression 3D / Elegoo / Centauri Carbon / Mods — the exact example tree.
put('Impression 3D/Elegoo/Centauri Carbon/Mods/coude.3mf', (p) =>
  write3mf(p, merge(
    cylinder(14, 42, 32, 'x'),
    cylinder(14, 34, 32, 'z'),
  ), 'coude'))
put('Impression 3D/Elegoo/Centauri Carbon/Mods/silencieux.3mf', (p) =>
  write3mf(p, merge(
    cylinder(21, 84, 48),
    box(30, 10, 30, 0, 46, 0),
  ), 'silencieux'))
put('Impression 3D/Elegoo/Centauri Carbon/Mods/collecteur.stl', (p) =>
  writeBinaryStl(p, merge(box(62, 28, 24), cylinder(10, 40, 28, 'z')), 'collecteur'))
put('Impression 3D/Elegoo/Centauri Carbon/Mods/PART support camera.STL', (p) =>
  writeBinaryStl(p, merge(box(40, 8, 30), box(8, 34, 8, -14, 17, 0), box(30, 6, 24, 0, 30, 0)), 'support camera'))

put('Impression 3D/Elegoo/Centauri Carbon/Tests/tour de calibrage 20mm.3mf', (p) =>
  write3mf(p, box(20, 20, 20), 'calibration'))
put('Impression 3D/Elegoo/Centauri Carbon/Tests/cube calibration ASCII.stl', (p) =>
  writeAsciiStl(p, box(20, 20, 20), 'cube20'))
put('Impression 3D/Elegoo/Centauri Carbon/Tests/corrompu.3mf', (p) =>
  writeFileSync(p, Buffer.from('this is not a zip archive, just some broken text pretending to be a 3mf file')))
put('Impression 3D/Elegoo/Centauri Carbon/Tests/tronque.stl', (p) => {
  const buffer = new ArrayBuffer(84 + 3 * 50)
  const view = new DataView(buffer)
  view.setUint32(80, 5000, true) // header claims 5000 triangles, file has 3
  writeFileSync(p, Buffer.from(buffer))
})
put('Impression 3D/Elegoo/Centauri Carbon/Tests/notes.txt', (p) =>
  writeFileSync(p, 'Not a model — should never appear in the library.\n'))

put('Impression 3D/Elegoo/Accessoires/plateau.3mf', (p) =>
  write3mf(p, box(235, 6, 235), 'plateau'))
put('Impression 3D/Elegoo/Accessoires/poignee.stl', (p) =>
  writeBinaryStl(p, merge(box(90, 14, 18), cylinder(9, 60, 28, 'z')), 'poignee'))

// Maison / Bureau branches with deeper nesting.
put('Impression 3D/Maison/pot de fleur v2.3mf', (p) =>
  write3mf(p, merge(
    cylinder(58, 110, 48),
    cylinder(52, 8, 48),
  ), 'pot'))
put('Impression 3D/Maison/cuisine/boite epices/boite 6 cases.stl', (p) =>
  writeBinaryStl(p, merge(
    box(160, 40, 110),
    box(24, 26, 92, -50, 26, 0),
    box(24, 26, 92, 0, 26, 0),
    box(24, 26, 92, 50, 26, 0),
  ), 'boite epices'))
put('Impression 3D/Bureau/support telephone.stl', (p) =>
  writeBinaryStl(p, merge(
    box(80, 10, 70),
    box(80, 60, 8, 0, 30, -28),
    box(24, 24, 10, 0, 14, 26),
  ), 'support telephone'))
put('Impression 3D/Bureau/organisateur/plateau stylos.3mf', (p) =>
  write3mf(p, box(120, 30, 80), 'plateau stylos'))
put('Impression 3D/Bureau/organisateur/petits bacs/bac A.stl', (p) =>
  writeBinaryStl(p, box(40, 20, 30), 'bac A'))
put('Impression 3D/Bureau/organisateur/petits bacs/bac B.stl', (p) =>
  writeBinaryStl(p, box(40, 20, 30), 'bac B'))
put('Impression 3D/Bureau/organisateur/petits bacs/bac 10.stl', (p) =>
  writeBinaryStl(p, box(40, 20, 30), 'bac 10'))

console.log('Done.')
