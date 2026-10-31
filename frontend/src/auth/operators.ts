// DEMONSTRATION ACCOUNTS AND ASSETS — there is no real authentication or authorisation here.
// Operators, satellites and the mapping from satellites to fixture encounters are hand-written
// so the personalised views and the globe can be exercised. Orbital elements are plausible
// LEO values chosen for illustration; they are not propagated and are not from the dataset.

export type AssetCategory = 'payload' | 'rocket body' | 'debris'
export type AssetStatus = 'nominal' | 'manoeuvre planned' | 'safe mode' | 'decommissioning'

/** Orbit shell used for filters. Boundaries are illustrative. */
export type OrbitRegion = 'equatorial' | 'mid-inclination' | 'polar' | 'sun-synchronous'

export interface Satellite {
  id: string
  name: string
  /** Null for objects that are not part of a named constellation (debris, rocket bodies). */
  constellation: string | null
  /** Null for objects nobody in the demo operates (tracked context only). */
  operator_id: string | null
  category: AssetCategory
  status: AssetStatus | null
  orbit: { altitude_km: number; inclination_deg: number; raan_deg: number; phase_deg: number }
  /** Fixture encounters where this object is the protected target. */
  encounter_ids: string[]
  /** Short free-text shown in the panel, e.g. mission role. */
  role: string | null
}

export interface Operator {
  id: string
  name: string
  /** How the operator is addressed, e.g. given name. */
  short_name: string
  initials: string
  organisation: string
  /** Shown under the organisation, e.g. role or clearance label. */
  title: string
  /** Login handle shown on the demo account picker. */
  handle: string
  constellations: string[]
  /** Profile colour for the avatar and the selected card on the sign-in page. */
  accent: string
}

export const OPERATORS: Operator[] = [
  {
    id: 'op-ostin',
    name: 'Lim Wei Ling',
    short_name: 'Wei Ling',
    initials: 'WL',
    organisation: 'Office for Space Technology & Industry',
    title: 'Senior Flight Dynamics Officer',
    handle: 'w.lim',
    constellations: ['MERIDIAN', 'KESTREL'],
    accent: '#ff5f6d',
  },
  {
    id: 'op-horizon',
    name: 'Julian Rascol',
    short_name: 'Julian',
    initials: 'JR',
    organisation: 'Airbus Tech Hub',
    title: 'Constellation Operations Lead',
    handle: 'j.rascol',
    constellations: ['LATTICE'],
    accent: '#6fe3ff',
  },
  {
    id: 'op-nus',
    name: 'Aanya Mathur',
    short_name: 'Aanya',
    initials: 'AM',
    organisation: 'NUS',
    title: 'Satellite Mission Engineer',
    handle: 'a.mathur',
    constellations: ['AURORA', 'CORAL'],
    accent: '#a99cff',
  },
  {
    id: 'op-smu',
    name: 'Marcus Tan',
    short_name: 'Marcus',
    initials: 'MT',
    organisation: 'SMU Satellite Research Centre',
    title: 'Ground Segment Operations Engineer',
    handle: 'm.tan',
    constellations: ['HALCYON', 'LUMEN'],
    accent: '#46d1a0',
  },
]

function sat(
  id: string,
  name: string,
  constellation: string | null,
  operator_id: string | null,
  category: AssetCategory,
  status: AssetStatus | null,
  orbit: Satellite['orbit'],
  encounter_ids: string[] = [],
  role: string | null = null,
): Satellite {
  return { id, name, constellation, operator_id, category, status, orbit, encounter_ids: encounter_ids.map(liveId).filter((x): x is string => !!x), role }
}

