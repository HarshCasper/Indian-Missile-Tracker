import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import yaml from 'js-yaml'

const ROOT = join(import.meta.dirname, '..')
const DATA_DIR = join(ROOT, 'data')
const CACHE_FILE = join(ROOT, '.cache', 'link-check.json')
const REPORT_FILE = join(ROOT, '.cache', 'link-check-report.json')
const DEFAULT_CONCURRENCY = 16
const DEFAULT_TIMEOUT_MS = 15_000
const OK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1_000
const OTHER_CACHE_TTL_MS = 60 * 60 * 1_000
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const BLOCKED_STATUS_CODES = new Set([401, 403, 405, 406, 407, 418, 423, 426, 429, 451])
const DEAD_STATUS_CODES = new Set([400, 404, 410])
const DEAD_NETWORK_CODES = new Set(['ENOTFOUND', 'EAI_NONAME'])

type ResultKind = 'ok' | 'dead' | 'blocked' | 'transient'

interface LinkReference {
  file: string
  path: string
}

interface LinkResult {
  url: string
  kind: ResultKind
  status?: number
  finalUrl?: string
  detail?: string
  references: LinkReference[]
  cached: boolean
}

interface CachedResult {
  checkedAt: string
  kind: ResultKind
  status?: number
  finalUrl?: string
  detail?: string
}

interface CacheFile {
  version: 1
  results: Record<string, CachedResult>
}

