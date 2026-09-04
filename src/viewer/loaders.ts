import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import type { ModelExt, ModelStats } from '../types'

const STL_COLOR = 0xb9c2cf

/** Parses model bytes into a three.js object and measures basic stats. */
export function parseModel(
  ext: ModelExt,
  data: ArrayBuffer,
): { object: THREE.Object3D; stats: ModelStats } {
  const object = ext === 'stl' ? parseStl(data) : parse3mf(data)
  return { object, stats: computeStats(object) }
}

function parseStl(data: ArrayBuffer): THREE.Object3D {
  const geometry = new STLLoader().parse(data)
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, stlMaterial())
  const group = new THREE.Group()
  group.add(mesh)
  return group
}

function stlMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: STL_COLOR,
    metalness: 0.05,
    roughness: 0.55,
  })
}

function parse3mf(data: ArrayBuffer): THREE.Object3D {
  // Throws on malformed archives — handled by the caller.
  return new ThreeMFLoader().parse(data)
}

export function computeStats(root: THREE.Object3D): ModelStats {
  let triangles = 0
  let meshes = 0
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    meshes += 1
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined
    if (!geometry) return
    if (geometry.index) {
      triangles += geometry.index.count / 3
    } else if (geometry.attributes.position) {
      triangles += geometry.attributes.position.count / 3
    }
  })
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  return {
    triangles: Math.round(triangles),
    meshes,
    dims: { x: size.x, y: size.y, z: size.z },
  }
}

/** Frees all GPU resources held by an object tree. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      material.dispose()
    }
  })
}
