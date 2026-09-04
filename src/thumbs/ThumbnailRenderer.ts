import * as THREE from 'three'
import type { ModelExt } from '../types'
import { disposeObject, parseModel } from '../viewer/loaders'

/**
 * Dedicated offscreen thumbnail renderer. Shares the model parsing utilities
 * with the main viewer (parseModel) but owns a tiny private WebGL context and
 * a throwaway scene, so generating thumbnails never touches ModelViewer.
 *
 * Renders the model in its SOURCE orientation (the persisted viewer
 * orientation is deliberately ignored): a thumbnail represents the file, not
 * a viewing preference.
 */

const SIZE = 288 // rendered pixel size; cards display at ~100–150 px
const BACKGROUND = 0x202227 // neutral, slightly lighter than the app panels
const CAMERA_DIRECTION = new THREE.Vector3(1, 0.62, 1).normalize()

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let holder: THREE.Group | null = null
/** Serializes GPU work: one small context, one render at a time. */
let renderChain: Promise<unknown> = Promise.resolve()

function ensureRenderer(): void {
  if (renderer) return
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true, // the canvas is never in the DOM; needed for toDataURL
  })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  renderer.setClearColor(BACKGROUND, 1)

  scene = new THREE.Scene()
  holder = new THREE.Group()
  scene.add(holder)

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000)

  // Neutral three-point lighting, same family as the main viewer.
  const hemisphere = new THREE.HemisphereLight(0xe8eef6, 0x343941, 1.0)
  const key = new THREE.DirectionalLight(0xffffff, 1.5)
  key.position.set(1, 1.8, 0.9)
  const fill = new THREE.DirectionalLight(0xcfe0f4, 0.45)
  fill.position.set(-1.4, 0.5, -1.1)
  scene.add(hemisphere, key, fill)
}

/**
 * Renders model bytes into a PNG data URL. Throws on parse or GPU failure —
 * callers show a fallback icon and must not treat this as fatal.
 */
export function renderThumbnail(ext: ModelExt, bytes: ArrayBuffer): Promise<string> {
  const job = renderChain.then(() => renderOnce(ext, bytes))
  // Swallow in the chain (not in `job`) so one failure doesn't poison the queue.
  renderChain = job.catch(() => undefined)
  return job
}

async function renderOnce(ext: ModelExt, bytes: ArrayBuffer): Promise<string> {
  ensureRenderer()
  if (!renderer || !scene || !camera || !holder) {
    throw new Error('Thumbnail renderer unavailable.')
  }

  const { object } = parseModel(ext, bytes)
  holder.add(object)

  try {
    holder.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(holder)
    if (box.isEmpty()) throw new Error('Model has no visible geometry.')
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3)

    // Center the model and frame it fully from the consistent hero angle.
    holder.position.set(-center.x, -center.y, -center.z)
    const fov = THREE.MathUtils.degToRad(camera.fov)
    const distance = (radius / Math.sin(fov / 2)) * 1.08
    camera.near = Math.max(distance / 1000, 0.001)
    camera.far = distance * 100
    camera.position.copy(CAMERA_DIRECTION).multiplyScalar(distance)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()

    renderer.render(scene, camera)
    const dataUrl = renderer.domElement.toDataURL('image/png')
    if (!dataUrl.startsWith('data:image/png')) {
      throw new Error('Thumbnail readback failed.')
    }
    return dataUrl
  } finally {
    holder.remove(object)
    holder.position.set(0, 0, 0)
    disposeObject(object)
  }
}
