import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { zipSync } from '../node_modules/three/examples/jsm/libs/fflate.module.js'

// solid shapes with correct outward winding (same approach as make-fixtures)
function box(sx, sy, sz, cx = 0, cy = 0, cz = 0) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2
  const v = [
    [cx-hx,cy-hy,cz-hz],[cx+hx,cy-hy,cz-hz],[cx+hx,cy+hy,cz-hz],[cx-hx,cy+hy,cz-hz],
    [cx-hx,cy-hy,cz+hz],[cx+hx,cy-hy,cz+hz],[cx+hx,cy+hy,cz+hz],[cx-hx,cy+hy,cz+hz],
  ]
  const t = [
    [0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,2,6],[3,6,7],[1,2,6],[1,6,5],[0,4,7],[0,7,3],
  ]
  return { vertices: v.flat(), triangles: t.flat() }
}
function cylinder(radius, height, segments = 32) {
  const vertices = [], triangles = []
  const half = height / 2
  const push = (x, y, z) => vertices.push(x, y, z)
  for (const [y, dir] of [[-half, -1], [half, 1]]) {
    const ci = vertices.length / 3
    push(0, y, 0)
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2
      push(Math.cos(a) * radius, y, Math.sin(a) * radius)
    }
    for (let i = 0; i < segments; i++) {
      const a = ci + 1 + i, b = ci + 1 + ((i + 1) % segments)
      dir > 0 ? triangles.push(ci, b, a) : triangles.push(ci, a, b)
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
    const i0 = base + i, i1 = base + ((i + 1) % segments)
    const i2 = base + segments + i, i3 = base + segments + ((i + 1) % segments)
    triangles.push(i0, i1, i3, i0, i3, i2)
  }
  return { vertices, triangles }
}
const f = (x) => (Math.round(x * 1000) / 1000).toString()
function vertsXml(mesh) {
  const out = []
  for (let i = 0; i < mesh.vertices.length; i += 3) out.push(`<vertex x="${f(mesh.vertices[i])}" y="${f(mesh.vertices[i+1])}" z="${f(mesh.vertices[i+2])}" />`)
  return out.join('\n')
}
function trisXml(mesh) {
  const out = []
  for (let i = 0; i < mesh.triangles.length; i += 3) out.push(`<triangle v1="${mesh.triangles[i]}" v2="${mesh.triangles[i+1]}" v3="${mesh.triangles[i+2]}" />`)
  return out.join('\n')
}
const base = box(80, 12, 60)
const post = cylinder(14, 70, 28)
const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh><vertices>${vertsXml(base)}</vertices><triangles>${trisXml(base)}</triangles></mesh>
    </object>
    <object id="2" type="model">
      <mesh><vertices>${vertsXml(post)}</vertices><triangles>${trisXml(post)}</triangles></mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
    <item objectid="2" transform="1 0 0 0 1 0 0 0 1 110 35 0" />
  </build>
</model>
`
const enc = new TextEncoder()
const zip = zipSync({
  '[Content_Types].xml': enc.encode(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>`),
  '_rels/.rels': enc.encode(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>`),
  '3D/3dmodel.model': enc.encode(model),
})
const OUTPUT = join(
  import.meta.dirname,
  '..',
  'dev-assets/test-library/Impression 3D/Elegoo/Centauri Carbon/Tests/assemblage 2 pieces.3mf',
)
mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, Buffer.from(zip))
console.log('written:', OUTPUT)