// When the dashboard runs against the API (VITE_API_URL set, e.g. ml.demo_api on held-out
// validation data), each demo satellite is paired with a real encounter chosen to match its
// fixture's case. The pairing is a demonstration device: the dataset has no satellite names.
// No real counterpart exists for "no message ≥ 2 days out" in the validation set, so that one is null.
const LIVE = Boolean(((import.meta.env.VITE_API_URL as string | undefined) ?? '').trim())
export const LIVE_ENCOUNTER: Record<string, string | null> = {
  'fixture:0412': 'train:6237', // forecast caught a critical ending the rule missed (model card)
  'fixture:1187': 'train:8767', // critical by probability and distance
  'fixture:0935': 'train:9051', // critical by probability only
  'fixture:0873': 'train:8732', // limitation: looked safe at the 2-day cutoff
  'fixture:2210': 'train:5253', // forecast raised elevated to critical
  'fixture:0566': 'train:8216', // weak upgrade, score just over the threshold
  'fixture:0078': 'train:10690', // elevated within 24 h
  'fixture:1653': 'train:8901', // single early message
  'fixture:0301': 'train:7974', // elevated, later
  'fixture:1920': 'train:9141', // elevated by distance only, Pc at the floor
  'fixture:0244': 'train:12589', // space weather missing
  'fixture:2044': 'train:8152', // safe
  'fixture:0819': 'train:3991', // safe, Pc at the floor
  'fixture:1371': 'train:10817', // safe, rocket body
  'fixture:1504': null, // no real counterpart in the validation cohort
}
// Satellites added after the fixtures were written (AURORA, HALCYON) name real encounters
// directly; they have no fixture, so they show no alerts when the dashboard runs on fixtures.
function liveId(id: string): string | null {
  if (!id.startsWith('fixture:')) return LIVE ? id : null
  return LIVE ? LIVE_ENCOUNTER[id] ?? null : id
}

