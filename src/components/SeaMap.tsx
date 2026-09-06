import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { routeLegs } from '../lib/nav'
import type { BoxId, GeoFix, Harbour } from '../types'

const boxIds: BoxId[] = ['box1', 'box2', 'box3']

export interface BoxMarker {
  id: BoxId
  label: string
  free: number
  full: boolean
}

/**
 * The booking chart. All three cold boxes are pinned with their free-crate
 * count, the shore landmarks a skipper actually steers by are labelled, and
 * tapping a pin books that box — the map is the primary way in, not a
 * decoration next to the real controls.
 *
 * Tiles are OpenStreetMap for the coastline plus the OpenSeaMap seamark
 * overlay for buoys and beacons. Both are open services with no key, no
 * quota tier and no billing account, which is the whole reason this can
 * ship to a fishing co-operative.
 *
 * Leaflet is driven imperatively rather than through a React wrapper: the
 * map is one long-lived object, and re-creating it every render is the
 * classic way these integrations get slow and leaky.
 */
export function SeaMap({
  harbour,
  fix,
  boxes,
  selectedId,
  routeTo,
  landmarkLabel,
  offlineLabel,
  mapLabel,
  onPick,
}: {
  harbour: Harbour
  fix: GeoFix | null
  boxes: BoxMarker[]
  selectedId: BoxId | null
  routeTo: BoxId | null
  landmarkLabel: (key: string) => string
  offlineLabel: string
  mapLabel: string
  onPick?: (id: BoxId) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const overlay = useRef<L.LayerGroup | null>(null)
  // The boat and its route live on their own layer so they can be redrawn
  // on every position update without touching the box pins. See below.
  const boat = useRef<L.LayerGroup | null>(null)
  const [tilesFailed, setTilesFailed] = useState(false)
  // Latest props, readable from effects that must NOT re-run when they
  // change: the fix moves every few seconds and must not re-frame the map
  // under the user's hand. Assigned in an effect, not during render.
  const fixRef = useRef(fix)
  const harbourRef = useRef(harbour)
  // `onPick` is here for the same reason. The parent renders once a second
  // (it shows a countdown), so an inline handler is a new identity every
  // second — and with it in the redraw effect's dependencies the whole
  // overlay was torn down and rebuilt at 1 Hz. That defeated the memoised
  // `markers` put there to prevent exactly this, and a rebuild landing
  // between a thumb going down and coming up destroyed the marker before
  // the click could fire, so roughly one tap in ten was silently lost.
  const pickRef = useRef(onPick)
  useEffect(() => {
    fixRef.current = fix
    harbourRef.current = harbour
    pickRef.current = onPick
  }, [fix, harbour, onPick])

  // Create once. Everything after this is a layer update.
  useEffect(() => {
    if (!host.current || map.current) return

    // On a touch screen the chart sits mid-page, so one-finger drag must
    // scroll the PAGE, not pan the map — otherwise a thumb landing on the
    // chart traps the scroll and the box list below becomes unreachable.
    // Pinch-zoom and the +/- buttons still work, and panning is not the
    // point here: the three boxes are framed for you.
    const touch = window.matchMedia('(pointer: coarse)').matches
    const instance = L.map(host.current, {
      attributionControl: true,
      dragging: !touch,
      scrollWheelZoom: !touch,
      touchZoom: true,

    }).setView([harbourRef.current.lat, harbourRef.current.lon], 15)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    })
      .on('tileerror', () => setTilesFailed(true))
      .on('tileload', () => setTilesFailed(false))
      .addTo(instance)

    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      opacity: 0.9,
      attribution: '&copy; OpenSeaMap',
    }).addTo(instance)

    overlay.current = L.layerGroup().addTo(instance)
    boat.current = L.layerGroup().addTo(instance)
    map.current = instance

    // Three boxes sit ~300 m apart, so at route zoom every label overlaps
    // its neighbour. Labels thin out as the view widens: shore landmarks go
    // first, then the box names, leaving the pins themselves always legible.
    const density = () => {
      const zoom = instance.getZoom()
      const el = instance.getContainer()
      // Box labels are what you tap, so they win the default view; the
      // shore landmarks name themselves once you zoom in to the quay.
      el.classList.toggle('hide-landmarks', zoom < 17)
      el.classList.toggle('hide-box-labels', zoom < 13)
    }
    density()
    instance.on('zoomend', density)

    // The container is laid out after Leaflet measures it, so the first
    // fitBounds would use a stale size and crop the view. Re-measure on
    // every container resize (mount, rotation, keyboard open).
    const resize = new ResizeObserver(() => instance.invalidateSize())
    resize.observe(host.current)

    return () => {
      resize.disconnect()
      instance.remove()
      map.current = null
      overlay.current = null
      boat.current = null
    }
  }, [])

  // Redraw the box pins and shore landmarks. NOT the boat — see below.
  useEffect(() => {
    const instance = map.current
    const group = overlay.current
    if (!instance || !group) return

    group.clearLayers()

    for (const landmark of harbour.landmarks) {
      L.marker([landmark.lat, landmark.lon], { icon: dot() })
        .addTo(group)
        .bindTooltip(landmarkLabel(landmark.key), {
          permanent: true,
          direction: 'bottom',
          className: 'sea-landmark',
          offset: [0, 6],
        })
    }

    for (const marker of boxes) {
      const site = harbour.boxes[marker.id]
      const pin = L.marker([site.lat, site.lon], {
        icon: boxPin(marker, marker.id === selectedId),
        keyboard: true,
        title: marker.label,
      }).addTo(group)
      pin.bindTooltip(`${marker.label} · ${marker.full ? '0' : marker.free}`, {
        permanent: true,
        direction: 'top',
        className: 'sea-box',
        offset: [0, -30],
      })
      // Every pin answers a tap, including a full one. The map is the
      // primary way in and the screen above it says to tap a box; a pin that
      // silently ignored the tap taught a skipper the app was broken. The
      // caller decides what the tap means — book it, or show who is inside —
      // exactly as the box cards already do.
      pin.on('click', () => pickRef.current?.(marker.id))
    }

    // NOTE: the boat pin and its route are NOT drawn here. They move with
    // the position, which arrives about once a second, and redrawing this
    // group on every one of those tore down and rebuilt all three box pins.
    // A rebuild landing between a thumb going down and coming up destroys
    // the marker before its click fires, so roughly one tap in ten was lost
    // on the primary booking path — for every phone whose location works.
    // The last round removed `onPick` from these dependencies and left
    // `fix`, and verified the fix on the demo button, which sets a position
    // once and never again. See the boat layer below.
  }, [harbour, boxes, selectedId, landmarkLabel])

  // The boat and its route, on their own layer and their own clock.
  useEffect(() => {
    const group = boat.current
    if (!group) return
    group.clearLayers()
    if (!fix) return

    L.marker([fix.lat, fix.lon], { icon: boatPin() }).addTo(group)
    if (routeTo) {
      L.polyline(routeLegs(fix, harbour, routeTo), {
        color: SEA,
        weight: 6,
        dashArray: '10 8',
      }).addTo(group)
    }

    // Before a booking the map's job is to let a skipper pick between three
    // boxes 300 m apart, so it frames the harbour. Including a fix 8 km
    // offshore would zoom out until all three pins sat on the same pixel and
    // none of them could be tapped. Distance to each box is on its card, and
    // the boat and its route take over the view once one is booked.
  }, [harbour, fix, routeTo])

  // Frame the view only when WHAT is being framed changes — the harbour, or
  // which box the route runs to. Refitting on every redraw would snap a
  // pinch-zoom back within a second and make the chart impossible to explore.
  useEffect(() => {
    const instance = map.current
    if (!instance) return

    if (fixRef.current && routeTo) {
      instance.fitBounds(L.latLngBounds(routeLegs(fixRef.current, harbour, routeTo)).pad(0.3))
    } else {
      const points = boxIds.map((id) => [harbour.boxes[id].lat, harbour.boxes[id].lon] as [number, number])
      instance.fitBounds(L.latLngBounds(points).pad(0.45), { maxZoom: 16 })
    }
    instance.fire('zoomend')
  }, [harbour, routeTo])

  return (
    <div className="relative">
      <div
        ref={host}
        className="h-[46vh] min-h-72 w-full border-3 border-rule"
        // Not role="application": that blackboxes the whole chart for a
        // screen reader, and there is nothing here it could then reach. The
        // pins are also box cards further down the page, which is the path
        // that actually works. The label was the one hardcoded English
        // string in the app, in a Telugu-first UI.
        role="img"
        aria-label={mapLabel}
      />
      {tilesFailed ? (
        <p className="absolute inset-x-0 bottom-0 z-[500] bg-late px-2 py-1 text-sm font-extrabold text-late-ink">
          {offlineLabel}
        </p>
      ) : null}
    </div>
  )
}

