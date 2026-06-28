import { useState, useCallback, useRef, useEffect } from 'react'

const BLUE       = '#3B82F6'   // buttons
const BLUE_HOV   = '#2563EB'   // button hover
const GREY_ACC   = '#4B5563'   // focus rings, spinner, top bar
const GREY_TOP   = '#1F2937'   // top bar gradient start
const BORDER     = '#2A2A35'
const MUTED      = '#6B7280'
const BG         = '#0F0F12'
const PANEL      = '#16161B'
const PANEL_HEAD = '#1C1C24'
const TEXT       = '#E2DCF0'

// corsproxy.io returns the raw response body directly — faster than allorigins.win
const PROXY = url => `https://corsproxy.io/?${encodeURIComponent(url)}`

const SOURCE_COLORS = {
  'AZLyrics':   { bg: '#2A1608', text: '#FB923C', border: '#3D1E09' },
  'Genius':     { bg: '#252006', text: '#FACC15', border: '#38300A' },
  'lyrics.ovh': { bg: '#0C1628', text: '#60A5FA', border: '#112040' },
}

// ── Source: lyrics.ovh (direct API, no proxy — fastest) ────────────────────

async function searchLyricsOvh(query) {
  const res = await fetch(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error()
  const data = await res.json()
  return (data.data || []).slice(0, 5).map(s => ({
    title: s.title,
    artist: s.artist.name,
    source: 'lyrics.ovh',
    fetchLyrics: () => fetchLyricsOvhSong(s.artist.name, s.title),
  }))
}

async function fetchLyricsOvhSong(artist, title) {
  const res = await fetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
  )
  if (!res.ok) throw new Error()
  const data = await res.json()
  if (!data.lyrics) throw new Error()
  return data.lyrics.trim()
}

// ── Source: AZLyrics ───────────────────────────────────────────────────────

async function searchAZLyrics(query) {
  const url = `https://search.azlyrics.com/search.php?q=${encodeURIComponent(query)}&w=songs`
  const res = await fetch(PROXY(url))
  if (!res.ok) throw new Error()
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const results = []
  doc.querySelectorAll('td.visitedlyr, td.notvisitedlyr').forEach(cell => {
    const a = cell.querySelector('a')
    const b = cell.querySelector('b')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (!href.includes('azlyrics.com/lyrics/')) return
    const fullUrl = href.startsWith('//') ? 'https:' + href : href
    results.push({
      title: a.textContent.trim(),
      artist: b ? b.textContent.trim() : '',
      source: 'AZLyrics',
      fetchLyrics: () => fetchAZLyricsPage(fullUrl),
    })
  })
  return results.slice(0, 5)
}

async function fetchAZLyricsPage(lyricsUrl) {
  const res = await fetch(PROXY(lyricsUrl))
  if (!res.ok) throw new Error()
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes('Usage of azlyrics.com content')) {
      let el = walker.currentNode.nextSibling
      while (el && el.nodeType !== 1) el = el.nextSibling
      if (el) return el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
    }
  }
  throw new Error('Lyrics not found')
}

// ── Source: Genius ─────────────────────────────────────────────────────────

async function searchGenius(query) {
  const url = `https://genius.com/api/search/song?q=${encodeURIComponent(query)}&per_page=5`
  const res = await fetch(PROXY(url))
  if (!res.ok) throw new Error()
  const data = await res.json()
  const hits = data?.response?.sections?.[0]?.hits || []
  return hits.slice(0, 5).map(h => ({
    title: h.result.title,
    artist: h.result.primary_artist.name,
    source: 'Genius',
    fetchLyrics: () => fetchGeniusPage(h.result.url),
  }))
}

async function fetchGeniusPage(lyricsUrl) {
  const res = await fetch(PROXY(lyricsUrl))
  if (!res.ok) throw new Error()
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const containers = doc.querySelectorAll('[data-lyrics-container="true"]')
  if (!containers.length) throw new Error('Lyrics not found')
  let lyrics = ''
  containers.forEach(c => {
    lyrics += c.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]*>/gi, '').replace(/<\/a>/gi, '')
      .replace(/<[^>]+>/g, '') + '\n'
  })
  return lyrics.trim()
}

// ── Formatting ─────────────────────────────────────────────────────────────

