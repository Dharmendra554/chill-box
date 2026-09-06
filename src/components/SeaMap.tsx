import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { routeLegs } from '../lib/nav'
import type { BoxId, GeoFix, Harbour } from '../types'

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
  seamarkLabel,
  onPick,
}: {
  harbour: Harbour
  fix: GeoFix | null
  boxes: BoxMarker[]
  selectedId: BoxId | null
  routeTo: BoxId | null
  landmarkLabel: (key: string) => string
  offlineLabel: string
  seamarkLabel: string
  onPick?: (id: BoxId) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const overlay = useRef<L.LayerGroup | null>(null)
  const [tilesFailed, setTilesFailed] = useState(false)

  // Create once. Everything after this is a layer update.
  useEffect(() => {
    if (!host.current || map.current) return

    const instance = L.map(host.current, { attributionControl: true }).setView(
      [harbour.lat, harbour.lon],
      15,
    )

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
      attribution: `&copy; OpenSeaMap (${seamarkLabel})`,
    }).addTo(instance)

    overlay.current = L.layerGroup().addTo(instance)
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
    }
    // Seeded once; every later change is handled by the layer effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw pins, landmarks and route whenever anything moves.
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

    const points: Array<[number, number]> = []

    for (const marker of boxes) {
      const site = harbour.boxes[marker.id]
      points.push([site.lat, site.lon])
      const pin = L.marker([site.lat, site.lon], {
        icon: boxPin(marker, marker.id === selectedId),
        keyboard: true,
        title: marker.label,
      }).addTo(group)
      pin.bindTooltip(`${marker.label} · ${marker.full ? '0' : marker.free}`, {
        permanent: true,
        direction: 'top',
        className: 'sea-box',
        offset: [0, -22],
      })
      if (onPick && !marker.full) pin.on('click', () => onPick(marker.id))
    }

    if (fix) L.marker([fix.lat, fix.lon], { icon: boatPin() }).addTo(group)

    if (fix && routeTo) {
      const legs = routeLegs(fix, harbour, routeTo)
      L.polyline(legs, { color: 'var(--c-sea)', weight: 5, dashArray: '10 8' }).addTo(group)
      instance.fitBounds(L.latLngBounds(legs).pad(0.3))
      instance.fire('zoomend')
      return
    }

    // Before a booking the map's job is to let a skipper pick between three
    // boxes 300 m apart, so it frames the harbour. Including a fix 8 km
    // offshore would zoom out until all three pins sat on the same pixel and
    // none of them could be tapped. Distance to each box is on its card, and
    // the boat and its route take over the view once one is booked.
    instance.fitBounds(L.latLngBounds(points).pad(0.45), { maxZoom: 16 })
    instance.fire('zoomend')
  }, [harbour, fix, boxes, selectedId, routeTo, landmarkLabel, onPick])

  return (
    <div className="relative">
      <div
        ref={host}
        className="h-[46vh] min-h-72 w-full border-3 border-rule"
        role="application"
        aria-label="chart"
      />
      {tilesFailed ? (
        <p className="absolute inset-x-0 bottom-0 z-[500] bg-late px-2 py-1 text-sm font-extrabold text-late-ink">
          {offlineLabel}
        </p>
      ) : null}
    </div>
  )
}

/* Markers are inline HTML in the app's own slab language rather than the
   default bitmap pins, so the chart matches every other surface. */

function boxPin({ free, full }: BoxMarker, selected: boolean): L.DivIcon {
  const bg = full ? 'var(--c-full)' : 'var(--c-free)'
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html:
      `<span style="display:grid;place-items:center;width:40px;height:40px;` +
      `border:${selected ? 5 : 3}px solid var(--c-ink);background:${bg};` +
      `color:#fff;font-weight:800;font-size:16px;line-height:1">${full ? '×' : free}</span>`,
  })
}

function boatPin(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html:
      `<span style="display:grid;place-items:center;width:28px;height:28px;` +
      `border:3px solid var(--c-ink);background:var(--c-sea);color:#fff;` +
      `font-weight:800;font-size:14px;line-height:1">&#9650;</span>`,
  })
}

function dot(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<span style="display:block;width:12px;height:12px;border:3px solid var(--c-ink);background:var(--c-paper)"></span>`,
  })
}