function readNumberArgument(name: string, fallback: number): number {
  const prefix = `--${name}=`
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  if (!raw) return fallback

  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`)
  }
  return value
}

function findYamlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findYamlFiles(path)
    return entry.isFile() && entry.name.endsWith('.yaml') ? [path] : []
  })
}

function collectUrls(
  value: unknown,
  file: string,
  path: string,
  links: Map<string, LinkReference[]>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUrls(item, file, `${path}[${index}]`, links))
    return
  }

  if (!value || typeof value !== 'object') return

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (key === 'url' && typeof child === 'string' && /^https?:\/\//i.test(child)) {
      const references = links.get(child) ?? []
      references.push({ file, path: childPath })
      links.set(child, references)
    }
    collectUrls(child, file, childPath, links)
  }
}

function loadLinks(): Map<string, LinkReference[]> {
  const links = new Map<string, LinkReference[]>()
  for (const absolutePath of findYamlFiles(DATA_DIR)) {
    const file = relative(ROOT, absolutePath)
    const document = yaml.load(readFileSync(absolutePath, 'utf8'))
    collectUrls(document, file, '', links)
  }
  return links
}

function loadCache(): CacheFile {
  if (!existsSync(CACHE_FILE)) return { version: 1, results: {} }
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as CacheFile
    return parsed.version === 1 && parsed.results ? parsed : { version: 1, results: {} }
  } catch {
    return { version: 1, results: {} }
  }
}

function readCachedResult(url: string, cached: CachedResult | undefined): LinkResult | undefined {
  if (!cached) return undefined
  const checkedAt = Date.parse(cached.checkedAt)
  const ttl = cached.kind === 'ok' ? OK_CACHE_TTL_MS : OTHER_CACHE_TTL_MS
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > ttl) return undefined

  return { url, ...cached, references: [], cached: true }
}

function classifyResponse(url: string, response: Response): Omit<LinkResult, 'references' | 'cached'> {
  const base = {
    url,
    status: response.status,
    finalUrl: response.url === url ? undefined : response.url,
  }

  if (response.ok || (response.status >= 300 && response.status < 400)) {
    return { ...base, kind: 'ok' }
  }
  if (DEAD_STATUS_CODES.has(response.status)) return { ...base, kind: 'dead' }
  if (BLOCKED_STATUS_CODES.has(response.status)) return { ...base, kind: 'blocked' }
  return { ...base, kind: 'transient' }
}

function networkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const cause = 'cause' in error ? error.cause : undefined
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined
  return typeof cause.code === 'string' ? cause.code : undefined
}

async function checkOnce(url: string, timeoutMs: number): Promise<Omit<LinkResult, 'references' | 'cached'>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
        connection: 'close',
        'user-agent': 'Indian-Missile-Tracker-Link-Checker/1.0 (+https://github.com/harshcasper/Indian-Missile-Tracker)',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    const result = classifyResponse(url, response)
    await response.body?.cancel().catch(() => undefined)
    return result
  } catch (error) {
    const code = networkErrorCode(error)
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      url,
      kind: code && DEAD_NETWORK_CODES.has(code) ? 'dead' : 'transient',
      detail: aborted ? `timed out after ${timeoutMs}ms` : code ?? (error instanceof Error ? error.message : String(error)),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function checkLink(url: string, timeoutMs: number): Promise<Omit<LinkResult, 'references' | 'cached'>> {
  let result = await checkOnce(url, timeoutMs)
  if (!result.status || RETRYABLE_STATUS_CODES.has(result.status)) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    result = await checkOnce(url, timeoutMs)
  }
  return result
}

function interleaveByHost(urls: string[]): string[] {
  const groups = new Map<string, string[]>()
  for (const url of urls) {
    const host = new URL(url).hostname
    groups.set(host, [...(groups.get(host) ?? []), url])
  }

  const queue: string[] = []
  while ([...groups.values()].some((group) => group.length > 0)) {
    for (const group of groups.values()) {
      const url = group.shift()
      if (url) queue.push(url)
    }
  }
  return queue
}

async function runQueue<T>(items: string[], concurrency: number, task: (item: string) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await task(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function formatResult(result: LinkResult): string {
  const state = result.status ? `HTTP ${result.status}` : result.detail ?? result.kind
  const references = result.references.map(({ file, path }) => `${file}:${path}`).join(', ')
  return `  ${state} ${result.url}\n    ${references}`
}

async function main(): Promise<void> {
  const noCache = process.argv.includes('--no-cache')
  const concurrency = readNumberArgument('concurrency', DEFAULT_CONCURRENCY)
  const timeoutMs = readNumberArgument('timeout', DEFAULT_TIMEOUT_MS)
  const links = loadLinks()
  const cache = loadCache()
  const immediateResults: LinkResult[] = []
  const urlsToCheck: string[] = []

  for (const [url, references] of links) {
    const cached = noCache ? undefined : readCachedResult(url, cache.results[url])
    if (cached) immediateResults.push({ ...cached, references })
    else urlsToCheck.push(url)
  }

  console.log(`Checking ${links.size} unique citation links (${urlsToCheck.length} live requests, ${immediateResults.length} cached)...`)

  let completed = 0
  const checked = await runQueue(interleaveByHost(urlsToCheck), concurrency, async (url) => {
    const result = await checkLink(url, timeoutMs)
    completed += 1
    if (completed % 50 === 0 || completed === urlsToCheck.length) {
      console.log(`  Checked ${completed}/${urlsToCheck.length}`)
    }
    return { ...result, references: links.get(url) ?? [], cached: false }
  })
  const results = [...immediateResults, ...checked]

  for (const result of checked) {
    cache.results[result.url] = {
      checkedAt: new Date().toISOString(),
      kind: result.kind,
      status: result.status,
      finalUrl: result.finalUrl,
      detail: result.detail,
    }
  }
  for (const url of Object.keys(cache.results)) {
    if (!links.has(url)) delete cache.results[url]
  }

  mkdirSync(dirname(CACHE_FILE), { recursive: true })
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`)

  const byKind = (kind: ResultKind) => results.filter((result) => result.kind === kind)
  const dead = byKind('dead')
  const blocked = byKind('blocked')
  const transient = byKind('transient')
  const report = {
    checkedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      ok: byKind('ok').length,
      dead: dead.length,
      blocked: blocked.length,
      transient: transient.length,
      cached: immediateResults.length,
    },
    results: results.filter((result) => result.kind !== 'ok'),
  }
  writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`)

  console.log(`\nLink check: ${report.summary.ok} reachable, ${dead.length} dead, ${blocked.length} blocked, ${transient.length} transient.`)
  if (dead.length > 0) {
    console.error('\nDead links:')
    dead.forEach((result) => console.error(formatResult(result)))
  }
  if (blocked.length > 0 || transient.length > 0) {
    console.warn(`\nNon-failing blocked/transient details: ${relative(ROOT, REPORT_FILE)}`)
  }
  if (dead.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
