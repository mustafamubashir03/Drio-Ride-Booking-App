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
const ROUTE_CASING_LAYER_ID = "route-line-casing"
const ROUTE_LAYER_ID = "route-line"

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
}

type MapTheme = "light" | "dark"

interface MapProps {
  className?: string
  center?: [number, number]
  zoom?: number
  from?: SelectedLocation | null
  to?: SelectedLocation | null
  route?: RouteResult | null
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
}

export default function Map({
  className,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  from = null,
  to = null,
  route = null,
  pickMode = null,
  onPickPoint,
  driverLocation = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
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
      fromMarkerRef.current = null
      toMarkerRef.current = null
      driverMarkerRef.current = null
      driverImgRef.current = null
      driverDisplayRef.current = null
      driverTargetRef.current = null
      driverPrevFixRef.current = null
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
      matchesCurrent && route
        ? { type: "Feature", properties: {}, geometry: route.geometry }
        : ROUTE_EMPTY_GEOJSON,
    )
    // only coordinate changes should trigger route refreshes, not object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, route, routeTick, from?.longitude, from?.latitude, to?.longitude, to?.latitude])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

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
  }, [mapReady, from, to, route])

  return (
    <div
      ref={containerRef}
      className={cn("relative h-[400px] w-full overflow-hidden", className)}
    >
      <button
        type="button"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle map theme"
        title="Toggle dark / light map"
        className="absolute top-2 left-2 z-10 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-card"
      >
        {theme === "light" ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </button>
      {pickMode && (
        <div className="pointer-events-none absolute top-2 left-[52px] z-10 rounded-lg border border-primary/25 bg-card/95 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur">
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