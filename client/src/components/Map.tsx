import { useEffect, useRef, useState } from "react"
import {
  AttributionControl,
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type GeolocateErrorEvent,
  type ExpressionSpecification,
  type SymbolLayerSpecification,
} from "maplibre-gl"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import "maplibre-gl/dist/maplibre-gl.css"
import { Moon, Sun } from "lucide-react"
import { animate, type AnimationPlaybackControls } from "motion"
import { cn } from "@/lib/utils"
import carPointerUrl from "@/assets/car-pointer.png"
import {
  computeTargetHeading,
  haversineMeters,
  normalizeHeading,
  stepVehicleAnimation,
} from "@/lib/vehicle-position"
import type { RouteResult, SelectedLocation } from "@/lib/places-api"

setWorkerUrl(maplibreWorkerUrl)

const LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark"
const DEFAULT_CENTER: [number, number] = [67.0011, 24.8607]
const DEFAULT_ZOOM = 11
const BRIGHT_LABEL_COLOR = "rgb(245, 245, 245)"
const LOCATION_ZOOM = 13
const FROM_MARKER_COLOR = "#e5bd97"
const TO_MARKER_COLOR = "#f87171"
const ROUTE_SOURCE_ID = "route-line-source"
const NAV_ROUTE_SOURCE_ID = "nav-route-line-source"
const ROUTE_CASING_LAYER_ID = "route-line-casing"
const ROUTE_LAYER_ID = "route-line"
const NAV_ROUTE_CASING_LAYER_ID = "nav-route-line-casing"
const NAV_ROUTE_LAYER_ID = "nav-route-line"

/**
 * The car-pointer.png artwork is 944x419 with a feathered (non-opaque) alpha
 * edge: the vehicle's FRONT (nose) is the left/west side of the source image,
 * with the windshield glass band angling back toward the roof at the right
 * (confirmed by the map-bearing independence test and the rendered cardinals).
 *
 * Rotation is applied by MapLibre's native marker rotation
 * (`Marker#setRotation`), which turns the element clockwise by the requested
 * degrees (`rotateZ(rotation)`; with `rotationAlignment:"map"` the map bearing
 * is subtracted automatically). With the nose at compass heading 270 in the
 * source, facing compass heading `h` requires `rotation = h - 270`.
 */
const VEHICLE_SOURCE_NOSE_HEADING = 270
const DRIVER_VEHICLE_WIDTH_PX = 40
const DRIVER_VEHICLE_HEIGHT_PX = 17.8 // preserves 944:419 aspect ratio
const DRIVER_POSITION_TAU_MS = 160
const DRIVER_HEADING_TAU_MS = 180
/** Meters a fix must move before the bearing fallback stops trusting it. */
const DRIVER_NOISE_THRESHOLD_M = 6
/** A finite GPS heading is only trusted above this ground speed (m/s). */
const DRIVER_MIN_SPEED_MPS = 0.5

/**
 * Temporary "searching" vehicles rendered while the passenger awaits a
 * driver. These are strictly VISUAL PLACEHOLDERS — they are not real
 * drivers, carry no driver id/coordinates, no Redis/socket data and no
 * booking association. They are DOM-based map overlays (MapLibre Markers
 * whose DOM element wraps a small rendition of the same car-pointer.png used
 * by the real driver marker). The real driver marker is a separate,
 * independent path.
 */
const SEARCH_CAR_MIN = 2
const SEARCH_CAR_MAX = 4
const SEARCH_CAR_WIDTH_PX = 28
const SEARCH_CAR_HEIGHT_PX = 12.4 // preserves 944:419 aspect ratio
const SEARCH_CAR_SEGMENT_MS = 7000
const SEARCH_CAR_SPAWN_INTERVAL_MS = 2800
const SEARCH_CAR_VIEWPORT_PADDING = 140
const SEARCH_CAR_VIEWPORT_MAX_ZOOM = 12.5
const SEARCH_RING_COUNT = 3
const SEARCH_RING_SIZE_PX = 84
const SEARCH_RING_COLOR = "#d4a574"

function vehicleRotationDeg(heading: number): number {
  return normalizeHeading(heading - VEHICLE_SOURCE_NOSE_HEADING)
}

const ENGLISH_TEXT_FIELD: ExpressionSpecification = [
  "coalesce",
  ["get", "name_en"],
  ["get", "name:latin"],
  ["get", "name"],
]

