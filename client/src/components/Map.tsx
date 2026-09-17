import { useEffect, useRef, useState } from "react"
import {
  AttributionControl,
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeolocateErrorEvent,
  type ExpressionSpecification,
  type SymbolLayerSpecification,
} from "maplibre-gl"
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import "maplibre-gl/dist/maplibre-gl.css"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

setWorkerUrl(maplibreWorkerUrl)

const LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark"
const DEFAULT_CENTER: [number, number] = [67.0011, 24.8607]
const DEFAULT_ZOOM = 11
const BRIGHT_LABEL_COLOR = "rgb(245, 245, 245)"

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

type MapTheme = "light" | "dark"

interface MapProps {
  className?: string
  center?: [number, number]
  zoom?: number
}

export default function Map({
  className,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const themeRef = useRef<MapTheme>("light")
  const [theme, setTheme] = useState<MapTheme>("light")
  const [geoStatus, setGeoStatus] = useState<string | null>(null)
  const geoStatusTimerRef = useRef<number | null>(null)

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
        applyEnglishLabels(map)
        if (themeRef.current === "dark") applyDarkLabelColors(map)
      })
      mapRef.current = map
    }

    const timer = window.setTimeout(createMap, 0)

    return () => {
      window.clearTimeout(timer)
      if (geoStatusTimerRef.current !== null) {
        window.clearTimeout(geoStatusTimerRef.current)
        geoStatusTimerRef.current = null
      }
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [center, zoom])

  useEffect(() => {
    themeRef.current = theme
    mapRef.current?.setStyle(theme === "dark" ? DARK_STYLE_URL : LIGHT_STYLE_URL)
  }, [theme])

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