// Layer system for The Grid — colors, labels, grouping.
export const LAYERS = {
  datacenter: {
    label: 'Data Centers',
    short: 'compute',
    color: '#f5a83c',
    desc: 'Hyperscale & AI compute build-out, current and planned',
  },
  surveillance: {
    label: 'Surveillance Infrastructure',
    short: 'watch',
    color: '#ef5350',
    desc: 'ALPR networks, fusion centers, biometric checkpoints, border towers',
  },
  detention: {
    label: 'ICE Detention',
    short: 'cage',
    color: '#f06292',
    desc: 'Detention centers, processing facilities, and enforcement camps',
  },
  corporate: {
    label: 'Corporate Expansion',
    short: 'capital',
    color: '#b388ff',
    desc: 'Contracts, acquisitions, and footprint growth of control-grid firms',
  },
  federal: {
    label: 'Federal Actions',
    short: 'state',
    color: '#64b5f6',
    desc: 'Executive orders, programs, and contracts from Washington',
  },
  legislation: {
    label: 'Restrictive Legislation',
    short: 'law',
    color: '#26c6a2',
    desc: 'State & local laws restraining surveillance and data center growth',
  },
  resistance: {
    label: 'Civic Resistance',
    short: 'people',
    color: '#7ddf80',
    desc: 'Protests, campaigns, lawsuits, and community victories',
  },
};

export const LAYER_GROUPS = [
  { name: 'Infrastructure', layers: ['datacenter', 'surveillance', 'detention'] },
  { name: 'Power', layers: ['corporate', 'federal'] },
  { name: 'Counterweight', layers: ['legislation', 'resistance'] },
];

// Statuses that render with a pulsing "in motion" ring
export const PULSING_STATUSES = new Set([
  'planned',
  'proposed',
  'under-construction',
  'expanding',
  'ongoing',
]);

export const LINK_STYLES = {
  opposes:    { color: '#7ddf80', dash: '5 4',  label: 'opposes' },
  restricts:  { color: '#26c6a2', dash: '5 4',  label: 'restricts' },
  enables:    { color: '#64b5f6', dash: null,   label: 'enables' },
  operates:   { color: '#b388ff', dash: null,   label: 'operates / builds' },
  supplies:   { color: '#b388ff', dash: '2 4',  label: 'supplies' },
  targets:    { color: '#ef5350', dash: '2 4',  label: 'targets' },
};

export const VIEWS = {
  us:   { label: 'United States', lon: null, lat: null, k: 1 },
  nova: { label: 'Data Center Alley', lon: -77.49, lat: 39.0, k: 22 },
  dc:   { label: 'Washington, DC', lon: -77.02, lat: 38.895, k: 48 },
};
