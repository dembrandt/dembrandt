import { useState, useEffect, useCallback, useRef } from 'react'

interface ExtractionResult {
  url: string
  extractedAt: string
  logo?: { source: string; url: string; width: number; height: number }
  favicons?: Array<{ type: string; url: string; sizes: string | null }>
  colors?: {
    semantic?: Record<string, string>
    palette?: Array<{ color: string; normalized: string; count: number; confidence: string; lch?: string; oklch?: string }>
    cssVariables?: Record<string, string>
  }
  typography?: {
    styles?: Array<{ context: string; family: string; size: string; weight: string; lineHeight?: string }>
    sources?: { googleFonts?: string[]; adobeFonts?: string[]; variableFonts?: string[] }
  }
  spacing?: {
    scaleType?: string
    commonValues?: Array<{ px: string; rem: string; count: number; numericValue?: number }>
  }
  borderRadius?: {
    values?: Array<{ value: string; count: number; confidence: string; elements?: string[] }>
  }
  borders?: {
    combinations?: Array<{ width: string; style: string; color: string; count: number; confidence: string; elements?: string[] }>
    widths?: Array<{ value: string; count: number; confidence: string }>
    styles?: Array<{ value: string; count: number; confidence: string }>
    colors?: Array<{ value: string; count: number; confidence: string }>
  }
  shadows?: Array<{ shadow: string; count: number; confidence: string }>
  components?: {
    buttons?: Array<{ 
      states: { 
        default: any; 
        hover?: any; 
        active?: any; 
        focus?: any;
      };
      fontWeight?: string;
      fontSize?: string;
      classes?: string;
    }>
    inputs?: {
      text: any[];
      checkbox: any[];
      radio: any[];
      select: any[];
    }
    links?: Array<{ 
      states: { 
        default: any; 
        hover?: any; 
      };
      fontWeight?: string;
    }>
  }
  breakpoints?: Array<{ px: number }>
  iconSystem?: Array<{ name: string; type: string }>
  frameworks?: Array<{ name: string; confidence: string; evidence?: string }>
  logoInstances?: Array<{ source: string; url: string; context: string; type?: string; reversed?: boolean; background?: string | null; width?: number; height?: number }>
  wcag?: Array<{ fg: string; bg: string; ratio: number; aa: boolean; aaLarge: boolean; aaa: boolean; count: number }>
}

interface SavedFileEntry {
  id: string
  domain: string
  filename: string
  url: string
  extractedAt: string
  type: 'json' | 'dtcg'
  path: string
  brandColors?: string[] | null
}

interface BrandGroup {
  domain: string
  snapshots: SavedFileEntry[]
  latest: SavedFileEntry
}

