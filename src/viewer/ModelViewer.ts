import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Dims, ModelExt, ModelStats, Orientation } from '../types'
import { readModelBytes } from '../services/backend'
import { disposeObject, parseModel } from './loaders'

const BACKGROUND = 0x101114

const WORLD_AXES: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

export interface ViewerCallbacks {
  /** Dimensions changed because the model was re-oriented and re-seated. */
  onDimsChange?: (dims: Dims) => void
  /** The user changed the model orientation (null = reset to as-loaded). */
  onOrientationChange?: (orientation: Orientation | null) => void
}

interface DraggingEvent {
  value: boolean
}

/**
 * Self-contained three.js viewport: orbit/pan/zoom, neutral lighting, a
 * ground grid fixed at y=0 and automatic framing. Knows nothing about the
 * library.
 *
 * Scene graph: scene -> holder (translation only) -> pivot (user rotation)
 * -> parsed model. Orienting the model therefore never touches the relative
 * transforms inside multi-object 3MF files, and the model is re-seated so its
 * lowest point rests exactly on the grid after every orientation change.
 */
export class ModelViewer {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private transform: TransformControls | null = null
  private transformHelper: THREE.Object3D | null = null
  private gizmoEnabled = false
  private holder = new THREE.Group()
  private pivot = new THREE.Group()
  private modelRoot: THREE.Object3D | null = null
  private grid: THREE.GridHelper | null = null
  private resizeObserver: ResizeObserver
  private disposed = false
  private callbacks: ViewerCallbacks

  constructor(
    private container: HTMLElement,
    callbacks: ViewerCallbacks = {},
  ) {
    this.callbacks = callbacks
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(BACKGROUND, 1)
    const canvas = this.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.outline = 'none'
    container.appendChild(canvas)

    this.scene = new THREE.Scene()
    this.scene.add(this.holder)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09

    const hemisphere = new THREE.HemisphereLight(0xe8eef6, 0x343941, 1.0)
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(1, 1.8, 0.9)
    const fill = new THREE.DirectionalLight(0xcfe0f4, 0.45)
    fill.position.set(-1.4, 0.5, -1.1)
    this.scene.add(hemisphere, key, fill)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.renderer.setAnimationLoop(() => {
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    })
  }

  /**
   * Loads, parses and displays a model. `orientation` (Euler radians) is the
   * persisted viewing orientation, applied before the model is seated.
   * Throws when read or parse fails.
   */
  async load(
    path: string,
    ext: ModelExt,
    orientation?: Orientation | null,
  ): Promise<ModelStats> {
    const bytes = await readModelBytes(path)
    const { object, stats } = parseModel(ext, bytes)
    if (this.disposed) {
      disposeObject(object)
      return stats
    }
    this.setObject(object, orientation)
    const dims = this.applyGroundPlacement()
    this.frame()
    return { ...stats, dims }
  }

  // --- Model orientation ---------------------------------------------------

  /** Rotates the model +90° around a world axis (viewing preference only). */
  rotate90(axis: 'x' | 'y' | 'z'): void {
    if (!this.modelRoot) return
    const quarter = new THREE.Quaternion().setFromAxisAngle(WORLD_AXES[axis], Math.PI / 2)
    this.pivot.quaternion.premultiply(quarter)
    this.afterOrientationChanged()
  }

  /** Restores the exact orientation the model was loaded with. */
  resetOrientation(): void {
    if (!this.modelRoot) return
    this.pivot.quaternion.identity()
    this.afterOrientationChanged(true)
  }

  /** Enables/disables the interactive rotation gizmo around the model. */
  setGizmoEnabled(on: boolean): void {
    this.gizmoEnabled = on
    if (on) this.attachTransform()
    else this.detachTransform()
  }

  private afterOrientationChanged(reset = false): void {
    const dims = this.applyGroundPlacement()
    this.callbacks?.onDimsChange?.(dims)
    if (reset) {
      this.callbacks?.onOrientationChange?.(null)
    } else {
      const q = this.pivot.quaternion
      this.callbacks?.onOrientationChange?.({ x: q.x, y: q.y, z: q.z, w: q.w })
    }
    this.ensureFraming()
  }

  /**
   * Re-seats the model: centered in X/Z with its lowest point exactly on the
   * ground plane (y=0). Returns the world-space dimensions.
   */
  private applyGroundPlacement(): Dims {
    this.holder.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(this.holder)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    this.holder.position.x -= center.x
    this.holder.position.z -= center.z
    this.holder.position.y -= box.min.y
    this.holder.updateMatrixWorld(true)
    this.updateGrid(size)
    return { x: size.x, y: size.y, z: size.z }
  }

