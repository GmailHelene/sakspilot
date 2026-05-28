/**
 * Default-snarveier per bransje. Brukes ved onboarding for å fylle launcher
 * med relevante apper. Brukeren kan endre etterpå (lagres i localStorage).
 */

export type Profession =
  | 'it_konsulent'
  | 'konsulent_annet'
  | 'ansvarlig_soker'
  | 'advokat'
  | 'regnskap'
  | 'designer'
  | 'arkitekt'
  | 'lege_psykolog'
  | 'annet';

export interface LauncherPreset {
  id: string;
  label: string;
  url: string;
  color: string;
  emoji: string;
  brandSlug?: string | null;
}

const APPS: Record<string, LauncherPreset> = {
  // Kommunikasjon (alle bransjer)
  outlook:   { id: 'outlook', label: 'Outlook', url: 'https://outlook.office.com/mail/', color: '#0078D4', emoji: '📧', brandSlug: 'microsoftoutlook' },
  gmail:     { id: 'gmail', label: 'Gmail', url: 'https://mail.google.com', color: '#EA4335', emoji: '✉️', brandSlug: 'gmail' },
  teams:     { id: 'teams', label: 'Teams', url: 'https://teams.microsoft.com', color: '#6264A7', emoji: '💬', brandSlug: 'microsoftteams' },
  slack:     { id: 'slack', label: 'Slack', url: 'https://app.slack.com', color: '#4A154B', emoji: '💼', brandSlug: 'slack' },
  // Kalender
  gcal:      { id: 'gcal', label: 'Google Kalender', url: 'https://calendar.google.com', color: '#4285F4', emoji: '📅', brandSlug: 'googlecalendar' },
  // Regnskap (norsk)
  tripletex: { id: 'tripletex', label: 'Tripletex', url: 'https://tripletex.no', color: '#1B73B8', emoji: '💼', brandSlug: null },
  fiken:     { id: 'fiken', label: 'Fiken', url: 'https://fiken.no', color: '#FF6A3D', emoji: '💰', brandSlug: null },
  // Lagring
  drive:     { id: 'drive', label: 'Google Drive', url: 'https://drive.google.com', color: '#1FA463', emoji: '📁', brandSlug: 'googledrive' },
  dropbox:   { id: 'dropbox', label: 'Dropbox', url: 'https://www.dropbox.com', color: '#0061FE', emoji: '📦', brandSlug: 'dropbox' },
  onedrive:  { id: 'onedrive', label: 'OneDrive', url: 'https://onedrive.live.com', color: '#0078D4', emoji: '☁️', brandSlug: 'microsoftonedrive' },
  // AI
  chatgpt:   { id: 'chatgpt', label: 'ChatGPT', url: 'https://chat.openai.com', color: '#10A37F', emoji: '🤖', brandSlug: 'openai' },
  claude:    { id: 'claude', label: 'Claude', url: 'https://claude.ai', color: '#D97757', emoji: '✨', brandSlug: 'anthropic' },
  copilot:   { id: 'copilot', label: 'GitHub Copilot', url: 'https://github.com/copilot', color: '#181717', emoji: '🤖', brandSlug: 'githubcopilot' },
  // Utvikling
  github:    { id: 'github', label: 'GitHub', url: 'https://github.com', color: '#181717', emoji: '🐙', brandSlug: 'github' },
  vercel:    { id: 'vercel', label: 'Vercel', url: 'https://vercel.com/dashboard', color: '#000000', emoji: '▲', brandSlug: 'vercel' },
  render:    { id: 'render', label: 'Render', url: 'https://dashboard.render.com', color: '#46E3B7', emoji: '🚀', brandSlug: 'render' },
  railway:   { id: 'railway', label: 'Railway', url: 'https://railway.app/dashboard', color: '#0B0D0E', emoji: '🚂', brandSlug: 'railway' },
  neon:      { id: 'neon', label: 'Neon', url: 'https://console.neon.tech', color: '#00E599', emoji: '🐘', brandSlug: 'neon' },
  clerk:     { id: 'clerk', label: 'Clerk', url: 'https://dashboard.clerk.com', color: '#6C47FF', emoji: '🔐', brandSlug: null },
  cloudinary:{ id: 'cloudinary', label: 'Cloudinary', url: 'https://cloudinary.com/console', color: '#3448C5', emoji: '🖼️', brandSlug: 'cloudinary' },
  // Domene + hosting
  domeneshop:{ id: 'domeneshop', label: 'Domeneshop', url: 'https://domene.shop', color: '#003F7F', emoji: '🌐', brandSlug: null },
  siteground:{ id: 'siteground', label: 'SiteGround', url: 'https://my.siteground.com', color: '#5B2D8E', emoji: '🏠', brandSlug: 'siteground' },
  cyberduck: { id: 'cyberduck', label: 'Cyberduck', url: 'https://cyberduck.io', color: '#F8C72D', emoji: '🦆', brandSlug: null },
  // Marketing + SEO
  gsc:       { id: 'gsc', label: 'Search Console', url: 'https://search.google.com/search-console', color: '#4285F4', emoji: '🔍', brandSlug: 'googlesearchconsole' },
  gads:      { id: 'gads', label: 'Google Ads', url: 'https://ads.google.com', color: '#4285F4', emoji: '💰', brandSlug: 'googleads' },
  fbbus:     { id: 'fbbus', label: 'Meta Business', url: 'https://business.facebook.com', color: '#1877F2', emoji: '📊', brandSlug: 'facebook' },
  // Bygg / ansvarlig søker
  holte:     { id: 'holte', label: 'Holte', url: 'https://smart.holte.no', color: '#005AAB', emoji: '🏢', brandSlug: null },
  ebyggesok: { id: 'ebyggesok', label: 'eByggeSøk', url: 'https://www.ebyggesok.no', color: '#003366', emoji: '🏗️', brandSlug: null },
  kartverket:{ id: 'kartverket', label: 'Kartverket', url: 'https://www.kartverket.no', color: '#006699', emoji: '🗺️', brandSlug: null },
  // Advokat / jus
  lovdata:   { id: 'lovdata', label: 'Lovdata', url: 'https://lovdata.no', color: '#003366', emoji: '⚖️', brandSlug: null },
  rettsdata: { id: 'rettsdata', label: 'Rettsdata', url: 'https://min.rettsdata.no', color: '#1B3A6B', emoji: '📚', brandSlug: null },
  // Designer
  figma:     { id: 'figma', label: 'Figma', url: 'https://www.figma.com', color: '#F24E1E', emoji: '🎨', brandSlug: 'figma' },
  canva:     { id: 'canva', label: 'Canva', url: 'https://www.canva.com', color: '#00C4CC', emoji: '🖌️', brandSlug: 'canva' },
  adobe:     { id: 'adobe', label: 'Adobe CC', url: 'https://creativecloud.adobe.com', color: '#FA0F00', emoji: '🎭', brandSlug: 'adobecreativecloud' },
  // Lege / psykolog (begrenset utvalg av "bransje-spesifikk", de fleste bruker generelle apper)
  helsedir:  { id: 'helsedir', label: 'Helsedirektoratet', url: 'https://www.helsedirektoratet.no', color: '#0D4068', emoji: '🏥', brandSlug: null },
};

