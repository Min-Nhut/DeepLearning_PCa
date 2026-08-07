// Deep-zoom (Google Maps-style) tile viewer helper, shared by Viewer.tsx and
// Annotate.tsx. Backed by backend/app/dzi.py's pyvips-generated DZI pyramid —
// see GET /api/images/{id}/dzi (descriptor) and .../dzi_files/{level}/{col}_{row}.jpg.
import OpenSeadragon from 'openseadragon';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000';

/** Creates an OpenSeadragon viewer mounted into `element`, with auth headers wired
 * for every tile request (no image endpoint in this app is public). Click-to-zoom
 * is disabled so a plain click stays available for app interactions (ruler points,
 * selecting an annotation) — zoom is scroll-wheel / +- buttons / double-click. */
export function createDeepZoomViewer(element: HTMLElement, token: string): OpenSeadragon.Viewer {
  return OpenSeadragon({
    element,
    // OSD 6's default WebGL drawer was observed to silently never issue any
    // tile requests at all in this environment (viewport/positioning math was
    // correct, but zero fetch/XHR calls ever fired even after forceRedraw()) —
    // the older, more battle-tested canvas drawer works reliably instead.
    drawer: 'canvas',
    loadTilesWithAjax: true,
    ajaxHeaders: { Authorization: `Bearer ${token}` },
    showNavigationControl: true,
    visibilityRatio: 1,
    constrainDuringPan: true,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
    gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true },
    // OSD's nav-control button icons (zoom/home/fullscreen) are plain PNGs shipped
    // in the package, not bundled by Vite automatically — copied into public/ once
    // (frontend/public/openseadragon-images/) and served from there.
    prefixUrl: '/openseadragon-images/',
  });
}

/** Opens the image's DZI descriptor URL directly — OpenSeadragon fetches and
 * parses the .dzi XML itself (via the viewer's own ajaxHeaders, so the auth
 * token is included) and builds its internal TileSource from that. This is
 * the well-tested code path; constructing a `DziTileSource` instance by hand
 * and passing it to `.open()` hits an OSD 6.x bug ("options.drawer is
 * required") where the WebGL/multi-drawer refactor's TiledImage setup isn't
 * fully wired for that path. */
export function openDeepZoom(viewer: OpenSeadragon.Viewer, imageId: number): void {
  const dziUrl = `${API_BASE}/api/images/${imageId}/dzi`;
  // OpenSeadragon's .d.ts types open() as only accepting a TileSourceSpecifier
  // options object, but passing a URL string is the canonical, most-documented
  // OSD usage of all (every DZI tutorial opens a .dzi URL this way) — the type
  // is just incomplete here.
  viewer.open(dziUrl as unknown as OpenSeadragon.TileSourceSpecifier);
}

/** A full-image Rect in OpenSeadragon's normalized viewport space (width
 * always 1; height is the image's own aspect ratio) — used to position any
 * full-image overlay (AI mask, manual-annotation SVG) so it pans/zooms in
 * lockstep with the base tile image. */
export function fullImageRect(width: number, height: number): OpenSeadragon.Rect {
  return new OpenSeadragon.Rect(0, 0, 1, height / width);
}
