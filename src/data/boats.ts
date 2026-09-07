import { HARBOUR_IDS } from './harbours'
import type { Boat, HarbourId, Lang } from '../types'

/**
 * Seed rosters, one per harbour co-operative. Owner names and numbers are
 * demo placeholders; in a real deployment the society secretary builds the
 * roster through registration and approval.
 *
 * Hull numbers are unique per harbour, not globally — that is how the
 * societies actually number their boats, and it keeps `#04` short enough to
 * read on a crate grid.
 */
type Seed = [name: string, nameTe: string, owner: string, mobile: string]

const ROSTERS: Record<HarbourId, Seed[]> = {
  nizampatnam: [
    ['Ganga', 'గంగ', 'Kolla Satyanarayana', '9848012001'],
    ['Godavari', 'గోదావరి', 'Pilli Ramesh', '9848012002'],
    ['Krishna', 'కృష్ణ', 'Yenugu Nagaraju', '9848012003'],
    ['Ramu', 'రాము', 'Chinta Ramu', '9848012004'],
    ['Lakshmi', 'లక్ష్మి', 'Bommi Lakshmi', '9848012005'],
    ['Sagar', 'సాగర్', 'Vasa Sagar', '9848012006'],
    ['Varun', 'వరుణ్', 'Golla Varun', '9848012007'],
    ['Narmada', 'నర్మద', 'Peddi Suribabu', '9848012008'],
    ['Sindhu', 'సింధు', 'Karri Sindhu', '9848012009'],
    ['Kaveri', 'కావేరి', 'Mutyala Rao', '9848012010'],
    ['Ananda', 'ఆనంద', 'Gadde Ananda', '9848012011'],
    ['Jyothi', 'జ్యోతి', 'Tenali Jyothi', '9848012012'],
    ['Meghana', 'మేఘన', 'Bandi Meghana', '9848012013'],
    ['Jaladhi', 'జలధి', 'Koneru Prasad', '9848012014'],
    ['Ratna', 'రత్న', 'Alla Ratnam', '9848012015'],
    ['Pallavi', 'పల్లవి', 'Dasari Pallavi', '9848012016'],
    ['Teja', 'తేజ', 'Repalle Teja', '9848012017'],
    ['Samudra', 'సముద్ర', 'Vempati Naidu', '9848012018'],
    ['Vayu', 'వాయు', 'Sanka Vayu', '9848012019'],
    ['Matsya', 'మత్స్య', 'Ganta Srinu', '9848012020'],
  ],
  vizag: [
    ['Simhachalam', 'సింహాచలం', 'Yerra Appalaraju', '9848013001'],
    ['Dolphin', 'డాల్ఫిన్', 'Pydi Ramana', '9848013002'],
    ['Gangamma', 'గంగమ్మ', 'Boddu Satyam', '9848013003'],
    ['Kailasa', 'కైలాస', 'Vasupalli Naidu', '9848013004'],
    ['Neelima', 'నీలిమ', 'Gorle Neelima', '9848013005'],
    ['Bheemili', 'భీమిలి', 'Chikkala Rao', '9848013006'],
    ['Yarada', 'యారాడ', 'Killo Suribabu', '9848013007'],
    ['Rushikonda', 'రుషికొండ', 'Mudili Ganesh', '9848013008'],
    ['Appanna', 'అప్పన్న', 'Vanjangi Appanna', '9848013009'],
    ['Sagarika', 'సాగరిక', 'Bonu Lakshmi', '9848013010'],
    ['Vamsi', 'వంశీ', 'Kondru Vamsi', '9848013011'],
    ['Tejaswi', 'తేజస్వి', 'Palla Tejaswi', '9848013012'],
  ],
  kakinada: [
    ['Uppada', 'ఉప్పాడ', 'Gadi Venkanna', '9848014001'],
    ['Coringa', 'కోరింగ', 'Mallipudi Rao', '9848014002'],
    ['Hope Island', 'హోప్ ఐలాండ్', 'Panasa Srinu', '9848014003'],
    ['Annapurna', 'అన్నపూర్ణ', 'Chodisetti Ravi', '9848014004'],
    ['Kanaka', 'కనక', 'Yeleswaram Kanaka', '9848014005'],
    ['Vasavi', 'వాసవి', 'Pothula Naidu', '9848014006'],
    ['Suryodaya', 'సూర్యోదయ', 'Bandaru Suresh', '9848014007'],
    ['Nagavali', 'నాగావళి', 'Kurra Nageswara', '9848014008'],
    ['Pushpa', 'పుష్ప', 'Vegi Pushpa', '9848014009'],
    ['Chandra', 'చంద్ర', 'Sarpavaram Chandu', '9848014010'],
    ['Vainateya', 'వైనతేయ', 'Alluri Babji', '9848014011'],
    ['Draksharama', 'ద్రాక్షారామ', 'Gollaprolu Sekhar', '9848014012'],
  ],
}