// MERIDIAN: six near-equatorial imaging satellites at 560 km, 10°.
// KESTREL: two sun-synchronous radar satellites at 520 km, 97.6°.
// LATTICE: eight communications satellites at 540 km, 53° in two planes.
// AURORA: six research smallsats at 520 km, 30°. CORAL: two at 500 km, 65°.
// HALCYON: six Earth-observation smallsats at 600 km, 42°. LUMEN: two at 580 km, 75°.
export const SATELLITES: Satellite[] = [
  sat('MER-1', 'MERIDIAN-1', 'MERIDIAN', 'op-ostin', 'payload', 'nominal', { altitude_km: 560, inclination_deg: 10, raan_deg: 20, phase_deg: 0 }, ['fixture:0412'], 'Optical imaging'),
  sat('MER-2', 'MERIDIAN-2', 'MERIDIAN', 'op-ostin', 'payload', 'nominal', { altitude_km: 560, inclination_deg: 10, raan_deg: 20, phase_deg: 60 }, ['fixture:0935'], 'Optical imaging'),
  sat('MER-3', 'MERIDIAN-3', 'MERIDIAN', 'op-ostin', 'payload', 'manoeuvre planned', { altitude_km: 560, inclination_deg: 10, raan_deg: 20, phase_deg: 120 }, ['fixture:1187'], 'Optical imaging'),
  sat('MER-4', 'MERIDIAN-4', 'MERIDIAN', 'op-ostin', 'payload', 'nominal', { altitude_km: 560, inclination_deg: 10, raan_deg: 20, phase_deg: 180 }, ['fixture:0078'], 'Optical imaging'),
  sat('MER-5', 'MERIDIAN-5', 'MERIDIAN', 'op-ostin', 'payload', 'nominal', { altitude_km: 560, inclination_deg: 10, raan_deg: 20, phase_deg: 240 }, ['fixture:2044'], 'Optical imaging'),
  sat('MER-6', 'MERIDIAN-6', 'MERIDIAN', 'op-ostin', 'payload', 'safe mode', { altitude_km: 560, inclination_deg: 10, raan_deg: 20, phase_deg: 300 }, ['fixture:1504'], 'Optical imaging'),
  sat('KES-1', 'KESTREL-1', 'KESTREL', 'op-ostin', 'payload', 'nominal', { altitude_km: 520, inclination_deg: 97.6, raan_deg: 75, phase_deg: 30 }, ['fixture:0301'], 'Synthetic-aperture radar'),
  sat('KES-2', 'KESTREL-2', 'KESTREL', 'op-ostin', 'payload', 'nominal', { altitude_km: 520, inclination_deg: 97.6, raan_deg: 75, phase_deg: 210 }, [], 'Synthetic-aperture radar'),

  sat('LAT-A1', 'LATTICE-A1', 'LATTICE', 'op-horizon', 'payload', 'nominal', { altitude_km: 540, inclination_deg: 53, raan_deg: 140, phase_deg: 0 }, ['fixture:2210'], 'Ka-band relay'),
  sat('LAT-A2', 'LATTICE-A2', 'LATTICE', 'op-horizon', 'payload', 'nominal', { altitude_km: 540, inclination_deg: 53, raan_deg: 140, phase_deg: 90 }, ['fixture:0566'], 'Ka-band relay'),
  sat('LAT-A3', 'LATTICE-A3', 'LATTICE', 'op-horizon', 'payload', 'nominal', { altitude_km: 540, inclination_deg: 53, raan_deg: 140, phase_deg: 180 }, ['fixture:1653'], 'Ka-band relay'),
  sat('LAT-A4', 'LATTICE-A4', 'LATTICE', 'op-horizon', 'payload', 'decommissioning', { altitude_km: 540, inclination_deg: 53, raan_deg: 140, phase_deg: 270 }, ['fixture:0819'], 'Ka-band relay'),
  sat('LAT-B1', 'LATTICE-B1', 'LATTICE', 'op-horizon', 'payload', 'nominal', { altitude_km: 540, inclination_deg: 53, raan_deg: 230, phase_deg: 45 }, ['fixture:1920'], 'Ka-band relay'),
  sat('LAT-B2', 'LATTICE-B2', 'LATTICE', 'op-horizon', 'payload', 'nominal', { altitude_km: 540, inclination_deg: 53, raan_deg: 230, phase_deg: 135 }, ['fixture:0244'], 'Ka-band relay'),
  sat('LAT-B3', 'LATTICE-B3', 'LATTICE', 'op-horizon', 'payload', 'manoeuvre planned', { altitude_km: 540, inclination_deg: 53, raan_deg: 230, phase_deg: 225 }, ['fixture:0873'], 'Ka-band relay'),
  sat('LAT-B4', 'LATTICE-B4', 'LATTICE', 'op-horizon', 'payload', 'nominal', { altitude_km: 540, inclination_deg: 53, raan_deg: 230, phase_deg: 315 }, ['fixture:1371'], 'Ka-band relay'),

  sat('AUR-1', 'AURORA-1', 'AURORA', 'op-nus', 'payload', 'nominal', { altitude_km: 520, inclination_deg: 30, raan_deg: 60, phase_deg: 0 }, ['train:9524'], 'Hyperspectral imaging'),
  sat('AUR-2', 'AURORA-2', 'AURORA', 'op-nus', 'payload', 'nominal', { altitude_km: 520, inclination_deg: 30, raan_deg: 60, phase_deg: 60 }, ['train:5169'], 'Hyperspectral imaging'),
  sat('AUR-3', 'AURORA-3', 'AURORA', 'op-nus', 'payload', 'manoeuvre planned', { altitude_km: 520, inclination_deg: 30, raan_deg: 60, phase_deg: 120 }, ['train:2142'], 'Hyperspectral imaging'),
  sat('AUR-4', 'AURORA-4', 'AURORA', 'op-nus', 'payload', 'nominal', { altitude_km: 520, inclination_deg: 30, raan_deg: 60, phase_deg: 180 }, ['train:8591'], 'Hyperspectral imaging'),
  sat('AUR-5', 'AURORA-5', 'AURORA', 'op-nus', 'payload', 'nominal', { altitude_km: 520, inclination_deg: 30, raan_deg: 60, phase_deg: 240 }, ['train:12527'], 'Hyperspectral imaging'),
  sat('AUR-6', 'AURORA-6', 'AURORA', 'op-nus', 'payload', 'safe mode', { altitude_km: 520, inclination_deg: 30, raan_deg: 60, phase_deg: 300 }, [], 'Hyperspectral imaging'),
  sat('COR-1', 'CORAL-1', 'CORAL', 'op-nus', 'payload', 'nominal', { altitude_km: 500, inclination_deg: 65, raan_deg: 250, phase_deg: 40 }, ['train:4262'], 'Technology demonstration'),
  sat('COR-2', 'CORAL-2', 'CORAL', 'op-nus', 'payload', 'nominal', { altitude_km: 500, inclination_deg: 65, raan_deg: 250, phase_deg: 220 }, [], 'Technology demonstration'),

  sat('HAL-1', 'HALCYON-1', 'HALCYON', 'op-smu', 'payload', 'nominal', { altitude_km: 600, inclination_deg: 42, raan_deg: 330, phase_deg: 0 }, ['train:2563'], 'Earth observation'),
  sat('HAL-2', 'HALCYON-2', 'HALCYON', 'op-smu', 'payload', 'nominal', { altitude_km: 600, inclination_deg: 42, raan_deg: 330, phase_deg: 60 }, ['train:12992'], 'Earth observation'),
  sat('HAL-3', 'HALCYON-3', 'HALCYON', 'op-smu', 'payload', 'nominal', { altitude_km: 600, inclination_deg: 42, raan_deg: 330, phase_deg: 120 }, ['train:11320'], 'Earth observation'),
  sat('HAL-4', 'HALCYON-4', 'HALCYON', 'op-smu', 'payload', 'manoeuvre planned', { altitude_km: 600, inclination_deg: 42, raan_deg: 330, phase_deg: 180 }, ['train:11023'], 'Earth observation'),
  sat('HAL-5', 'HALCYON-5', 'HALCYON', 'op-smu', 'payload', 'nominal', { altitude_km: 600, inclination_deg: 42, raan_deg: 330, phase_deg: 240 }, ['train:3249'], 'Earth observation'),
  sat('HAL-6', 'HALCYON-6', 'HALCYON', 'op-smu', 'payload', 'nominal', { altitude_km: 600, inclination_deg: 42, raan_deg: 330, phase_deg: 300 }, [], 'Earth observation'),
  sat('LUM-1', 'LUMEN-1', 'LUMEN', 'op-smu', 'payload', 'nominal', { altitude_km: 580, inclination_deg: 75, raan_deg: 110, phase_deg: 90 }, ['train:6786'], 'Automatic identification system relay'),
  sat('LUM-2', 'LUMEN-2', 'LUMEN', 'op-smu', 'payload', 'decommissioning', { altitude_km: 580, inclination_deg: 75, raan_deg: 110, phase_deg: 270 }, ['train:7880'], 'Automatic identification system relay'),

  // Context objects: nobody in the demo operates these. They are the "other side" of the encounters.
  sat('OBJ-30412', 'Fragment 30412', null, null, 'debris', null, { altitude_km: 565, inclination_deg: 71, raan_deg: 310, phase_deg: 12 }, [], 'Fragmentation debris'),
  sat('OBJ-21187', 'Upper stage 21187', null, null, 'rocket body', null, { altitude_km: 580, inclination_deg: 82, raan_deg: 15, phase_deg: 200 }, [], 'Spent upper stage'),
  sat('OBJ-40935', 'Object 40935', null, null, 'payload', null, { altitude_km: 555, inclination_deg: 45, raan_deg: 95, phase_deg: 77 }, [], 'Inactive payload'),
  sat('OBJ-52210', 'Fragment 52210', null, null, 'debris', null, { altitude_km: 545, inclination_deg: 64, raan_deg: 250, phase_deg: 160 }, [], 'Fragmentation debris'),
  sat('OBJ-60078', 'Fragment 60078', null, null, 'debris', null, { altitude_km: 575, inclination_deg: 88, raan_deg: 185, phase_deg: 290 }, [], 'Fragmentation debris'),
  sat('OBJ-71371', 'Upper stage 71371', null, null, 'rocket body', null, { altitude_km: 530, inclination_deg: 35, raan_deg: 330, phase_deg: 40 }, [], 'Spent upper stage'),
  sat('OBJ-80873', 'Fragment 80873', null, null, 'debris', null, { altitude_km: 548, inclination_deg: 99, raan_deg: 120, phase_deg: 230 }, [], 'Fragmentation debris'),
  sat('OBJ-90657', 'Object 90657', null, null, 'payload', null, { altitude_km: 600, inclination_deg: 28.5, raan_deg: 60, phase_deg: 310 }, [], 'Inactive payload'),
  sat('OBJ-19524', 'Fragment 19524', null, null, 'debris', null, { altitude_km: 525, inclination_deg: 74, raan_deg: 20, phase_deg: 15 }, [], 'Fragmentation debris'),
  sat('OBJ-22142', 'Upper stage 22142', null, null, 'rocket body', null, { altitude_km: 515, inclination_deg: 51.6, raan_deg: 140, phase_deg: 130 }, [], 'Spent upper stage'),
  sat('OBJ-35169', 'Object 35169', null, null, 'payload', null, { altitude_km: 530, inclination_deg: 98, raan_deg: 200, phase_deg: 70 }, [], 'Inactive payload'),
  sat('OBJ-42563', 'Fragment 42563', null, null, 'debris', null, { altitude_km: 605, inclination_deg: 86, raan_deg: 280, phase_deg: 10 }, [], 'Fragmentation debris'),
  sat('OBJ-51320', 'Upper stage 51320', null, null, 'rocket body', null, { altitude_km: 595, inclination_deg: 63, raan_deg: 40, phase_deg: 135 }, [], 'Spent upper stage'),
  sat('OBJ-62992', 'Fragment 62992', null, null, 'debris', null, { altitude_km: 590, inclination_deg: 99, raan_deg: 170, phase_deg: 75 }, [], 'Fragmentation debris'),
  sat('OBJ-76786', 'Object 76786', null, null, 'payload', null, { altitude_km: 585, inclination_deg: 35, raan_deg: 300, phase_deg: 95 }, [], 'Inactive payload'),
]

