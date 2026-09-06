import type { Harbour, HarbourId } from '../types'

/**
 * Three Andhra Pradesh fishing harbours, each an independent co-operative.
 *
 * Provenance, because a chart that lies is worse than no chart:
 *
 *  - Nizampatnam and Kakinada basin centres come from OpenStreetMap
 *    (the "Nizampatam Harbour" and "Kakinada Port" nodes).
 *  - Visakhapatnam's fishing harbour is not indexed in OSM, so its centre
 *    is approximate to within a few hundred metres.
 *  - Box and landmark positions are plausible offsets inside each basin,
 *    not a survey.
 *
 * A real deployment replaces this file — and only this file — with
 * positions taken by the societies themselves. Nothing else in the app
 * knows where anything is.
 *
 * Each chill-box stands at the landmark it is named after — the auction
 * hall, the ice plant, the diesel bunk — so a skipper never has to hold
 * "box 2" and "the one by the ice plant" as two separate facts. The only
 * landmark drawn separately is the harbour office.
 */
export const HARBOURS: Record<HarbourId, Harbour> = {
  vizag: {
    id: 'vizag',
    nameEn: 'Visakhapatnam',
    nameTe: 'విశాఖపట్నం',
    unionEn: 'Visakha Fishermen Co-operative Society',
    unionTe: 'విశాఖ మత్స్యకార సహకార సంఘం',
    lat: 17.69,
    lon: 83.287,
    mouthBearing: 96,
    boxes: {
      box1: { id: 'box1', lat: 17.6911, lon: 83.2861 },
      box2: { id: 'box2', lat: 17.6888, lon: 83.2872 },
      box3: { id: 'box3', lat: 17.6902, lon: 83.2885 },
    },
    landmarks: [{ key: 'lmOffice', lat: 17.6902, lon: 83.2868 }],
    office: '0891 2554 100',
  },

  kakinada: {
    id: 'kakinada',
    nameEn: 'Kakinada',
    nameTe: 'కాకినాడ',
    unionEn: 'Kakinada Fishermen Co-operative Society',
    unionTe: 'కాకినాడ మత్స్యకార సహకార సంఘం',
    lat: 16.9511,
    lon: 82.2654,
    mouthBearing: 74,
    boxes: {
      box1: { id: 'box1', lat: 16.9522, lon: 82.2645 },
      box2: { id: 'box2', lat: 16.9499, lon: 82.2656 },
      box3: { id: 'box3', lat: 16.9513, lon: 82.2669 },
    },
    landmarks: [{ key: 'lmOffice', lat: 16.9513, lon: 82.2652 }],
    office: '0884 2372 200',
  },

  nizampatnam: {
    id: 'nizampatnam',
    nameEn: 'Nizampatnam',
    nameTe: 'నిజాంపట్నం',
    unionEn: 'Nizampatnam Fishermen Co-operative Society',
    unionTe: 'నిజాంపట్నం మత్స్యకార సహకార సంఘం',
    lat: 15.884,
    lon: 80.6387,
    mouthBearing: 158,
    boxes: {
      box1: { id: 'box1', lat: 15.8851, lon: 80.6378 },
      box2: { id: 'box2', lat: 15.8828, lon: 80.6389 },
      box3: { id: 'box3', lat: 15.8842, lon: 80.6402 },
    },
    landmarks: [{ key: 'lmOffice', lat: 15.8842, lon: 80.6385 }],
    office: '08648 234 100',
  },
}

export const HARBOUR_IDS = Object.keys(HARBOURS) as HarbourId[]

export const DEFAULT_HARBOUR_ID: HarbourId = 'nizampatnam'

export function harbour(id: HarbourId): Harbour {
  return HARBOURS[id]
}