  private updateGrid(size: THREE.Vector3): void {
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.geometry.dispose()
      ;(this.grid.material as THREE.Material).dispose()
      this.grid = null
    }
    const maxDim = Math.max(size.x, size.y, size.z)
    if (!Number.isFinite(maxDim) || maxDim <= 0) return
    const grid = new THREE.GridHelper(niceSize(maxDim * 2.5), 24, 0x2f3238, 0x22242a)
    const material = grid.material as THREE.LineBasicMaterial
    material.transparent = true
    material.opacity = 0.5
    material.depthWrite = false
    grid.position.y = 0
    this.scene.add(grid)
    this.grid = grid
  }

  // --- Rotation gizmo ------------------------------------------------------

  private attachTransform(): void {
    if (!this.modelRoot || this.transform) return
    const control = new TransformControls(this.camera, this.renderer.domElement)
    control.attach(this.pivot)
    control.size = 0.85
    const helper =
      (control as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.() ??
      (control as unknown as THREE.Object3D)
    this.scene.add(helper)
    control.addEventListener('dragging-changed', (event) => {
      // Orbit vs model interaction must never fight: orbit is suspended for
      // the duration of the gizmo drag and restored immediately after.
      const dragging = (event as unknown as DraggingEvent).value
      this.controls.enabled = !dragging
      if (!dragging) this.afterOrientationChanged()
    })
    control.addEventListener('objectChange', () => {
      // Live re-seating while dragging keeps the model on the grid; the
      // camera itself is never moved for interactive rotations.
      const dims = this.applyGroundPlacement()
      this.callbacks?.onDimsChange?.(dims)
      const q = this.pivot.quaternion
      this.callbacks?.onOrientationChange?.({ x: q.x, y: q.y, z: q.z, w: q.w })
    })
    this.transform = control
    this.transformHelper = helper
  }

  private detachTransform(): void {
    const control = this.transform
    if (!control) return
    control.detach()
    control.dispose()
    if (this.transformHelper) this.scene.remove(this.transformHelper)
    this.transform = null
    this.transformHelper = null
  }

  // --- Camera --------------------------------------------------------------

  /**
   * Re-frames only when the model has genuinely left the view (or exceeds the
   * far plane) — small rotations keep the current camera.
   */
  private ensureFraming(): void {
    if (!this.modelRoot) return
    this.camera.updateMatrixWorld()
    const sphere = this.currentWorldBox().getBoundingSphere(new THREE.Sphere())
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    )
    const beyondFar =
      this.camera.position.distanceTo(sphere.center) + sphere.radius > this.camera.far
    if (!frustum.intersectsSphere(sphere) || beyondFar) this.frame()
  }

  /** Auto-frames the current model extents (used on load and Reset camera). */
  private frame(): void {
    if (!this.modelRoot) return
    const box = this.currentWorldBox()
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.length() / 2, 1e-3)
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const distance = (radius / Math.sin(fov / 2)) * 1.06
    const direction = new THREE.Vector3(1, 0.62, 1).normalize()
    this.camera.near = Math.max(distance / 1000, 0.01)
    this.camera.far = distance * 60
    this.camera.position.copy(direction.multiplyScalar(distance))
    this.controls.target.set(0, Math.max(box.getCenter(new THREE.Vector3()).y, 0))
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  /** Re-frames the current model extents (Reset camera button). */
  reset(): void {
    this.frame()
  }

  // --- Lifecycle -----------------------------------------------------------

  /** Removes the current model without destroying the viewport. */
  clear(): void {
    this.clearModel()
  }

  dispose(): void {
    this.disposed = true
    this.clearModel()
    this.controls.dispose()
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private setObject(object: THREE.Object3D, orientation?: Orientation | null): void {
    this.clearModel()
    this.pivot = new THREE.Group()
    this.pivot.add(object)
    this.holder.add(this.pivot)
    this.modelRoot = object
    if (orientation) this.pivot.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)
    if (this.gizmoEnabled) this.attachTransform()
  }

  private clearModel(): void {
    this.detachTransform()
    if (this.modelRoot) {
      this.holder.remove(this.pivot)
      disposeObject(this.pivot)
      this.pivot.clear()
      this.modelRoot = null
    }
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.geometry.dispose()
      ;(this.grid.material as THREE.Material).dispose()
      this.grid = null
    }
  }

  private currentWorldBox(): THREE.Box3 {
    this.holder.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(this.holder)
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
}

/** Rounds up to a 1/2/5×10ⁿ value so the grid reads as "nice" units. */
function niceSize(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(value, 1e-6))))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}