export function regionOf(o: Satellite['orbit']): OrbitRegion {
  const i = o.inclination_deg
  if (i >= 96 && i <= 100) return 'sun-synchronous'
  if (i > 80) return 'polar'
  if (i > 30) return 'mid-inclination'
  return 'equatorial'
}

export const REGION_LABEL: Record<OrbitRegion, string> = {
  equatorial: 'Equatorial (< 30°)',
  'mid-inclination': 'Mid-inclination (30–80°)',
  polar: 'Polar (> 80°)',
  'sun-synchronous': 'Sun-synchronous (~98°)',
}

export function assetsOf(operatorId: string): Satellite[] {
  return SATELLITES.filter((s) => s.operator_id === operatorId)
}

export function satelliteForEncounter(encounterId: string): Satellite | undefined {
  return SATELLITES.find((s) => s.encounter_ids.includes(encounterId))
}

/** The tracked object on the other side of each encounter, where the demo defines one. */
const FIXTURE_CHASERS: Record<string, string> = {
  'fixture:0412': 'OBJ-30412',
  'fixture:1187': 'OBJ-21187',
  'fixture:0935': 'OBJ-40935',
  'fixture:2210': 'OBJ-52210',
  'fixture:0078': 'OBJ-60078',
  'fixture:1371': 'OBJ-71371',
  'fixture:0873': 'OBJ-80873',
  'fixture:1504': 'OBJ-90657',
  // Live-only pairings for AURORA, CORAL, HALCYON and LUMEN alerts.
  'train:9524': 'OBJ-19524',
  'train:2142': 'OBJ-22142',
  'train:5169': 'OBJ-35169',
  'train:2563': 'OBJ-42563',
  'train:11320': 'OBJ-51320',
  'train:12992': 'OBJ-62992',
  'train:6786': 'OBJ-76786',
}

/** Chaser objects keyed by the encounter IDs actually in use (fixture or live). */
export const CHASERS: Record<string, string> = Object.fromEntries(
  Object.entries(FIXTURE_CHASERS)
    .map(([id, obj]) => [liveId(id), obj] as const)
    .filter((e): e is readonly [string, string] => e[0] !== null),
)