export const PROFESSION_LABELS: Record<Profession, { label: string; tagline: string; emoji: string }> = {
  it_konsulent: { label: 'IT-konsulent / utvikler', tagline: 'Kode, deploy, kunder', emoji: '💻' },
  konsulent_annet: { label: 'Konsulent (annet)', tagline: 'Strategi, prosjekter, workshops', emoji: '💡' },
  ansvarlig_soker: { label: 'Ansvarlig søker / byggesak', tagline: 'Byggesaker, frister, kommune', emoji: '🏗️' },
  advokat: { label: 'Advokat / jurist', tagline: 'Kontrakter, saker, klienter', emoji: '⚖️' },
  regnskap: { label: 'Regnskap / revisor', tagline: 'Skatt, månedsavslutning, faktura', emoji: '🧮' },
  designer: { label: 'Designer / kreativ', tagline: 'Logo, web, branding', emoji: '🎨' },
  arkitekt: { label: 'Arkitekt', tagline: 'Tegninger, prosjekter, byggherrer', emoji: '📐' },
  lege_psykolog: { label: 'Lege / psykolog', tagline: 'Pasienter, journaler, oppfølging', emoji: '🩺' },
  annet: { label: 'Annet', tagline: 'Jeg gjør litt av hvert', emoji: '🌟' },
};

const PRESETS: Record<Profession, LauncherPreset[]> = {
  it_konsulent: [
    APPS.gmail, APPS.outlook, APPS.gcal,
    APPS.claude, APPS.chatgpt, APPS.copilot,
    APPS.github, APPS.vercel, APPS.render, APPS.railway, APPS.neon, APPS.clerk, APPS.cloudinary,
    APPS.domeneshop, APPS.siteground, APPS.cyberduck,
    APPS.gsc, APPS.gads, APPS.fbbus,
    APPS.fiken,
  ],
  konsulent_annet: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.teams, APPS.slack,
    APPS.drive, APPS.dropbox,
    APPS.chatgpt, APPS.claude,
    APPS.tripletex, APPS.fiken,
  ],
  ansvarlig_soker: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.holte, APPS.ebyggesok, APPS.kartverket,
    APPS.drive, APPS.dropbox,
    APPS.tripletex, APPS.fiken,
    APPS.claude,
  ],
  advokat: [
    APPS.outlook, APPS.gcal,
    APPS.lovdata, APPS.rettsdata,
    APPS.teams, APPS.drive, APPS.onedrive,
    APPS.tripletex, APPS.fiken,
    APPS.claude,
  ],
  regnskap: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.tripletex, APPS.fiken,
    APPS.drive, APPS.dropbox,
    APPS.teams, APPS.claude,
  ],
  designer: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.figma, APPS.adobe, APPS.canva,
    APPS.drive, APPS.dropbox, APPS.cloudinary,
    APPS.tripletex, APPS.fiken,
    APPS.claude,
  ],
  arkitekt: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.holte, APPS.kartverket,
    APPS.figma, APPS.adobe,
    APPS.drive, APPS.dropbox,
    APPS.tripletex, APPS.fiken,
    APPS.claude,
  ],
  lege_psykolog: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.helsedir,
    APPS.teams,
    APPS.drive, APPS.onedrive,
    APPS.tripletex, APPS.fiken,
  ],
  annet: [
    APPS.outlook, APPS.gmail, APPS.gcal,
    APPS.drive, APPS.dropbox,
    APPS.chatgpt, APPS.claude,
    APPS.tripletex, APPS.fiken,
    APPS.slack,
  ],
};

export function getDefaultLaunchersFor(profession: Profession): LauncherPreset[] {
  return PRESETS[profession] || PRESETS.annet;
}