const parseRgb = (color: string): { r: number; g: number; b: number } | null => {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return { r: +m[1], g: +m[2], b: +m[3] }
  const hex = color.match(/^#?([0-9a-f]{6})$/i)
  if (hex) {
    const v = parseInt(hex[1], 16)
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
  }
  // hsl(h, s%, l%) fallback
  const hsl = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (hsl) {
    const h = +hsl[1] / 360, s = +hsl[2] / 100, l = +hsl[3] / 100
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    return { r: Math.round(hue2rgb(h + 1/3) * 255), g: Math.round(hue2rgb(h) * 255), b: Math.round(hue2rgb(h - 1/3) * 255) }
  }
  return null
}

const lighten = (c: { r: number; g: number; b: number }, t: number) => ({
  r: Math.round(c.r + (255 - c.r) * t),
  g: Math.round(c.g + (255 - c.g) * t),
  b: Math.round(c.b + (255 - c.b) * t),
})

const rgba = (c: { r: number; g: number; b: number }, a: number) =>
  `rgba(${c.r},${c.g},${c.b},${a})`

const getBrandGradient = (colors: string[] | null | undefined): string | null => {
  if (!colors || colors.length === 0) return null
  const c1 = parseRgb(colors[0])
  if (!c1) return null
  const lum = (0.2126 * c1.r + 0.7152 * c1.g + 0.0722 * c1.b) / 255
  if (lum < 0.04 || lum > 0.92) return null
  const c2 = (colors[1] ? parseRgb(colors[1]) : null) ?? c1

  // Keep brand colors vivid, layer them as translucent blobs on dark base
  // Add a white specular highlight for the glass/depth effect seen in reference
  return [
    `radial-gradient(ellipse at 30% 30%, ${rgba(c1, 0.75)} 0%, transparent 60%)`,
    `radial-gradient(ellipse at 80% 75%, ${rgba(c2, 0.65)} 0%, transparent 55%)`,
    `radial-gradient(ellipse at 70% 10%, ${rgba(lighten(c1, 0.8), 0.30)} 0%, transparent 30%)`,
    `radial-gradient(ellipse at 15% 85%, ${rgba(c2, 0.40)} 0%, transparent 35%)`,
    `#0e0e16`,
  ].join(', ')
}

const groupByDomain = (files: SavedFileEntry[]): BrandGroup[] => {
  const map = new Map<string, SavedFileEntry[]>()
  for (const f of files) {
    const existing = map.get(f.domain) || []
    map.set(f.domain, [...existing, f])
  }
  return Array.from(map.entries()).map(([domain, snapshots]) => ({
    domain,
    snapshots: snapshots.sort((a, b) => new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()),
    latest: snapshots[0],
  }))
}

// Standard result type
const normalizeResult = (data: any): ExtractionResult => data as ExtractionResult

// URL utilities
const getDomain = (urlStr: string) => {
  try {
    return new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`).hostname.replace('www.', '')
  } catch {
    return urlStr
  }
}

const getBrandName = (urlStr: string) => {
  const domain = getDomain(urlStr)
  const name = domain.split('.')[0]
  return name.charAt(0).toUpperCase() + name.slice(1)
}

const getHashRoute = () => {
  const hash = window.location.hash.slice(1)
  if (!hash) return { view: 'home' as const, domain: null }
  if (hash.startsWith('site/')) {
    return { view: 'site' as const, domain: hash.slice(5) }
  }
  return { view: 'home' as const, domain: null }
}

function App() {
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [savedFiles, setSavedFiles] = useState<SavedFileEntry[]>([])
  const [loadingSavedFiles, setLoadingSavedFiles] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [openColorPicker, setOpenColorPicker] = useState<number | null>(null)
  const isLoadingRef = useRef(false)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dembrandt_theme') as 'dark' | 'light') || 'dark'
    }
    return 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('dembrandt_theme', theme)
  }, [theme])

  // Handle hash changes for navigation
  useEffect(() => {
    const handleHashChange = async () => {
      // Skip if loadSavedFile already handled this navigation
      if (isLoadingRef.current) { isLoadingRef.current = false; return }
      const route = getHashRoute()
      if (route.view === 'home') {
        setResult(null)
      } else if (route.view === 'site' && route.domain) {
        // Load from saved files
        const match = savedFiles.find(f => getDomain(f.url) === route.domain)
        if (match) {
          try {
            const response = await fetch(`http://localhost:3002/api/saved-extractions/${match.domain}/${match.filename}`)
            const rawData = await response.json()
            setSelectedFileId(match.id)
            setResult(normalizeResult(rawData))
          } catch (e) {
            console.error('Failed to load file:', e)
          }
        }
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [savedFiles])

  // Sync result with URL
  const navigateToSite = useCallback((data: ExtractionResult) => {
    setResult(data)
    window.location.hash = `site/${getDomain(data.url)}`
  }, [])

  const navigateHome = useCallback(() => {
    setResult(null)
    setSelectedFileId(null)
    window.location.hash = ''
  }, [])

  // Navigate through all snapshots, grouped by brand (3 stripe snapshots → 3 stops, then next brand)
  const navigateBrand = useCallback((direction: 'prev' | 'next') => {
    if (!result || savedFiles.length === 0) return
    const flat = groupByDomain(savedFiles).flatMap(g => g.snapshots)
    const currentDomain = savedFiles.find(f => f.id === selectedFileId)?.domain ?? getDomain(result.url)
    let idx = flat.findIndex(f => f.id === selectedFileId)
    if (idx === -1) idx = flat.findIndex(f => f.domain === currentDomain)
    if (idx === -1) return
    const newIdx = direction === 'next'
      ? (idx + 1) % flat.length
      : (idx - 1 + flat.length) % flat.length
    loadSavedFile(flat[newIdx])
  }, [result, savedFiles, selectedFileId])

  // A/D keyboard shortcuts (only on site view)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!result) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'a') { e.preventDefault(); navigateBrand('prev') }
      else if (k === 'd') { e.preventDefault(); navigateBrand('next') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, navigateBrand])




  const deleteFile = async (file: SavedFileEntry) => {
    try {
      await fetch(`http://localhost:3002/api/saved-extractions/${file.domain}/${file.filename}`, { method: 'DELETE' })
      setDeletingId(null)
      if (selectedFileId === file.id) {
        setResult(null)
        setSelectedFileId(null)
        window.location.hash = ''
      }
      setSavedFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (e) {
      console.error('Failed to delete file:', e)
    }
  }

  const fetchSavedFiles = async () => {
    setLoadingSavedFiles(true)
    try {
      const response = await fetch('http://localhost:3002/api/saved-extractions')
      const data = await response.json()
      setSavedFiles(data)
    } catch (e) {
      console.error('Failed to fetch saved files:', e)
    } finally {
      setLoadingSavedFiles(false)
    }
  }

  const loadSavedFile = async (file: SavedFileEntry) => {
    setSelectedFileId(file.id)
    isLoadingRef.current = true
    // Clear stale data immediately — title updates before fetch completes
    setResult({ url: file.url, extractedAt: file.extractedAt } as ExtractionResult)
    try {
      const response = await fetch(`http://localhost:3002/api/saved-extractions/${file.domain}/${file.filename}`)
      const rawData = await response.json()
      navigateToSite(normalizeResult(rawData))
    } catch (e) {
      console.error('Failed to load saved file:', e)
    }
  }

  // Track active section via IntersectionObserver
  useEffect(() => {
    if (!result) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          const topmost = visible.reduce((a, b) => a.boundingClientRect.top < b.boundingClientRect.top ? a : b)
          setActiveSection(topmost.target.id)
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    )
    const sections = document.querySelectorAll('section[id]')
    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [result])

  // Load saved files on mount
  useEffect(() => {
    fetchSavedFiles()
  }, [])

  const colors = result?.colors?.palette || []
  const typography = result?.typography?.styles || []
  const fontFamily = typography[0]?.family || 'system-ui, sans-serif'

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const buildCssVars = () => {
    const lines: string[] = [':root {']
    if (colors.length) {
      lines.push('  /* Colors */')
      colors.forEach((c, i) => {
        const name = `--color-${i + 1}`
        lines.push(`  ${name}: ${c.normalized || c.color};`)
      })
    }
    const seen = new Set<string>()
    const deduped = typography.filter(t => { const k = `${t.family}|${t.context}`; if (seen.has(k)) return false; seen.add(k); return true })
    if (deduped.length) {
      lines.push('  /* Typography */')
      if (fontFamily) lines.push(`  --font-family: ${fontFamily};`)
      deduped.forEach(t => {
        const slug = t.context.toLowerCase().replace(/\s+/g, '-')
        if (t.size) lines.push(`  --font-size-${slug}: ${t.size};`)
        if (t.weight) lines.push(`  --font-weight-${slug}: ${t.weight};`)
      })
    }
    const spacing = result?.spacing?.commonValues || []
    if (spacing.length) {
      lines.push('  /* Spacing */')
      spacing.forEach(s => lines.push(`  --spacing-${s.numericValue ?? s.px}: ${s.px};`))
    }
    const radii = result?.borderRadius?.values || []
    if (radii.length) {
      lines.push('  /* Border Radius */')
      radii.forEach((r, i) => lines.push(`  --radius-${i + 1}: ${r.value};`))
    }
    lines.push('}')
    return lines.join('\n')
  }
  const shadows = result?.shadows || []
  const spacing = result?.spacing?.commonValues || []
  const borderRadius = result?.borderRadius?.values || []

  const navSections = result ? [
    ...((result.logo || (result.favicons && result.favicons.length > 0)) ? [{ id: 'logo', label: 'Logo' }] : []),
    ...(result.favicons && result.favicons.length > 0 ? [{ id: 'favicons', label: 'Favicons' }] : []),
    { id: 'colors', label: 'Colors' },
    { id: 'typography', label: 'Typography' },
    { id: 'spacing', label: 'Spacing' },
    { id: 'shadows', label: 'Shadows' },
    { id: 'border-radius', label: 'Border Radius' },
    ...(result.components?.buttons && result.components.buttons.length > 0 ? [{ id: 'buttons', label: 'Buttons' }] : []),
    ...(result.components?.links && result.components.links.length > 0 ? [{ id: 'links', label: 'Links' }] : []),
    ...(result.frameworks && result.frameworks.length > 0 ? [{ id: 'frameworks', label: 'Frameworks' }] : []),
    ...(result.iconSystem && result.iconSystem.length > 0 ? [{ id: 'icon-systems', label: 'Icon Systems' }] : []),
    ...(result.breakpoints && result.breakpoints.length > 0 ? [{ id: 'breakpoints', label: 'Breakpoints' }] : []),
    ...(result.wcag && result.wcag.length > 0 ? [{ id: 'wcag', label: 'WCAG' }] : []),
  ] : []

  return (
    <div className="min-h-screen bg-background text-primary">
      {/* Global Header - Always Dark */}
      <header className="border-b border-[#1a1a24] bg-[#0a0a0f] backdrop-blur-xl fixed top-0 left-0 right-0 z-50">
        <div className="max-w-[2560px] mx-auto px-6 h-14 flex items-center justify-between">
          {/* Left: Logo + Breadcrumbs */}
          <nav className="flex items-center gap-2 min-w-0">
            <button
              onClick={navigateHome}
              className="flex items-center gap-2.5 text-white hover:opacity-80 transition-opacity shrink-0 cursor-pointer"
            >
              <img src="/logo.png" alt="Dembrandt" className="h-5 w-auto" />
            </button>

            {/* Dropdown selector */}
            {result && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#a0a0b2] shrink-0">
                  <path d="M9 6l6 6-6 6"/>
                </svg>
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 text-white text-sm bg-[#1a1a24] border border-[#2a2a34] rounded-md px-3 py-1.5 hover:border-[#3a3a44] transition-colors min-w-[180px] cursor-pointer"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${getDomain(result.url)}&sz=32`}
                      alt=""
                      className="w-4 h-4 rounded"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                    <span className="truncate flex-1 text-left">{getBrandName(result.url)}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-[#a0a0b2] transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                      <div className="absolute top-full left-0 mt-1 bg-[#12121a] border border-[#2a2a34] rounded-md shadow-2xl z-50 min-w-[240px] max-h-[calc(100vh-80px)] overflow-y-auto py-1">
                        {groupByDomain(savedFiles).map((group) => {
                          const _activeDomain = savedFiles.find(f => f.id === selectedFileId)?.domain ?? getDomain(result.url)
                          const isCurrent = _activeDomain === group.domain
                          const hasMany = group.snapshots.length > 1
                          return (
                            <div key={group.domain}>
                              {/* Brand row */}
                              <button
                                onClick={() => { loadSavedFile(group.latest); setDropdownOpen(false) }}
                                className={`w-full text-left px-2.5 py-2 text-sm flex items-center gap-2.5 transition-colors mx-1 rounded cursor-pointer ${
                                  isCurrent ? 'text-white bg-[#1a1a24]' : 'text-[#a0a0b0] hover:text-white hover:bg-[#1a1a24]'
                                }`}
                                style={{ width: 'calc(100% - 8px)' }}
                              >
                                <img src={`https://www.google.com/s2/favicons?domain=${group.domain}&sz=32`} alt="" className="w-4 h-4 rounded" onError={(e) => e.currentTarget.style.display = 'none'} />
                                <span className="truncate flex-1">
                                  {getBrandName(group.latest.url)}
                                  {hasMany && <span className="text-[#555] ml-1">({group.snapshots.length})</span>}
                                </span>
                                {isCurrent && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand shrink-0"><path d="M20 6L9 17l-5-5"/></svg>}
                              </button>
                              {/* Snapshots — always visible when this brand is active */}
                              {isCurrent && hasMany && (
                                <div className="ml-6 mb-1 border-l border-[#2a2a34] pl-2">
                                  {group.snapshots.map((snap) => {
                                    const isActive = snap.id === selectedFileId
                                    const path = snap.url.replace(/^https?:\/\//, '').replace(snap.domain, '') || '/'
                                    return (
                                      <button
                                        key={snap.id}
                                        onClick={() => { loadSavedFile(snap); setDropdownOpen(false) }}
                                        className={`w-full text-left px-2 py-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-2 ${
                                          isActive ? 'text-white font-medium' : 'text-[#666] hover:text-[#aaa]'
                                        }`}
                                      >
                                        <span className="shrink-0 text-[#444]">{isActive ? '▶' : '·'}</span>
                                        <span className="truncate">{new Date(snap.extractedAt).toLocaleDateString()} {path !== '/' && <span className="text-[#444]">{path.slice(0, 20)}</span>}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
                {/* Prev/next snapshot (across brands) */}
                {savedFiles.length > 1 && (
                  <div className="flex items-center ml-1">
                    <button
                      onClick={() => navigateBrand('prev')}
                      className="text-[#a0a0b2] hover:text-white p-1.5 rounded hover:bg-[#1a1a24] transition-colors cursor-pointer"
                      title="Previous (A)"
                      aria-label="Previous"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <button
                      onClick={() => navigateBrand('next')}
                      className="text-[#a0a0b2] hover:text-white p-1.5 rounded hover:bg-[#1a1a24] transition-colors cursor-pointer"
                      title="Next (D)"
                      aria-label="Next"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {result?.url && (
              <a
                href={result.url.startsWith('http') ? result.url : `https://${result.url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#a0a0b2] hover:text-white transition-colors p-2 rounded-md hover:bg-[#1a1a24] cursor-pointer"
                title="Open original site"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
              </a>
            )}
            {result && (
              <button
                onClick={() => window.print()}
                className="text-[#a0a0b2] hover:text-white transition-colors p-2 rounded-md hover:bg-[#1a1a24] cursor-pointer"
                title="Download as PDF"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
                </svg>
              </button>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-[#a0a0b2] hover:text-white transition-colors p-2 rounded-md hover:bg-[#1a1a24] cursor-pointer"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-20 pb-16 px-6">
        <div className="max-w-5xl mx-auto">

          {/* Input Section */}
          {!result && (
            <div className="text-center py-16">
              <p className="text-secondary mb-12 max-w-xl mx-auto">
                Run <code className="text-brand">dembrandt &lt;url&gt; --save-output</code> to add extractions
              </p>

              {/* Saved Files from output/ directory */}
              {savedFiles.length > 0 && (
                <div className="mt-16 max-w-4xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-secondary text-xs uppercase tracking-wider">Saved Extractions ({savedFiles.length})</h3>
                    <button
                      onClick={fetchSavedFiles}
                      disabled={loadingSavedFiles}
                      className="text-tertiary hover:text-brand text-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {loadingSavedFiles ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {groupByDomain(savedFiles).map((group) => {
                      const file = group.latest
                      const gradient = getBrandGradient(file.brandColors)
                      const isExpanded = expandedDomain === group.domain
                      const hasMultiple = group.snapshots.length > 1
                      return (
                        <div key={group.domain} className="flex flex-col gap-2">
                          {/* Main card */}
                          <div
                            className={`rounded-2xl cursor-pointer transition-all group relative overflow-hidden ${gradient ? 'bg-[#0a0a0f]' : 'bg-card hover:bg-card-hover'}`}
                            style={gradient ? { background: gradient } : undefined}
                            onClick={() => deletingId !== file.id && loadSavedFile(file)}
                          >
                            {deletingId === file.id ? (
                              <div className="flex flex-col gap-3 p-5 h-[220px] justify-between">
                                <p className="text-sm font-medium text-white">Remove this extraction?</p>
                                <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); deleteFile(file) }} className="px-3 py-1.5 rounded-md bg-red-500/20 border border-red-500/40 text-red-300 text-xs hover:bg-red-500/30 transition-colors cursor-pointer">Remove</button>
                                  <button onClick={(e) => { e.stopPropagation(); setDeletingId(null) }} className="px-3 py-1.5 rounded-md bg-white/10 border border-white/20 text-white/70 text-xs hover:text-white transition-colors cursor-pointer">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              /* Portrait card — logo centred, footer row at bottom */
                              <div className="flex flex-col h-[220px]">
                                {/* Logo area — grows to fill space, centres logo */}
                                <div className="flex-1 flex items-center justify-center">
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${file.domain}&sz=128`}
                                    alt=""
                                    className={`rounded-2xl shadow-xl ${gradient ? 'w-16 h-16' : 'w-10 h-10'}`}
                                    onError={(e) => e.currentTarget.style.display = 'none'}
                                  />
                                </div>
                                {/* Footer */}
                                <div className="px-4 pb-4 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs font-medium ${gradient ? 'text-white/70' : 'text-secondary'}`}>{file.domain}</span>
                                    {group.snapshots.length > 1 && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded-md ${gradient ? 'bg-white/10 text-white/50' : 'bg-surface text-tertiary'}`}>
                                        {group.snapshots.length}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs ${gradient ? 'text-white/40' : 'text-tertiary'}`}>
                                      open ↗
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeletingId(file.id) }}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-white/30 hover:text-white transition-all cursor-pointer"
                                      title="Remove"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Snapshots toggle + list */}
                          {hasMultiple && (
                            <div>
                              <button
                                onClick={() => setExpandedDomain(isExpanded ? null : group.domain)}
                                className="text-xs text-tertiary hover:text-secondary transition-colors flex items-center gap-1.5 px-1 cursor-pointer"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}><path d="M9 6l6 6-6 6"/></svg>
                                {group.snapshots.length} snapshots
                              </button>
                              {isExpanded && (
                                <div className="mt-1 ml-1 border-l border-border pl-3 space-y-0.5">
                                  {group.snapshots.map((snap, si) => (
                                    <div key={snap.id} className="flex items-center justify-between group/snap">
                                      <button
                                        onClick={() => loadSavedFile(snap)}
                                        className={`text-xs py-1 text-left transition-colors hover:text-primary cursor-pointer ${selectedFileId === snap.id ? 'text-brand font-medium' : 'text-tertiary'}`}
                                      >
                                        {si === 0 ? 'Latest' : new Date(snap.extractedAt).toLocaleDateString()} · {snap.url.replace(/^https?:\/\//, '').replace(snap.domain, '').slice(0, 30) || '/'}
                                      </button>
                                      <button
                                        onClick={() => setDeletingId(snap.id)}
                                        className="opacity-0 group-hover/snap:opacity-100 p-0.5 text-tertiary hover:text-primary transition-all cursor-pointer"
                                      >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                      </button>
                                      {deletingId === snap.id && (
                                        <div className="flex gap-1.5 ml-2">
                                          <button onClick={() => deleteFile(snap)} className="text-red-400 text-xs hover:text-red-300 cursor-pointer">Remove</button>
                                          <button onClick={() => setDeletingId(null)} className="text-tertiary text-xs hover:text-secondary cursor-pointer">Cancel</button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* Results */}
          {result && (
            <>
              {/* Snapshot revision picker — sticky top-right */}
              {(() => {
                const currentDomain = savedFiles.find(f => f.id === selectedFileId)?.domain ?? getDomain(result.url)
                const snaps = savedFiles.filter(f => f.domain === currentDomain)
                if (snaps.length < 2) return null
                return (
                  <div className="sticky top-20 z-30 flex justify-end mb-2 pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                    <span className="text-xs text-[#888] select-none">versions</span>
                    <div className="flex items-center gap-px bg-[#12121a] border border-[#2a2a34] rounded-md overflow-hidden shadow-lg">
                      {snaps.map((snap, i) => {
                        const isActive = snap.id === selectedFileId
                        return (
                          <button
                            key={snap.id}
                            onClick={() => loadSavedFile(snap)}
                            className={`text-xs px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap ${
                              isActive
                                ? 'bg-[#2e2e3e] text-white font-medium'
                                : 'text-[#555] hover:text-[#999] hover:bg-[#1a1a24]'
                            } ${i > 0 ? 'border-l border-[#2a2a34]' : ''}`}
                          >
                            {new Date(snap.extractedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </button>
                        )
                      })}
                    </div>
                    </div>
                  </div>
                )
              })()}

              {/* Brand Header */}
              <div className="text-center mb-12">
                <h2 className="text-5xl font-bold mb-2">{getBrandName(result.url)}</h2>
                <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
                  <span className="text-secondary text-sm">{getDomain(result.url)}</span>
                  <a
                    href={result.url.startsWith('http') ? result.url : `https://${result.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary transition-colors border border-border-strong hover:border-border rounded-md px-2.5 py-1"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    Inspect live
                  </a>
                  <button
                    onClick={() => copy('css-all', buildCssVars())}
                    className="inline-flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary transition-colors border border-border-strong hover:border-border rounded-md px-2.5 py-1 cursor-pointer"
                  >
                    {copiedKey === 'css-all' ? (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                        Copy CSS
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Sections */}
              <div className="flex gap-8">
                <div className="hidden lg:block w-36 shrink-0">
                <nav className="sticky top-20 pt-1 border-l border-border ml-2">
                  {navSections.map(s => {
                    const isActive = activeSection === s.id
                    return (
                      <a
                        key={s.id}
                        href={`#${s.id}`}
                        onClick={(e) => {
                          e.preventDefault()
                          document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className={`flex items-center text-xs py-1 pl-3 transition-colors cursor-pointer border-l -ml-px ${
                          isActive
                            ? 'text-primary font-medium border-primary'
                            : 'text-tertiary hover:text-secondary border-transparent'
                        }`}
                      >
                        {s.label}
                      </a>
                    )
                  })}
                </nav>
                </div>
                <div className="space-y-12 max-w-2xl w-full mx-auto lg:mx-0">
                {/* Logo */}
                {(result.logo || (result.favicons && result.favicons.length > 0)) && (() => {
                  // Check if logo URL is actually an image (not a homepage link)
                  const logoUrl = result.logo?.url || ''
                  const isImageUrl = logoUrl.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)(\?|$)/i) || logoUrl.includes('/image') || logoUrl.includes('/logo')
                  const hasValidLogo = result.logo && isImageUrl
                  const bestFavicon = result.favicons?.find(f => f.sizes?.includes('192') || f.sizes?.includes('180')) || result.favicons?.[0]

                  return (
                    <section id="logo">
                      <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Logo</h3>
                      <div className="bg-card rounded-2xl p-6 inline-block">
                        {hasValidLogo ? (
                          <img
                            src={`http://localhost:3002/api/proxy-image?url=${encodeURIComponent(logoUrl)}`}
                            alt="Brand logo"
                            width={result.logo!.width || 200}
                            height={result.logo!.height || 60}
                            className="max-w-full max-h-32 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                              const parent = e.currentTarget.parentElement
                              if (parent) {
                                parent.innerHTML = '<p class="text-tertiary text-sm">Logo image unavailable</p>'
                              }
                            }}
                          />
                        ) : bestFavicon ? (
                          <img
                            src={`http://localhost:3002/api/proxy-image?url=${encodeURIComponent(bestFavicon.url)}`}
                            alt="Brand favicon"
                            className="w-24 h-24 object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : (
                          <p className="text-tertiary text-sm">No logo available</p>
                        )}
                      </div>
                      {hasValidLogo ? (
                        <p className="text-tertiary text-sm mt-3">
                          {result.logo!.width}×{result.logo!.height}px • <a href={logoUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">View source</a>
                        </p>
                      ) : (
                        <p className="text-tertiary text-sm mt-3">Favicon (inline SVG logo)</p>
                      )}
                    </section>
                  )
                })()}

                {/* Logo Instances */}
                {result.logoInstances && result.logoInstances.length > 1 && (
                  <section>
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Logo Instances ({result.logoInstances.length})</h3>
                    <div className="flex flex-wrap gap-4">
                      {result.logoInstances.map((inst, i) => {
                        const isImg = inst.source === 'img' && inst.url?.match(/\.(svg|png|jpg|jpeg|gif|webp)(\?|$)/i)
                        return (
                          <div key={i} className="flex flex-col gap-1.5">
                            <div
                              className="rounded-xl p-4 flex items-center justify-center min-w-[120px] min-h-[64px]"
                              style={{ background: inst.background || (inst.reversed ? '#111' : '#f5f5f5') }}
                            >
                              {isImg ? (
                                <img
                                  src={`http://localhost:3002/api/proxy-image?url=${encodeURIComponent(inst.url)}`}
                                  alt=""
                                  className="max-h-12 max-w-[160px] object-contain"
                                  onError={(e) => e.currentTarget.style.display = 'none'}
                                />
                              ) : (
                                <span className="text-tertiary text-xs">SVG inline</span>
                              )}
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              <span className="text-xs px-1.5 py-0.5 bg-surface border border-border rounded text-secondary">{inst.context}</span>
                              {inst.type && <span className="text-xs px-1.5 py-0.5 bg-surface border border-border rounded text-tertiary">{inst.type}</span>}
                              {inst.reversed && <span className="text-xs px-1.5 py-0.5 bg-[#1a1a24] border border-[#2a2a34] rounded text-[#a0a0b2]">reversed</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* Favicons */}
                {result.favicons && result.favicons.length > 0 && (
                  <section id="favicons">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Favicons ({result.favicons.length})</h3>
                    <div className="flex flex-wrap gap-3">
                      {result.favicons.filter(f => f.url && !f.url.includes('og:') && !f.url.includes('twitter:')).slice(0, 6).map((f, i) => (
                        <img key={i} src={f.url} alt={f.type} className="w-8 h-8 rounded" onError={(e) => e.currentTarget.style.display = 'none'} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Colors */}
                <section id="colors">
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Colors ({colors.length})</h3>
                  <div className="flex flex-wrap gap-3">
                    {colors.length > 0 ? colors.map((c, i) => {
                      const formats: { label: string; value: string }[] = []
                      if (c.normalized) formats.push({ label: 'HEX', value: c.normalized })
                      if (c.color && c.color !== c.normalized) formats.push({ label: 'RGB', value: c.color })
                      if (c.lch) formats.push({ label: 'LCH', value: c.lch })
                      if (c.oklch) formats.push({ label: 'OKLCH', value: c.oklch })
                      const isOpen = openColorPicker === i
                      return (
                      <div key={i} className="relative">
                        <button
                          className={`w-16 h-16 rounded-xl cursor-pointer hover:scale-105 transition-transform shadow-lg block ${isOpen ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-background' : ''}`}
                          style={{ backgroundColor: c.normalized || c.color }}
                          onClick={() => setOpenColorPicker(isOpen ? null : i)}
                          aria-label={`Color ${c.normalized || c.color}`}
                        />
                        {isOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenColorPicker(null)} />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
                              <div className="bg-[#1a1a24] border border-[#2a2a34] rounded-lg p-1 text-xs whitespace-nowrap shadow-2xl flex flex-col gap-px min-w-[220px]">
                                {formats.map(f => {
                                  const k = `color-${i}-${f.label}`
                                  const isCopied = copiedKey === k
                                  return (
                                    <button
                                      key={f.label}
                                      onClick={(e) => { e.stopPropagation(); copy(k, f.value) }}
                                      className="flex items-center gap-3 px-2.5 py-2 rounded hover:bg-[#2a2a34] cursor-pointer text-left transition-colors"
                                    >
                                      <span className="text-[#8b8b9e] text-[10px] tracking-wider w-11 shrink-0 font-medium">{f.label}</span>
                                      <span className="text-white font-mono flex-1">{f.value}</span>
                                      <span className={`text-[10px] w-12 text-right shrink-0 ${isCopied ? 'text-green-400' : 'text-[#6b6b7e]'}`}>{isCopied ? '✓ copied' : 'copy'}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      )
                    }) : (
                      <p className="text-tertiary text-sm">No colors found</p>
                    )}
                  </div>
                </section>

                {/* Typography */}
                {(() => {
                  const seen = new Set<string>()
                  const deduped = typography.filter(t => {
                    const key = `${t.family}|${t.context}`
                    if (seen.has(key)) return false
                    seen.add(key)
                    return true
                  }).slice(0, 12)
                  const previewSize = (size: string) => {
                    const px = parseFloat(size)
                    if (!px) return '1.125rem'
                    return `${Math.min(Math.max(px, 14), 36)}px`
                  }
                  return (
                    <section id="typography">
                      <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Typography ({deduped.length})</h3>
                      <p className="text-tertiary font-mono text-xs mb-6">{fontFamily}</p>
                      <div className="space-y-6">
                        {deduped.map((t, i) => {
                          const typoCss = `font-family: ${t.family};\nfont-size: ${t.size};\nfont-weight: ${t.weight};${t.lineHeight ? `\nline-height: ${t.lineHeight};` : ''}`
                          const key = `typo-${i}`
                          return (
                          <div key={i} className="flex flex-col gap-1 group/typo cursor-pointer" onClick={() => copy(key, typoCss)} title="Click to copy CSS">
                            <span className="text-brand font-medium text-xs uppercase tracking-tight">{t.context}</span>
                            <span className="text-primary leading-tight" style={{ fontFamily: t.family, fontSize: previewSize(t.size), fontWeight: t.weight }}>
                              The quick brown fox
                            </span>
                            <div className="flex gap-2 text-xs text-tertiary font-mono mt-0.5">
                              <span>{t.size}</span>
                              <span>·</span>
                              <span>{t.weight}</span>
                              {t.lineHeight && <><span>·</span><span>{t.lineHeight}</span></>}
                              <span className="opacity-0 group-hover/typo:opacity-100 transition-opacity ml-1">
                                {copiedKey === key ? '✓ copied' : '· copy CSS'}
                              </span>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })()}

                {/* Spacing */}
                <section id="spacing">
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Spacing ({spacing.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {spacing.length > 0 ? spacing.map((s, i) => {
                      const k = `spacing-${s.px}`
                      const isCopied = copiedKey === k
                      return (
                      <button
                        key={i}
                        className={`px-3 py-1.5 rounded-lg bg-surface border text-sm cursor-pointer transition-colors ${isCopied ? 'border-green-400 text-green-400' : 'border-border text-secondary hover:border-brand'}`}
                        onClick={() => copy(k, s.px)}
                      >
                        {isCopied ? `✓ ${s.px}` : s.px}
                      </button>
                      )
                    }) : (
                      <p className="text-tertiary text-sm">No spacing found</p>
                    )}
                  </div>
                </section>

                {/* Shadows */}
                <section id="shadows">
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Shadows ({shadows.length})</h3>
                  {shadows.length > 0 ? (
                    <div className="bg-shadow-preview-bg rounded-xl p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                      {shadows.map((s, i) => {
                        const k = `shadow-${i}`
                        const isCopied = copiedKey === k
                        return (
                          <button
                            key={i}
                            onClick={() => copy(k, s.shadow)}
                            className="flex flex-col gap-2 items-start text-left group cursor-pointer"
                          >
                            <div
                              className="w-16 h-16 rounded-xl bg-shadow-preview-card group-hover:scale-105 transition-transform shrink-0"
                              style={{ boxShadow: s.shadow }}
                            />
                            <div className="flex items-center gap-1.5 text-xs font-mono text-tertiary group-hover:text-secondary transition-colors min-w-0 max-w-full">
                              <span className="truncate">{s.shadow}</span>
                              <span className={`shrink-0 text-[10px] ${isCopied ? 'text-green-400' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>{isCopied ? '✓' : 'copy'}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-tertiary text-sm">No shadows found</p>
                  )}
                </section>

                {/* Border Radius */}
                <section id="border-radius">
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Border Radius ({borderRadius.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {borderRadius.length > 0 ? borderRadius.map((r: any, i) => {
                      const k = `radius-${i}`
                      const isCopied = copiedKey === k
                      return (
                      <div key={i} className="flex flex-col gap-2 cursor-pointer group" onClick={() => copy(k, r.value)}>
                        <div className="aspect-square bg-surface border border-border group-hover:border-brand transition-colors flex items-center justify-center relative overflow-hidden" style={{ borderRadius: r.value }}>
                           <div className="w-full h-full bg-brand/10 absolute inset-0" />
                           <span className="text-brand font-mono text-xs z-10">{r.value}</span>
                           <span className={`absolute top-1.5 right-1.5 text-[10px] z-10 ${isCopied ? 'text-green-400' : 'text-tertiary opacity-0 group-hover:opacity-100'} transition-opacity`}>{isCopied ? '✓ copied' : 'copy'}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {r.elements?.slice(0, 2).map((el: string, j: number) => (
                            <span key={j} className="text-xs text-tertiary px-1.5 py-0.5 bg-surface rounded uppercase tracking-tighter">{el}</span>
                          ))}
                        </div>
                      </div>
                      )
                    }) : (
                      <p className="text-tertiary text-sm">No border radius found</p>
                    )}
                  </div>
                </section>

                {/* Buttons */}
                {result.components?.buttons && result.components.buttons.length > 0 && (
                  <section id="buttons">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Buttons ({result.components.buttons.length})</h3>
                    <div className="flex flex-wrap gap-4 items-start">
                      {result.components.buttons.map((b: any, i) => {
                        const s = b.states.default;
                        const label = b.text || ["Get Started", "Learn More", "Confirm", "Subscribe", "Log In", "Search", "Sign Up"][i % 7];
                        return (
                          <div key={i} className="flex flex-col gap-1.5">
                            <button
                              className="transition-all duration-200 cursor-pointer whitespace-nowrap"
                              style={{
                                backgroundColor: s.backgroundColor,
                                color: s.color,
                                borderRadius: s.borderRadius,
                                padding: s.padding,
                                border: s.border || 'none',
                                boxShadow: s.boxShadow,
                                fontWeight: b.fontWeight,
                                fontSize: b.fontSize,
                                outline: 'none',
                              }}
                            >
                              {label}
                            </button>
                            <span className="text-xs text-[#555] font-mono">{s.borderRadius}</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* Links */}
                {result.components?.links && result.components.links.length > 0 && (
                  <section id="links">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Links ({result.components.links.length})</h3>
                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                      {result.components.links.map((l, i) => {
                         const s = l.states.default;
                         const h = l.states.hover || s;
                         return (
                          <a 
                            key={i} 
                            href="#" 
                            className="transition-colors duration-200 text-sm"
                            style={{ 
                              color: s.color, 
                              textDecoration: s.textDecoration,
                              fontWeight: l.fontWeight 
                            }}
                            onMouseEnter={(e) => {
                              Object.assign(e.currentTarget.style, h);
                            }}
                            onMouseLeave={(e) => {
                              Object.assign(e.currentTarget.style, s);
                            }}
                            onClick={(e) => e.preventDefault()}
                          >
                            Explore our docs →
                          </a>
                         )
                      })}
                    </div>
                  </section>
                )}

                {/* Frameworks */}
                {result.frameworks && result.frameworks.length > 0 && (
                  <section id="frameworks">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Frameworks</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.frameworks.map((f, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-brand/20 border border-brand/40 text-sm text-brand">
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Icon Systems */}
                {result.iconSystem && result.iconSystem.length > 0 && (
                  <section id="icon-systems">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Icon Systems</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.iconSystem.map((ic, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-secondary">
                          {ic.name} ({ic.type})
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* Breakpoints */}
                {result.breakpoints && result.breakpoints.length > 0 && (
                  <section id="breakpoints">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Breakpoints ({result.breakpoints.length})</h3>
                    <div className="flex flex-wrap gap-2">
                      {result.breakpoints.map((b, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-secondary">
                          {b.px}px
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* WCAG */}
                {result.wcag && result.wcag.length > 0 && (
                  <section id="wcag">
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">WCAG Contrast ({result.wcag.length} pairs)</h3>
                    <div className="space-y-1.5">
                      {result.wcag.slice(0, 20).map((pair, i) => {
                        const grade = pair.aaa ? 'AAA' : pair.aa ? 'AA' : pair.aaLarge ? 'AA-Large' : 'fail'
                        const gradeBg = pair.aaa ? '#1a3a2a' : pair.aa ? '#1a2a3a' : pair.aaLarge ? '#3a2a10' : '#3a1a1a'
                        const gradeColor = pair.aaa ? '#6effa0' : pair.aa ? '#7dd3fc' : pair.aaLarge ? '#fbbf24' : '#f87171'
                        return (
                          <div key={i} className="flex items-center gap-3 bg-card rounded-xl px-4 py-3">
                            {/* Color swatch: fg text on bg */}
                            <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: pair.bg, color: pair.fg, border: '1px solid rgba(255,255,255,0.08)' }}>
                              Aa
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex gap-1.5 text-xs font-mono text-white">
                                <span>{pair.fg}</span>
                                <span className="text-[#555]">on</span>
                                <span>{pair.bg}</span>
                              </div>
                              <span className="text-xs text-[#888]">{pair.ratio.toFixed(2)}:1 · ×{pair.count}</span>
                            </div>
                            <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded shrink-0" style={{ background: gradeBg, color: gradeColor }}>{grade}</span>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}
                </div>
              </div>

            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