/** Registered ~90 days back so the monthly report has history to show. */
const SEED_REGISTERED_AT = Date.parse('2026-06-08T04:30:00+05:30')

export function seedBoats(): Boat[] {
  return HARBOUR_IDS.flatMap((harbourId) =>
    ROSTERS[harbourId].map(([nameEn, nameTe, owner, mobile], i) => ({
      id: String(i + 1).padStart(2, '0'),
      harbourId,
      nameEn,
      nameTe,
      owner,
      mobile,
      registeredAt: SEED_REGISTERED_AT,
    })),
  )
}

/**
 * Two boats that joined this week, so the "new" mark is never a claim the
 * demo cannot show.
 *
 * They used to be `pending` registrations, seeded to keep the admin's
 * approvals queue from being an empty state. There is no queue: nobody
 * approves anybody. What they demonstrate now is the opposite and it is the
 * better demonstration — a boat that turned up, registered and can book,
 * with the whole harbour able to see it arrived and nobody able to stop it.
 */
export function seedRecent(now: number): Boat[] {
  return [
    {
      id: '21',
      harbourId: 'nizampatnam' as const,
      nameEn: 'Deepika',
      nameTe: 'దీపిక',
      owner: 'Mandava Srinivas',
      mobile: '9848012021',
      registeredAt: now - 3 * 60 * 60 * 1000,
    },
    {
      id: '13',
      harbourId: 'vizag' as const,
      nameEn: 'Bhavani',
      nameTe: 'భవాని',
      owner: 'Uppala Bhaskar',
      mobile: '9848013013',
      registeredAt: now - 40 * 60 * 1000,
    },
  ]
}

export function boatsAt(boats: Boat[], harbourId: HarbourId): Boat[] {
  // Sorted by hull number, HERE, so every screen that lists boats agrees.
  //
  // The shared roster arrives as an object keyed "01".."21", and
  // `Object.entries` returns canonical integer keys first: #10..#21, then
  // #01..#09. The claim grid — the only path an already-registered skipper
  // takes — therefore ran to #21 before it reached #01, with the demo's own
  // boat #04 sixteenth of twenty-one. Local mode was sorted (it seeds from
  // an array) and shared mode was not, so no rehearsal without a live
  // database could ever see it.
  return boats.filter((b) => b.harbourId === harbourId).sort((a, b) => a.id.localeCompare(b.id))
}

export function boatName(boat: Boat, lang: Lang): string {
  return lang === 'te' ? boat.nameTe : boat.nameEn
}

/** Next free hull number within one harbour. */
export function nextBoatId(boats: Boat[], harbourId: HarbourId): string {
  const used = new Set(boatsAt(boats, harbourId).map((b) => Number(b.id)))
  let n = 1
  while (used.has(n)) n += 1
  return String(n).padStart(2, '0')
}

export function normaliseMobile(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10)
}

export function isValidMobile(raw: string): boolean {
  const digits = normaliseMobile(raw)
  return digits.length === 10 && /^[6-9]/.test(digits)
}