function isNameLabelLayer(symbolLayer: SymbolLayerSpecification) {
  const textField = symbolLayer.layout?.["text-field"]
  if (!Array.isArray(textField)) return false
  return /name(?:_|:)/.test(JSON.stringify(textField))
}

function applyEnglishLabels(map: MapLibreMap) {
  const style = map.getStyle()
  for (const layer of style.layers ?? []) {
    if (layer.type !== "symbol") continue
    if (!isNameLabelLayer(layer as SymbolLayerSpecification)) continue
    map.setLayoutProperty(layer.id, "text-field", ENGLISH_TEXT_FIELD)
  }
}

function applyDarkLabelColors(map: MapLibreMap) {
  const style = map.getStyle()
  for (const layer of style.layers ?? []) {
    if (layer.type !== "symbol") continue
    if (!isNameLabelLayer(layer as SymbolLayerSpecification)) continue
    map.setPaintProperty(layer.id, "text-color", BRIGHT_LABEL_COLOR)
  }
}

function createLocationMarkerElement(kind: "from" | "to") {
  const label = document.createElement("span")
  label.textContent = kind === "from" ? "FROM" : "TO"
  label.style.cssText = [
    "position:absolute",
    "top:-24px",
    "left:50%",
    "transform:translateX(-50%)",
    "white-space:nowrap",
    "font-size:9px",
    "font-weight:700",
    "letter-spacing:0.08em",
    `background:${kind === "from" ? FROM_MARKER_COLOR : TO_MARKER_COLOR}`,
    "color:#1a1a1a",
    "padding:2px 6px",
    "border-radius:6px",
    "box-shadow:0 1px 3px rgba(0,0,0,0.35)",
  ].join(";")

  const dot = document.createElement("span")
  dot.style.cssText = [
    "display:block",
    "width:14px",
    "height:14px",
    "border-radius:50%",
    `background:${kind === "from" ? FROM_MARKER_COLOR : TO_MARKER_COLOR}`,
    "border:2px solid #ffffff",
    "box-shadow:0 1px 4px rgba(0,0,0,0.4)",
  ].join(";")

  const wrapper = document.createElement("div")
  wrapper.style.cssText = "position:relative;display:flex;align-items:center;justify-content:center;"
  wrapper.appendChild(label)
  wrapper.appendChild(dot)
  return wrapper
}

interface DriverMarkerElement {
  element: HTMLImageElement
  img: HTMLImageElement
}

/**
 * Returns the marker element for the live driver position. The element is the
 * image itself (so MapLibre's anchored `translate(-50%,-50%)` keeps the marker
 * centered on the coordinate), sized to preserve the artwork aspect ratio.
 * No CSS transform is applied to the element: MapLibre owns the element
 * transform and applies native marker rotation through it.
 */
function createDriverMarkerElement(): DriverMarkerElement {
  const img = document.createElement("img")
  img.src = carPointerUrl
  img.alt = "Your vehicle"
  img.draggable = false
  img.style.cssText = [
    "display:block",
    `width:${DRIVER_VEHICLE_WIDTH_PX}px`,
    `height:${DRIVER_VEHICLE_HEIGHT_PX}px`,
    "object-fit:contain",
    "pointer-events:none",
    "user-select:none",
    "-webkit-user-drag:none",
  ].join(";")

  return { element: img, img }
}

/**
 * Small rendition of the real driver artwork for the driver-search animation.
 * Distinct from the live marker: smaller, low-opacity, gently bobbing, no
 * rotation/heading, no driver data. MapLibre owns the wrapper element's
 * transform (anchor centering), so opacity + bob live on the inner <img>.
 */
function createSearchCarElement(): { element: HTMLDivElement; img: HTMLImageElement } {
  const img = document.createElement("img")
  img.src = carPointerUrl
  img.alt = ""
  img.draggable = false
  img.style.cssText = [
    "display:block",
    `width:${SEARCH_CAR_WIDTH_PX}px`,
    `height:${SEARCH_CAR_HEIGHT_PX}px`,
    "object-fit:contain",
    "user-select:none",
    "-webkit-user-drag:none",
    "opacity:0",
    "will-change:transform",
  ].join(";")

  const element = document.createElement("div")
  element.style.cssText = [
    "position:relative",
    "pointer-events:none",
    "user-select:none",
  ].join(";")
  element.appendChild(img)

  return { element, img }
}

/**
 * Layered, expanding/fading rings centered on the pickup. The marker element
 * is a zero-size anchor point; the rings are positioned children so MapLibre
 * does not touch their transforms. Subtle by design — it suggests the app is
 * scanning the surrounding area, not a radar/target visualization.
 */