function formatLyrics(raw) {
  return raw
    .split('\n')
    .map(line => line.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ''))
    .map(line => line.replace(/[.,;:!?''\-—–]/g, ''))
    .map(line => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stats(text) {
  const t = text.trim()
  if (!t) return '0 lines · 0 chars'
  const lines = t.split('\n').length
  return `${lines} ${lines === 1 ? 'line' : 'lines'} · ${t.length} chars`
}

// ── Icons ──────────────────────────────────────────────────────────────────

function SearchIcon({ color = MUTED }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="6.5" cy="6.5" r="4.5" stroke={color} strokeWidth="1.5" />
      <path d="M10 10L13.5 13.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
      style={{ display: 'inline', marginRight: 5, verticalAlign: '-1px' }}>
      <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5V9.5A1.5 1.5 0 0 0 3.5 11H5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
      style={{ display: 'inline', marginRight: 5, verticalAlign: '-1px' }}>
      <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="1.75"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [raw, setRaw]               = useState('')
  const [fetchingLyrics, setFetchingLyrics] = useState(false)
  const [fetchError, setFetchError] = useState('')

  const [formatted, setFormatted] = useState('')
  const [copied, setCopied]       = useState(false)

  const leftPaneRef = useRef(null)

  // Stream results: each source posts its results as soon as it resolves
  const handleSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setResults([])
    setSearchError('')
    setFetchError('')

    let found = 0
    const stream = (res) => {
      if (res.length) {
        found += res.length
        setResults(prev => [...prev, ...res])
      }
    }

    await Promise.allSettled([
      searchLyricsOvh(q).then(stream).catch(() => {}),
      searchAZLyrics(q).then(stream).catch(() => {}),
      searchGenius(q).then(stream).catch(() => {}),
    ])

    setSearching(false)
    if (found === 0) setSearchError('No results found. Try a different title or artist.')
  }, [query])

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter') handleSearch()
  }, [handleSearch])

  const selectResult = useCallback(async (result) => {
    setResults([])
    setFetchingLyrics(true)
    setFetchError('')
    setRaw('')
    setFormatted('')
    try {
      const lyrics = await result.fetchLyrics()
      setRaw(lyrics)
    } catch {
      setFetchError(`Could not load lyrics from ${result.source}. Try another result.`)
    } finally {
      setFetchingLyrics(false)
    }
  }, [])

  const handleFormat = useCallback(() => {
    if (raw.trim()) setFormatted(formatLyrics(raw))
  }, [raw])

  const handleCopy = useCallback(async () => {
    if (!formatted) return
    await navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [formatted])

  const handleClear = useCallback(() => {
    setQuery(''); setResults([]); setSearchError(''); setFetchError('')
    setRaw(''); setFormatted(''); setCopied(false); setFetchingLyrics(false)
  }, [])

  // Close dropdown when clicking outside the left pane
  useEffect(() => {
    const handler = e => {
      if (leftPaneRef.current && !leftPaneRef.current.contains(e.target)) {
        setResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasRaw = raw.trim().length > 0

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', flexDirection: 'column', fontFamily: "'Geist Variable', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin-h { to { transform: translateY(-50%) rotate(360deg); } }
        input, textarea { font-family: 'Geist Variable', system-ui, sans-serif; }
        input::placeholder, textarea::placeholder { color: ${MUTED}; }
        input:focus, textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 3px; }
      `}</style>

      {/* Top accent gradient */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${GREY_TOP}, ${GREY_ACC})`, flexShrink: 0 }} />

      {/* Header */}
      <header style={{
        backgroundColor: PANEL, borderBottom: `1px solid ${BORDER}`,
        padding: '14px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: TEXT, margin: 0, letterSpacing: '-0.02em' }}>
            Lyrics Formatter
          </h1>
          <p style={{ fontSize: 12, color: MUTED, margin: '3px 0 0', lineHeight: 1 }}>
            EasyWorship prep — search, fetch and clean song lyrics
          </p>
        </div>
        <button onClick={handleClear} style={{
          background: 'none', border: 'none', fontSize: 12, fontWeight: 500,
          color: MUTED, cursor: 'pointer', padding: '6px 10px', borderRadius: 6,
          fontFamily: 'inherit', transition: 'color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.color = TEXT}
          onMouseLeave={e => e.currentTarget.style.color = MUTED}
        >
          Clear all
        </button>
      </header>

      {/* Two-pane body */}
      <main style={{ flex: 1, display: 'flex', gap: 12, padding: 16, minHeight: 0 }}>

        {/* ── Left pane ── */}
        <div ref={leftPaneRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            backgroundColor: PANEL, border: `1px solid ${BORDER}`,
            borderRadius: 8, overflow: 'hidden',
          }}>
            {/* Header row: label + search bar + button */}
            <div style={{
              padding: '8px 10px 8px 14px', borderBottom: `1px solid ${BORDER}`,
              backgroundColor: PANEL_HEAD, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 600, color: MUTED,
                letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
              }}>
                Raw Input
              </span>

              {/* Search input */}
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }}>
                  <SearchIcon color={searching ? GREY_ACC : MUTED} />
                </div>
                <input
                  type="text"
                  placeholder="Search song title or artist…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={e => e.target.style.borderColor = GREY_ACC}
                  onBlur={e => e.target.style.borderColor = BORDER}
                  style={{
                    width: '100%', padding: '6px 30px 6px 28px',
                    border: `1px solid ${BORDER}`, borderRadius: 6,
                    fontSize: 12, color: TEXT, backgroundColor: BG,
                    boxSizing: 'border-box', transition: 'border-color 0.15s',
                  }}
                />
                {searching && (
                  <div style={{
                    position: 'absolute', right: 9, top: '50%',
                    width: 12, height: 12, border: `2px solid ${BORDER}`,
                    borderTopColor: GREY_ACC, borderRadius: '50%',
                    animation: 'spin-h 0.6s linear infinite',
                  }} />
                )}
              </div>

              {/* Search button */}
              <button
                onClick={handleSearch}
                disabled={searching || !query.trim()}
                style={{
                  backgroundColor: searching || !query.trim() ? '#22222C' : BLUE,
                  color: searching || !query.trim() ? MUTED : '#fff',
                  border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: 500, padding: '6px 14px',
                  cursor: searching || !query.trim() ? 'default' : 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  transition: 'background-color 0.15s, color 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => { if (!searching && query.trim()) e.currentTarget.style.backgroundColor = BLUE_HOV }}
                onMouseLeave={e => { if (!searching && query.trim()) e.currentTarget.style.backgroundColor = BLUE }}
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Textarea */}
            <textarea
              value={raw}
              onChange={e => { setRaw(e.target.value); setFormatted('') }}
              spellCheck={false}
              placeholder={fetchingLyrics ? 'Fetching lyrics…' : 'Or paste lyrics directly…'}
              disabled={fetchingLyrics}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                padding: '16px 20px', fontSize: 14, lineHeight: 1.8,
                color: TEXT, backgroundColor: 'transparent',
                minHeight: 300, opacity: fetchingLyrics ? 0.35 : 1,
                transition: 'opacity 0.2s', caretColor: GREY_ACC,
              }}
            />

            {fetchError && (
              <div style={{ padding: '8px 20px', fontSize: 12, color: '#F87171', borderTop: `1px solid ${BORDER}` }}>
                {fetchError}
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding: '8px 12px', borderTop: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 11, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                {stats(raw)}
              </span>
              <button
                onClick={handleFormat}
                disabled={!hasRaw}
                style={{
                  backgroundColor: hasRaw ? BLUE : '#22222C',
                  color: hasRaw ? '#fff' : MUTED,
                  border: 'none', borderRadius: 6,
                  fontSize: 12, fontWeight: 500, padding: '5px 14px',
                  cursor: hasRaw ? 'pointer' : 'default',
                  fontFamily: 'inherit', transition: 'background-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (hasRaw) e.currentTarget.style.backgroundColor = BLUE_HOV }}
                onMouseLeave={e => { if (hasRaw) e.currentTarget.style.backgroundColor = BLUE }}
              >
                Format →
              </button>
            </div>
          </div>

          {/* Results dropdown — overlays the textarea, anchored below the header */}
          {(results.length > 0 || searchError) && (
            <div style={{
              position: 'absolute',
              top: 41, // height of pane header row
              left: 0, right: 0,
              zIndex: 50,
              backgroundColor: PANEL,
              border: `1px solid ${BORDER}`,
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              maxHeight: 280,
              overflowY: 'auto',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            }}>
              {searchError && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#F87171' }}>
                  {searchError}
                </div>
              )}
              {results.map((r, i) => {
                const sc = SOURCE_COLORS[r.source] || SOURCE_COLORS['lyrics.ovh']
                return (
                  <button
                    key={i}
                    onClick={() => selectResult(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', textAlign: 'left', padding: '10px 14px',
                      border: 'none',
                      borderBottom: i < results.length - 1 ? `1px solid ${BORDER}` : 'none',
                      background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1E1E28'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{r.artist}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                      backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                      whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.05em',
                    }}>
                      {r.source}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Right pane: formatted output ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          backgroundColor: PANEL, border: `1px solid ${BORDER}`,
          borderRadius: 8, overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 10px 8px 14px', borderBottom: `1px solid ${BORDER}`,
            backgroundColor: PANEL_HEAD, display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Formatted Output
            </span>
            <button
              onClick={handleCopy}
              disabled={!formatted}
              style={{
                backgroundColor: copied ? '#166534' : BLUE,
                color: '#fff', border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: 500, padding: '5px 12px',
                cursor: formatted ? 'pointer' : 'default',
                opacity: formatted ? 1 : 0.3,
                fontFamily: 'inherit', transition: 'background-color 0.2s, opacity 0.15s',
                display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={e => { if (formatted && !copied) e.currentTarget.style.backgroundColor = BLUE_HOV }}
              onMouseLeave={e => { if (!copied) e.currentTarget.style.backgroundColor = formatted ? BLUE : BLUE }}
            >
              {copied ? <><CheckIcon />Copied</> : <><CopyIcon />Copy</>}
            </button>
          </div>

          <div style={{
            flex: 1, padding: '16px 20px', fontSize: 14, lineHeight: 1.8,
            color: formatted ? TEXT : MUTED,
            overflowY: 'auto', whiteSpace: 'pre-wrap', userSelect: 'text', minHeight: 300,
          }}>
            {formatted || 'Click Format → to see cleaned lyrics here'}
          </div>

          <div style={{
            padding: '8px 20px', borderTop: `1px solid ${BORDER}`,
            fontSize: 11, color: MUTED, fontVariantNumeric: 'tabular-nums',
          }}>
            {stats(formatted)}
          </div>
        </div>

      </main>
    </div>
  )
}
