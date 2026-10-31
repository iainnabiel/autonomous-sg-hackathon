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
  },
  {
    id: 'op-horizon',
    name: 'Daniel Okafor',
    short_name: 'Daniel',
    initials: 'DO',
    organisation: 'Horizon Orbital Services',
    title: 'Constellation Operations Lead',
    handle: 'd.okafor',
    constellations: ['LATTICE'],
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
  return { id, name, constellation, operator_id, category, status, orbit, encounter_ids, role }
}

// MERIDIAN: six near-equatorial imaging satellites at 560 km, 10°.
// KESTREL: two sun-synchronous radar satellites at 520 km, 97.6°.
// LATTICE: eight communications satellites at 540 km, 53° in two planes.
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

  // Context objects: nobody in the demo operates these. They are the "other side" of the encounters.
  sat('OBJ-30412', 'Fragment 30412', null, null, 'debris', null, { altitude_km: 565, inclination_deg: 71, raan_deg: 310, phase_deg: 12 }, [], 'Fragmentation debris'),
  sat('OBJ-21187', 'Upper stage 21187', null, null, 'rocket body', null, { altitude_km: 580, inclination_deg: 82, raan_deg: 15, phase_deg: 200 }, [], 'Spent upper stage'),
  sat('OBJ-40935', 'Object 40935', null, null, 'payload', null, { altitude_km: 555, inclination_deg: 45, raan_deg: 95, phase_deg: 77 }, [], 'Inactive payload'),
  sat('OBJ-52210', 'Fragment 52210', null, null, 'debris', null, { altitude_km: 545, inclination_deg: 64, raan_deg: 250, phase_deg: 160 }, [], 'Fragmentation debris'),
  sat('OBJ-60078', 'Fragment 60078', null, null, 'debris', null, { altitude_km: 575, inclination_deg: 88, raan_deg: 185, phase_deg: 290 }, [], 'Fragmentation debris'),
  sat('OBJ-71371', 'Upper stage 71371', null, null, 'rocket body', null, { altitude_km: 530, inclination_deg: 35, raan_deg: 330, phase_deg: 40 }, [], 'Spent upper stage'),
  sat('OBJ-80873', 'Fragment 80873', null, null, 'debris', null, { altitude_km: 548, inclination_deg: 99, raan_deg: 120, phase_deg: 230 }, [], 'Fragmentation debris'),
  sat('OBJ-90657', 'Object 90657', null, null, 'payload', null, { altitude_km: 600, inclination_deg: 28.5, raan_deg: 60, phase_deg: 310 }, [], 'Inactive payload'),
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

/** The tracked object on the other side of each fixture encounter, where the demo defines one. */
export const CHASERS: Record<string, string> = {
  'fixture:0412': 'OBJ-30412',
  'fixture:1187': 'OBJ-21187',
  'fixture:0935': 'OBJ-40935',
  'fixture:2210': 'OBJ-52210',
  'fixture:0078': 'OBJ-60078',
  'fixture:1371': 'OBJ-71371',
  'fixture:0873': 'OBJ-80873',
  'fixture:1504': 'OBJ-90657',
}