function createSearchRingElement(): { element: HTMLDivElement; rings: HTMLDivElement[] } {
  const element = document.createElement("div")
  element.style.cssText = [
    "position:relative",
    "width:0",
    "height:0",
    "pointer-events:none",
    "user-select:none",
  ].join(";")

  const rings: HTMLDivElement[] = []
  for (let i = 0; i < SEARCH_RING_COUNT; i++) {
    const ring = document.createElement("div")
    const size = SEARCH_RING_SIZE_PX
    ring.style.cssText = [
      "position:absolute",
      `left:${-size / 2}px`,
      `top:${-size / 2}px`,
      `width:${size}px`,
      `height:${size}px`,
      "border-radius:50%",
      `border:1.5px solid ${SEARCH_RING_COLOR}`,
      "opacity:0",
      "transform-origin:center",
    ].join(";")
    element.appendChild(ring)
    rings.push(ring)
  }
  return { element, rings }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function cubicInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function getSearchBBox(
  route: RouteResult | null,
  from: SelectedLocation | null,
  to: SelectedLocation | null,
) {
  let sw = { lng: Number.POSITIVE_INFINITY, lat: Number.POSITIVE_INFINITY }
  let ne = { lng: Number.NEGATIVE_INFINITY, lat: Number.NEGATIVE_INFINITY }
  let valid = false

  for (const coordinate of route?.geometry.coordinates ?? []) {
    const [lng, lat] = coordinate
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    sw = { lng: Math.min(sw.lng, lng), lat: Math.min(sw.lat, lat) }
    ne = { lng: Math.max(ne.lng, lng), lat: Math.max(ne.lat, lat) }
    valid = true
  }

  if (!valid && from && to) {
    sw = {
      lng: Math.min(from.longitude, to.longitude),
      lat: Math.min(from.latitude, to.latitude),
    }
    ne = {
      lng: Math.max(from.longitude, to.longitude),
      lat: Math.max(from.latitude, to.latitude),
    }
    valid = true
  }

  if (!valid) return null

  const minSpan = 0.008
  if (ne.lng - sw.lng < minSpan) {
    const c = (ne.lng + sw.lng) / 2
    sw = { ...sw, lng: c - minSpan / 2 }
    ne = { ...ne, lng: c + minSpan / 2 }
  }
  if (ne.lat - sw.lat < minSpan) {
    const c = (ne.lat + sw.lat) / 2
    sw = { ...sw, lat: c - minSpan / 2 }
    ne = { ...ne, lat: c + minSpan / 2 }
  }
  return { sw, ne }
}

type SearchBBox = {
  sw: { lng: number; lat: number }
  ne: { lng: number; lat: number }
}

type SearchCtx = { bbox: SearchBBox }

interface SearchCar {
  marker: Marker
  img: HTMLImageElement
  control: AnimationPlaybackControls
}

interface SearchRings {
  marker: Marker
  controls: AnimationPlaybackControls[]
  staticRing: HTMLDivElement | null
}

const ROUTE_EMPTY_GEOJSON = {
  type: "FeatureCollection",
  features: [],
} as const

function ensureRouteLayers(map: MapLibreMap) {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: "geojson",
      data: ROUTE_EMPTY_GEOJSON,
    })
  }
  if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#26221c",
        "line-width": 7,
        "line-opacity": 0.45,
      },
    })
  }
  if (!map.getLayer(ROUTE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#d4a574",
        "line-width": 4,
        "line-opacity": 0.95,
      },
    })
  }

  // Navigation route layers (distinct color for active navigation)
  if (!map.getSource(NAV_ROUTE_SOURCE_ID)) {
    map.addSource(NAV_ROUTE_SOURCE_ID, {
      type: "geojson",
      data: ROUTE_EMPTY_GEOJSON,
    })
  }
  if (!map.getLayer(NAV_ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: NAV_ROUTE_CASING_LAYER_ID,
      type: "line",
      source: NAV_ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#1e3a5f",
        "line-width": 7,
        "line-opacity": 0.55,
      },
    })
  }
  if (!map.getLayer(NAV_ROUTE_LAYER_ID)) {
    map.addLayer({
      id: NAV_ROUTE_LAYER_ID,
      type: "line",
      source: NAV_ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#3b82f6",
        "line-width": 4,
        "line-opacity": 0.98,
      },
    })
  }
}

type MapTheme = "light" | "dark"

