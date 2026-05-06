export interface Department {
  id: string
  name: string
  displayName: string
  envVar: string
  defaultNumber: string
  description: string
  keywords: string[]
}

export const DEPARTMENTS: Department[] = [
  {
    id: 'bbmp',
    name: 'BBMP',
    displayName: 'BBMP (Roads & Sanitation)',
    envVar: 'DEPT_BBMP',
    defaultNumber: '',
    description: 'Roads, footpaths, drainage, garbage collection, street lights, parks',
    keywords: ['road', 'pothole', 'garbage', 'footpath', 'drainage', 'gutter', 'sewage', 'street light', 'stray dog', 'park', 'bbmp', 'dumping', 'encroachment', 'footpath'],
  },
  {
    id: 'police',
    name: 'Police',
    displayName: 'Police Department',
    envVar: 'DEPT_POLICE',
    defaultNumber: '100',
    description: 'Crime, theft, accident, traffic, emergency, law and order',
    keywords: ['crime', 'theft', 'police', 'accident', 'emergency', 'robbery', 'assault', 'murder', 'missing person', 'traffic', 'stalking', 'harassment', 'rowdy'],
  },
  {
    id: 'revenue',
    name: 'Revenue',
    displayName: 'Revenue Department',
    envVar: 'DEPT_REVENUE',
    defaultNumber: '',
    description: 'Land records, property registration, RTC, certificates',
    keywords: ['land', 'property', 'rtc', 'khata', 'caste certificate', 'income certificate', 'revenue', 'survey', 'mutation', 'encumbrance', 'registration', 'stamp duty'],
  },
  {
    id: 'electricity',
    name: 'Electricity',
    displayName: 'BESCOM / Electricity Board',
    envVar: 'DEPT_ELECTRICITY',
    defaultNumber: '1912',
    description: 'Power outage, meter issues, billing disputes, transformer faults',
    keywords: ['electricity', 'power', 'bescom', 'outage', 'no power', 'meter', 'billing', 'transformer', 'shock', 'wire', 'current', 'light gone', 'voltage'],
  },
  {
    id: 'water',
    name: 'Water',
    displayName: 'BWSSB (Water Supply)',
    envVar: 'DEPT_WATER',
    defaultNumber: '1916',
    description: 'Water supply failure, borewell, pipeline leak, water quality',
    keywords: ['water', 'bwssb', 'supply', 'borewell', 'pipeline', 'tap', 'drinking water', 'leakage', 'no water', 'water problem', 'dirty water'],
  },
  {
    id: 'health',
    name: 'Health',
    displayName: 'Health Department / Ambulance',
    envVar: 'DEPT_HEALTH',
    defaultNumber: '104',
    description: 'Hospital, ambulance, doctor, public health emergency',
    keywords: ['hospital', 'ambulance', 'doctor', 'health', 'medicine', 'medical', 'emergency', 'blood', 'injury', 'clinic', 'vaccine', 'disease', 'patient'],
  },
  {
    id: 'fire',
    name: 'Fire',
    displayName: 'Fire & Emergency Services',
    envVar: 'DEPT_FIRE',
    defaultNumber: '101',
    description: 'Fire emergency, rescue operations, gas leaks',
    keywords: ['fire', 'burning', 'rescue', 'gas leak', 'explosion', 'smoke', 'fire brigade', 'flame', 'lpg'],
  },
  {
    id: 'labour',
    name: 'Labour',
    displayName: 'Labour Department',
    envVar: 'DEPT_LABOUR',
    defaultNumber: '',
    description: 'Wage disputes, workplace issues, ESI, PF, labour law violations',
    keywords: ['labour', 'wages', 'salary', 'workplace', 'employment', 'factory', 'worker', 'dismissal', 'esi', 'pf', 'provident fund', 'contractor', 'overtime'],
  },
  {
    id: 'transport',
    name: 'Transport',
    displayName: 'Transport / RTO / KSRTC',
    envVar: 'DEPT_TRANSPORT',
    defaultNumber: '',
    description: 'KSRTC buses, RTO registration, driving license, traffic fines',
    keywords: ['bus', 'ksrtc', 'rto', 'driving license', 'vehicle', 'transport', 'traffic fine', 'rc book', 'auto', 'taxi', 'permit', 'fitness certificate'],
  },
  {
    id: 'other',
    name: 'Other',
    displayName: 'Other / General Services',
    envVar: 'DEPT_OTHER',
    defaultNumber: '',
    description: 'General citizen services not covered by specific departments',
    keywords: [],
  },
]

export function getDepartmentNumber(name: string): string | null {
  const normalised = name.trim()
  const dept = DEPARTMENTS.find(
    d => d.name.toLowerCase() === normalised.toLowerCase() ||
         d.id === normalised.toLowerCase()
  )
  if (!dept) return null
  return process.env[dept.envVar] || dept.defaultNumber || null
}

export function getDepartmentByKeyword(text: string): Department {
  const lower = text.toLowerCase()
  let best = DEPARTMENTS[DEPARTMENTS.length - 1] // 'Other' as fallback
  let bestScore = 0

  for (const dept of DEPARTMENTS) {
    const score = dept.keywords.filter(k => lower.includes(k)).length
    if (score > bestScore) {
      bestScore = score
      best = dept
    }
  }
  return best
}