/*
 * Markers are inline HTML in the app's own slab language rather than the
 * default bitmap pins.
 *
 * Colours are plain hex, deliberately. They sit on a raster sea chart, not
 * on the app's themed surfaces, so they do not need to follow day/night —
 * and reading them from CSS tokens would hand Leaflet an oklch() string,
 * which the old Android WebViews cannot parse in an SVG attribute. Hex is
 * the one form every engine understands.
 */
const INK = '#111111'
const FREE = '#1f7a4d'
const FULL = '#b3271e'
const SEA = '#1c6ea4'
const PAPER = '#ffffff'

/**
 * Box pins are deliberately oversized. From 8 km out this is how a skipper
 * picks a box — one-handed, wet screen, glare — so the target is 56 px and
 * the free-crate count is large enough to read at arm's length.
 */
function boxPin({ free, full }: BoxMarker, selected: boolean): L.DivIcon {
  const bg = full ? FULL : FREE
  return L.divIcon({
    className: '',
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    html:
      `<span style="display:grid;place-items:center;width:56px;height:56px;` +
      `border:${selected ? 6 : 4}px solid ${INK};background:${bg};` +
      `color:#fff;font-weight:800;font-size:24px;line-height:1">${full ? '×' : free}</span>`,
  })
}

function boatPin(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html:
      `<span style="display:grid;place-items:center;width:34px;height:34px;` +
      `border:4px solid ${INK};` +
      `background:${SEA};color:#fff;` +
      `font-weight:800;font-size:16px;line-height:1">&#9650;</span>`,
  })
}

function dot(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html:
      `<span style="display:block;width:12px;height:12px;` +
      `border:3px solid ${INK};` +
      `background:${PAPER}"></span>`,
  })
}