interface MapProps {
  className?: string
  center?: [number, number]
  zoom?: number
  from?: SelectedLocation | null
  to?: SelectedLocation | null
  route?: RouteResult | null
  /**
   * Live navigation polyline for the driver portal (Bucket 2). Drawn on the
   * same route source/layers as `route`, but the camera only fits it at most
   * once per phase instead of on every reroute.
   */
  navRoute?: RouteResult | null
  /**
   * Stable key for the current driver navigation leg. When set it owns the
   * polyline and suspends `route` rendering; when it flips, the camera fits
   * the new leg's route once.
   */
  navPhaseId?: string | null
  pickMode?: "from" | "to" | null
  onPickPoint?: (location: { latitude: number; longitude: number }) => void
  /** Live driver position, rendered as a rotating vehicle marker without moving the camera. */
  driverLocation?: {
    latitude: number
    longitude: number
    /** Degrees clockwise from north. Null when the device cannot provide it. */
    heading?: number | null
    speed?: number | null
  } | null
  /**
   * When true, zooms out once to the route bounds and runs the temporary
   * driver-search overlays (subtle rings at the pickup + small PNG cars).
   * The cars are visual-only placeholders and never represent real drivers.
   */
  searching?: boolean
}

export default function Map({
  className,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  from = null,
  to = null,
  route = null,
  navRoute = null,
  navPhaseId = null,
  pickMode = null,
  onPickPoint,
  driverLocation = null,
  searching = false,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const fromMarkerRef = useRef<Marker | null>(null)
  const toMarkerRef = useRef<Marker | null>(null)
  const driverMarkerRef = useRef<Marker | null>(null)
  const driverImgRef = useRef<HTMLImageElement | null>(null)
  const driverDisplayRef = useRef<{
    lat: number
    lng: number
    heading: number
  } | null>(null)
  const driverTargetRef = useRef<{
    lat: number
    lng: number
    heading: number
  } | null>(null)
  const driverPrevFixRef = useRef<{ lat: number; lng: number } | null>(null)
  const driverRafRef = useRef<number | null>(null)
  const driverLastFrameMsRef = useRef(0)
  const themeRef = useRef<MapTheme>("light")
  const pickModeRef = useRef<"from" | "to" | null>(null)
  const onPickPointRef = useRef(onPickPoint)
  const [theme, setTheme] = useState<MapTheme>("light")
  const [geoStatus, setGeoStatus] = useState<string | null>(null)
  const geoStatusTimerRef = useRef<number | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [routeTick, setRouteTick] = useState(0)
  const lastRouteRef = useRef<RouteResult | null>(null)
  const routeOriginRef = useRef<{ from: string; to: string } | null>(null)
  const fromRef = useRef<SelectedLocation | null>(from)
  const toRef = useRef<SelectedLocation | null>(to)
  const searchingRef = useRef(false)
  const searchCarsRef = useRef<SearchCar[]>([])
  const searchRingsRef = useRef<SearchRings | null>(null)
  const searchSpawnTimerRef = useRef<number | null>(null)
  const searchCtxRef = useRef<SearchCtx | null>(null)
  const searchReducedRef = useRef(prefersReducedMotion())
  const navFittedPhaseRef = useRef<string | null>(null)

  const showGeoStatus = (message: string) => {
    setGeoStatus(message)
    if (geoStatusTimerRef.current !== null) {
      window.clearTimeout(geoStatusTimerRef.current)
    }
    geoStatusTimerRef.current = window.setTimeout(() => {
      setGeoStatus(null)
      geoStatusTimerRef.current = null
    }, 4000)
  }

  const stopDriverAnimation = () => {
    if (driverRafRef.current !== null) {
      window.cancelAnimationFrame(driverRafRef.current)
      driverRafRef.current = null
    }
    driverLastFrameMsRef.current = 0
  }

  const startDriverAnimation = () => {
    if (driverRafRef.current !== null) return

    const tick = (now: number) => {
      driverRafRef.current = null
      const display = driverDisplayRef.current
      const target = driverTargetRef.current
      const marker = driverMarkerRef.current
      const img = driverImgRef.current
      if (!display || !target || !marker || !img) return

      const dt =
        driverLastFrameMsRef.current === 0
          ? 16
          : Math.min(now - driverLastFrameMsRef.current, 100)
      driverLastFrameMsRef.current = now

      const { done } = stepVehicleAnimation(
        display,
        target,
        dt,
        DRIVER_POSITION_TAU_MS,
        DRIVER_HEADING_TAU_MS,
      )

      marker.setLngLat([display.lng, display.lat])
      marker.setRotation(vehicleRotationDeg(display.heading))

      if (done) return
      driverRafRef.current = window.requestAnimationFrame(tick)
    }

    driverRafRef.current = window.requestAnimationFrame(tick)
  }

  const pixelDistance = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => Math.hypot(a.x - b.x, a.y - b.y)

  /**
   * Samples a random point inside the search bounding box, nudged away from
   * the pickup/destination markers and the route so the decorative cars read
   * as "somewhere around the area" instead of on top of the trip. Screen-space
   * maths only — nothing is persisted or sent anywhere.
   */
  const sampleSearchPoint = (
    map: MapLibreMap,
    ctx: SearchCtx,
    excludeFrom: { lng: number; lat: number } | null,
    excludeTo: { lng: number; lat: number } | null,
    routePoints: Array<{ lng: number; lat: number }>,
  ) => {
    const { sw, ne } = ctx.bbox
    const spanLng = Math.max(ne.lng - sw.lng, 0.008)
    const spanLat = Math.max(ne.lat - sw.lat, 0.008)
    const marginLng = spanLng * 0.1
    const marginLat = spanLat * 0.1

    for (let attempt = 0; attempt < 12; attempt++) {
      const lng = sw.lng + marginLng + Math.random() * (spanLng - marginLng * 2)
      const lat = sw.lat + marginLat + Math.random() * (spanLat - marginLat * 2)
      const px = map.project([lng, lat])
      let excluded = false
      if (
        excludeFrom &&
        pixelDistance(px, map.project([excludeFrom.lng, excludeFrom.lat])) < 34
      ) {
        excluded = true
      }
      if (!excluded && excludeTo) {
        if (
          pixelDistance(px, map.project([excludeTo.lng, excludeTo.lat])) < 34
        ) {
          excluded = true
        }
      }
      if (!excluded) {
        for (const point of routePoints) {
          if (pixelDistance(px, map.project([point.lng, point.lat])) < 16) {
            excluded = true
            break
          }
        }
      }
      if (!excluded) return { lng, lat }
    }
    return null
  }

  const driveSearchCar = (map: MapLibreMap, ctx: SearchCtx) => {
    if (searchCarsRef.current.length >= SEARCH_CAR_MAX) return
    const from = fromRef.current
    const to = toRef.current
    const routePoints =
      lastRouteRef.current?.geometry.coordinates?.map(([lng, lat]) => ({
        lng,
        lat,
      })) ?? []
    const start = sampleSearchPoint(
      map,
      ctx,
      from ? { lng: from.longitude, lat: from.latitude } : null,
      to ? { lng: to.longitude, lat: to.latitude } : null,
      routePoints,
    )
    if (!start) return
    const end = sampleSearchPoint(map, ctx, null, null, routePoints)
    if (!end) return

    const { element, img } = createSearchCarElement()
    const marker = new Marker({ element, anchor: "center" })
      .setLngLat([start.lng, start.lat])
      .addTo(map)

    const control = animate(0, 1, {
      duration: SEARCH_CAR_SEGMENT_MS / 1000,
      ease: "easeInOut",
      onUpdate: (p) => {
        marker.setLngLat([
          start.lng + (end.lng - start.lng) * p,
          start.lat + (end.lat - start.lat) * p,
        ])
        const fadeIn = Math.min(p / 0.14, 1)
        const fadeOut = Math.min((1 - p) / 0.18, 1)
        img.style.opacity = String(0.85 * Math.min(fadeIn, fadeOut))
        img.style.transform = `translateY(${(
          Math.sin(p * Math.PI * 3) * 1.5
        ).toFixed(2)}px)`
      },
      onComplete: () => {
        marker.remove()
        searchCarsRef.current = searchCarsRef.current.filter(
          (car) => car.control !== control,
        )
      },
    })
    searchCarsRef.current.push({ marker, img, control })
  }

  const startSearchRings = (map: MapLibreMap) => {
    stopSearchRings()
    const origin = fromRef.current
    if (!origin) return
    const { element, rings } = createSearchRingElement()
    const marker = new Marker({ element, anchor: "center" })
      .setLngLat([origin.longitude, origin.latitude])
      .addTo(map)

    if (searchReducedRef.current) {
      rings[0].style.opacity = "0.3"
      searchRingsRef.current = { marker, controls: [], staticRing: rings[0] }
      return
    }

    const controls: AnimationPlaybackControls[] = []
    for (let i = 0; i < rings.length; i++) {
      controls.push(
        animate(
          rings[i],
          { opacity: [0.55, 0], scale: [0.35, 1.5] },
          {
            duration: 2.6,
            delay: i * 0.85,
            ease: "easeOut",
            repeat: Infinity,
          },
        ),
      )
    }
    searchRingsRef.current = { marker, controls, staticRing: null }
  }

  const stopSearchRings = () => {
    const rings = searchRingsRef.current
    if (!rings) return
    for (const control of rings.controls) control.stop()
    rings.marker.remove()
    searchRingsRef.current = null
  }

  const startSearchCars = (map: MapLibreMap, ctx: SearchCtx) => {
    if (searchReducedRef.current) return
    for (let i = 0; i < SEARCH_CAR_MIN; i++) driveSearchCar(map, ctx)
    if (searchSpawnTimerRef.current === null) {
      searchSpawnTimerRef.current = window.setInterval(() => {
        const mapNow = mapRef.current
        const ctxNow = searchCtxRef.current
        if (!mapNow || !ctxNow || !searchingRef.current) return
        driveSearchCar(mapNow, ctxNow)
      }, SEARCH_CAR_SPAWN_INTERVAL_MS)
    }
  }

  const resetSearchVisuals = () => {
    if (searchSpawnTimerRef.current !== null) {
      window.clearInterval(searchSpawnTimerRef.current)
      searchSpawnTimerRef.current = null
    }
    for (const car of searchCarsRef.current) {
      car.control.stop()
      car.marker.remove()
    }
    searchCarsRef.current = []
    stopSearchRings()
  }

  const stopSearchCars = () => {
    searchingRef.current = false
    resetSearchVisuals()
    searchCtxRef.current = null
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || mapRef.current) return

    const createMap = () => {
      if (!containerRef.current || mapRef.current) return
      const map = new MapLibreMap({
        container: containerRef.current,
        style: LIGHT_STYLE_URL,
        center,
        zoom,
      })
      map.addControl(new NavigationControl(), "top-right")
      map.addControl(
        new AttributionControl({
          compact: false,
          customAttribution: "© OpenStreetMap contributors",
        }),
      )
      const geolocate = new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: true,
        showAccuracyCircle: true,
      })
      map.on("click", (e) => {
        if (!pickModeRef.current || !onPickPointRef.current) return
        onPickPointRef.current({
          latitude: e.lngLat.lat,
          longitude: e.lngLat.lng,
        })
      })
      geolocate.on("geolocate", () => {
        showGeoStatus("Your location is set")
      })
      geolocate.on("error", (event: GeolocateErrorEvent) => {
        if (event.code === 1) {
          showGeoStatus("Location permission denied")
        } else if (event.code === 2) {
          showGeoStatus("Location currently unavailable")
        } else if (event.code === 3) {
          showGeoStatus("Location request timed out")
        } else {
          showGeoStatus("Could not get your location")
        }
      })
      map.addControl(geolocate, "top-right")
      map.on("style.load", () => {
        ensureRouteLayers(map)
        setRouteTick((t) => t + 1)
        applyEnglishLabels(map)
        if (themeRef.current === "dark") applyDarkLabelColors(map)
      })
      mapRef.current = map
      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        resizeObserverRef.current?.disconnect()
        resizeObserverRef.current = new ResizeObserver(() => map.resize())
        resizeObserverRef.current.observe(containerRef.current)
      }
      setMapReady(true)
    }

    const timer = window.setTimeout(createMap, 0)

    return () => {
      window.clearTimeout(timer)
      if (geoStatusTimerRef.current !== null) {
        window.clearTimeout(geoStatusTimerRef.current)
        geoStatusTimerRef.current = null
      }
      fromMarkerRef.current?.remove()
      toMarkerRef.current?.remove()
      driverMarkerRef.current?.remove()
      stopDriverAnimation()
      stopSearchCars()
      fromMarkerRef.current = null
      toMarkerRef.current = null
      driverMarkerRef.current = null
      driverImgRef.current = null
      driverDisplayRef.current = null
      driverTargetRef.current = null
      driverPrevFixRef.current = null
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [center, zoom])

  useEffect(() => {
    themeRef.current = theme
    mapRef.current?.setStyle(theme === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL)
  }, [theme])

  useEffect(() => {
    onPickPointRef.current = onPickPoint
  }, [onPickPoint])

  useEffect(() => {
    pickModeRef.current = pickMode
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickMode ? "crosshair" : ""
  }, [pickMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    fromMarkerRef.current?.remove()
    toMarkerRef.current?.remove()
    fromMarkerRef.current = null
    toMarkerRef.current = null

    if (from) {
      fromMarkerRef.current = new Marker({
        element: createLocationMarkerElement("from"),
      })
        .setLngLat([from.longitude, from.latitude])
        .addTo(map)
    }
    if (to) {
      toMarkerRef.current = new Marker({
        element: createLocationMarkerElement("to"),
      })
        .setLngLat([to.longitude, to.latitude])
        .addTo(map)
    }
  }, [mapReady, from, to])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (!driverLocation) {
      driverMarkerRef.current?.remove()
      stopDriverAnimation()
      driverMarkerRef.current = null
      driverImgRef.current = null
      driverDisplayRef.current = null
      driverTargetRef.current = null
      driverPrevFixRef.current = null
      return
    }

    const next = {
      lat: driverLocation.latitude,
      lng: driverLocation.longitude,
    }
    const firstFix = driverPrevFixRef.current === null

    const targetHeading = computeTargetHeading({
      heading:
        driverLocation.heading === undefined ? null : driverLocation.heading,
      speed: driverLocation.speed === undefined ? null : driverLocation.speed,
      prevFix: driverPrevFixRef.current,
      nextFix: next,
      displayHeading: driverDisplayRef.current?.heading ?? null,
      targetHeading: driverTargetRef.current?.heading ?? null,
      noiseThresholdM: DRIVER_NOISE_THRESHOLD_M,
      minSpeedMps: DRIVER_MIN_SPEED_MPS,
    })

    const prev = driverPrevFixRef.current
    const moved =
      prev === null
        ? 0
        : haversineMeters(prev.lat, prev.lng, next.lat, next.lng)
    if (firstFix || moved >= DRIVER_NOISE_THRESHOLD_M) {
      driverPrevFixRef.current = next
    }

    driverTargetRef.current = { ...next, heading: targetHeading }

    if (!driverMarkerRef.current) {
      const { element, img } = createDriverMarkerElement()
      driverImgRef.current = img
      driverDisplayRef.current = {
        lat: next.lat,
        lng: next.lng,
        heading: targetHeading,
      }
      driverMarkerRef.current = new Marker({
        element,
        anchor: "center",
        rotation: vehicleRotationDeg(targetHeading),
        rotationAlignment: "map",
        pitchAlignment: "map",
        subpixelPositioning: true,
      })
        .setLngLat([next.lng, next.lat])
        .addTo(map)
    }

    startDriverAnimation()
    // latest fixes supersede any stale animation target already in flight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapReady,
    driverLocation?.latitude,
    driverLocation?.longitude,
    driverLocation?.heading,
    driverLocation?.speed,
  ])

  useEffect(() => {
    fromRef.current = from
  }, [from])

  useEffect(() => {
    toRef.current = to
  }, [to])

  // Driver-search lifecycle: enter/leave the search state exactly once per
  // change — one camera zoom-out on enter, one restore on leave, alongside the
  // purely-decorative rings + PNG cars. No repeated fitBounds during renders.
  // Cleanup removes every marker, Motion control and timer (StrictMode-safe).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    searchingRef.current = Boolean(searching)

    if (!searching) {
      const hasVisuals =
        searchCarsRef.current.length > 0 ||
        searchRingsRef.current !== null ||
        searchSpawnTimerRef.current !== null
      if (!hasVisuals) return
      stopSearchCars()
      const box = getSearchBBox(
        lastRouteRef.current,
        fromRef.current,
        toRef.current,
      )
      if (!box) return
      map.fitBounds(
        new LngLatBounds([box.sw.lng, box.sw.lat], [box.ne.lng, box.ne.lat]),
        {
          padding: 80,
          maxZoom: 14,
          duration: searchReducedRef.current ? 0 : 1200,
          easing: cubicInOut,
        },
      )
      return
    }

    const box = getSearchBBox(
      lastRouteRef.current,
      fromRef.current,
      toRef.current,
    )
    if (!box) return
    resetSearchVisuals()
    searchCtxRef.current = { bbox: box }
    startSearchRings(map)
    startSearchCars(map, { bbox: box })
    map.fitBounds(
      new LngLatBounds([box.sw.lng, box.sw.lat], [box.ne.lng, box.ne.lat]),
      {
        padding: SEARCH_CAR_VIEWPORT_PADDING,
        maxZoom: SEARCH_CAR_VIEWPORT_MAX_ZOOM,
        duration: searchReducedRef.current ? 0 : 1400,
        easing: cubicInOut,
      },
    )
  }, [searching, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (map.isStyleLoaded()) ensureRouteLayers(map)

    const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined
    if (!source) return

    if (route !== lastRouteRef.current) {
      lastRouteRef.current = route
      routeOriginRef.current =
        route && from && to
          ? {
              from: `${from.longitude},${from.latitude}`,
              to: `${to.longitude},${to.latitude}`,
            }
          : null
    }

    const origin = routeOriginRef.current
    const fromKey = from ? `${from.longitude},${from.latitude}` : null
    const toKey = to ? `${to.longitude},${to.latitude}` : null
    const matchesCurrent =
      route !== null &&
      origin !== null &&
      origin.from === fromKey &&
      origin.to === toKey

    source.setData(
      !navPhaseId && matchesCurrent && route
        ? { type: "Feature", properties: {}, geometry: route.geometry }
        : ROUTE_EMPTY_GEOJSON,
    )
    // only coordinate changes should trigger route refreshes, not object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, route, routeTick, navPhaseId, from?.longitude, from?.latitude, to?.longitude, to?.latitude])

  // Navigation route (active navigation: arriving/in_progress)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (map.isStyleLoaded()) ensureRouteLayers(map)

    const source = map.getSource(NAV_ROUTE_SOURCE_ID) as GeoJSONSource | undefined
    if (!source) return

    source.setData(
      navRoute
        ? { type: "Feature", properties: {}, geometry: navRoute.geometry }
        : ROUTE_EMPTY_GEOJSON,
    )
  }, [mapReady, navRoute])

  // Camera fitting for navigation phase: fit once per phase change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (searchingRef.current) return

    if (navPhaseId && navRoute) {
      if (navFittedPhaseRef.current !== navPhaseId) {
        navFittedPhaseRef.current = navPhaseId
        const bounds = new LngLatBounds()
        for (const coordinate of navRoute.geometry.coordinates) {
          bounds.extend(coordinate)
        }
        map.fitBounds(bounds, {
          padding: 80,
          duration: 900,
          maxZoom: 14,
        })
      }
    }
  }, [mapReady, navPhaseId, navRoute])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (searchingRef.current) return
    // Skip camera fitting during active navigation — navPhaseId effect handles it
    if (navPhaseId) return

    const origin = routeOriginRef.current
    const fitsCurrent =
      route !== null &&
      origin !== null &&
      origin.from === (from ? `${from.longitude},${from.latitude}` : null) &&
      origin.to === (to ? `${to.longitude},${to.latitude}` : null)

    if (fitsCurrent) {
      const bounds = new LngLatBounds()
      for (const coordinate of route!.geometry.coordinates) {
        bounds.extend(coordinate)
      }
      map.fitBounds(bounds, {
        padding: 80,
        duration: 900,
        maxZoom: 14,
      })
    } else if (from && to) {
      const sw: [number, number] = [
        Math.min(from.longitude, to.longitude),
        Math.min(from.latitude, to.latitude),
      ]
      const ne: [number, number] = [
        Math.max(from.longitude, to.longitude),
        Math.max(from.latitude, to.latitude),
      ]
      map.fitBounds(
        [sw, ne],
        {
          padding: 80,
          duration: 900,
          maxZoom: 14,
        },
      )
    } else if (from) {
      map.flyTo({
        center: [from.longitude, from.latitude],
        zoom: LOCATION_ZOOM,
        duration: 900,
      })
    } else if (to) {
      map.flyTo({
        center: [to.longitude, to.latitude],
        zoom: LOCATION_ZOOM,
        duration: 900,
      })
    }
  }, [mapReady, from, to, route, navPhaseId])

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full overflow-hidden", className)}
    >
      <button
        type="button"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle map theme"
        title="Toggle dark / light map"
        className="absolute left-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-card lg:h-9 lg:w-9"
      >
        {theme === "light" ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </button>
      {pickMode && (
        <div className="pointer-events-none absolute left-[60px] top-2 z-10 rounded-lg border border-primary/25 bg-card/95 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur lg:left-[52px]">
          Click the map to set your{" "}
          {pickMode === "from" ? "pickup" : "destination"} location
        </div>
      )}
      {geoStatus && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11.5px] font-medium text-foreground shadow-sm backdrop-blur">
          {geoStatus}
        </div>
      )}
    </div>
  )
}