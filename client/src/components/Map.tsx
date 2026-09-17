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
}

export default function Map({
  className,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  from = null,
  to = null,
  route = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const fromMarkerRef = useRef<Marker | null>(null)
  const toMarkerRef = useRef<Marker | null>(null)
  const themeRef = useRef<MapTheme>("light")
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
      fromMarkerRef.current = null
      toMarkerRef.current = null
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
      {geoStatus && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11.5px] font-medium text-foreground shadow-sm backdrop-blur">
          {geoStatus}
        </div>
      )}
    </div>
  )
}