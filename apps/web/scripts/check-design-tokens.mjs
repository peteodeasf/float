/**
 * Design-token guard.
 *
 * Fails the build if a clinician/admin screen sets a raw hex colour instead of using a token. This
 * is what keeps the app on one look: once a colour has a token, a screen may not hand-set it again.
 *
 * Scope: the clinician/admin app screens (the ones on the shared foundation). White and black are
 * allowed. A short allowlist covers files that are a deliberate, separate visual system — the warm
 * session palette, the immersive dark capture screens, the education guide, and the source files
 * that DEFINE colours (tokens, the chart-colour module, the catalog).
 *
 * The teen and parent apps run on their own token family and are not scanned here.
 *
 * Run: `npm run check:tokens` (also runs in CI).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, basename } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

// Directories of screens that must stay on tokens.
const SCAN_DIRS = [
  'pages/practitioner', 'pages/admin', 'pages/practice', 'pages/setup', 'pages/auth',
  'components/practitioner',
]
// One extra single file (the rest of pages/monitor is a bespoke parent theme).
const SCAN_FILES = ['pages/monitor/MonitorLandingPage.tsx']

// Files exempt because they define colours or are a separate visual system on purpose.
const ALLOW = new Set([
  // Colour-defining or catalog files.
  'sessionKit.tsx', 'DesignCatalog.tsx',
  // The session-interview theme — a deliberate warm-teal palette shared across these screens and
  // sessionKit, distinct from the cool clinical look. Its own visual system; not on --float-* yet.
  'SessionPage.tsx', 'ArrowPage.tsx', 'FlatLadder.tsx', 'SessionSetupSheet.tsx',
  'BehaviorPanel.tsx', 'ParentPlanPanel.tsx',
  'RecordSessionPage.tsx', 'JustSayIt.tsx',
  'ChildRatingSheet.tsx', 'ParentConversationSheet.tsx', 'ParentExperimentSheet.tsx',
  // The education guide has its own guide style.
  'EducationIndexPage.tsx', 'EducationModulePage.tsx',
])
const isAllowed = (file) =>
  ALLOW.has(basename(file)) || /\.test\.tsx?$/.test(file) || /(^|\/)__/.test(file)

// A colour hex that is not white or black.
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
const OK = new Set(['#fff', '#ffffff', '#000', '#000000'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const files = [
  ...SCAN_DIRS.flatMap(d => walk(join(root, d))),
  ...SCAN_FILES.map(f => join(root, f)),
].filter(f => !isAllowed(f))

const violations = []
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(HEX)) {
      if (!OK.has(m[0].toLowerCase())) {
        violations.push(`${relative(root, file)}:${i + 1}  ${m[0]}  ${line.trim().slice(0, 80)}`)
      }
    }
  })
}

if (violations.length) {
  console.error(`\nDesign-token guard: ${violations.length} hand-set colour(s) found on clinician/admin screens.`)
  console.error('Use a token from styles/tokens.css instead of a raw hex.\n')
  for (const v of violations) console.error('  ' + v)
  console.error('')
  process.exit(1)
}
console.log('Design-token guard: clean — no hand-set colours on the scanned screens.')
