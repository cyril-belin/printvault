export type ModelExt = 'stl' | '3mf'

/** A node of the library tree, mirroring the Rust `LibNode` (camelCase). */
export interface LibNode {
  name: string
  path: string
  isDir: boolean
  ext?: ModelExt
  /** File size in bytes (files only). */
  size?: number
  /** Last modification time, unix seconds (files only). */
  modified?: number
  children: LibNode[]
}

/** World-space bounding box extents (model units, mm for STL/3MF). */
export interface Dims {
  x: number
  y: number
  z: number
}

/** Measured after a successful parse in the 3D viewer. */
export interface ModelStats {
  triangles: number
  meshes: number
  dims: Dims
}

/** Orientation of the model pivot, persisted as a quaternion (x, y, z, w). */
export interface Orientation {
  x: number
  y: number
  z: number
  w: number
}

/** One configured library root and its scan state. */
export interface RootEntry {
  path: string
  name: string
  tree: LibNode | null
  error: string | null
  scanning: boolean
}

/** Item the native context menu was opened for. */
export interface CtxTarget {
  path: string
  name: string
  /** "file" | "dir" | "root" */
  kind: 'file' | 'dir' | 'root'
}

/** Browsing mode of the library pane. */
export type BrowseMode = 'tree' | 'gallery'

/** Persisted document (settings.json in the Tauri app config dir). */
export interface Settings {
  version: 1
  roots: string[]
  /** Directory path -> expanded. Roots default to expanded. */
  expanded: Record<string, boolean>
  selectedPath: string | null
  sidebarWidth: number
  /** File path -> last applied viewing orientation (viewing preference only;
   *  never written back into the model files). */
  orientations: Record<string, Orientation>
  /** Library pane presentation; defaults to 'tree'. */
  browseMode: BrowseMode
}
