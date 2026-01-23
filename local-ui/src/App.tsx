import { useState, useEffect, useCallback } from 'react'

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
    commonValues?: Array<{ px: number; rem: string; count: number }>
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
}

interface SavedFileEntry {
  id: string
  domain: string
  filename: string
  url: string
  extractedAt: string
  type: 'json' | 'dtcg'
  path: string
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
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFiles, setSavedFiles] = useState<SavedFileEntry[]>([])
  const [loadingSavedFiles, setLoadingSavedFiles] = useState(false)
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
      const route = getHashRoute()
      if (route.view === 'home') {
        setResult(null)
      } else if (route.view === 'site' && route.domain) {
        // Load from saved files
        const match = savedFiles.find(f => getDomain(f.url) === route.domain)
        if (match) {
          try {
            const response = await fetch(`http://localhost:3001/api/saved-extractions/${match.domain}/${match.filename}`)
            const rawData = await response.json()
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
    setUrl('')
    window.location.hash = ''
  }, [])



  const fetchSavedFiles = async () => {
    setLoadingSavedFiles(true)
    try {
      const response = await fetch('http://localhost:3001/api/saved-extractions')
      const data = await response.json()
      setSavedFiles(data)
    } catch (e) {
      console.error('Failed to fetch saved files:', e)
    } finally {
      setLoadingSavedFiles(false)
    }
  }

  const loadSavedFile = async (file: SavedFileEntry) => {
    try {
      const response = await fetch(`http://localhost:3001/api/saved-extractions/${file.domain}/${file.filename}`)
      const rawData = await response.json()
      navigateToSite(normalizeResult(rawData))
    } catch (e) {
      console.error('Failed to load saved file:', e)
      setError(e instanceof Error ? e.message : 'Failed to load file')
    }
  }

  // Load saved files on mount
  useEffect(() => {
    fetchSavedFiles()
  }, [])


  const handleExtract = async () => {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('http://localhost:3001/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      })
      const rawData = await response.json()
      if (!response.ok) throw new Error(rawData.error || 'Extraction failed')
      console.log('Extraction result:', rawData)
      const data = normalizeResult(rawData)
      // Refresh saved files list to show the new extraction
      await fetchSavedFiles()
      navigateToSite(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setLoading(false)
    }
  }

  const colors = result?.colors?.palette || []
  const typography = result?.typography?.styles || []
  const fontFamily = typography[0]?.family || 'system-ui, sans-serif'
  const shadows = result?.shadows || []
  const spacing = result?.spacing?.commonValues || []
  const borderRadius = result?.borderRadius?.values || []

  return (
    <div className="min-h-screen bg-background text-primary">
      {/* Global Header - Always Dark */}
      <header className="border-b border-[#1a1a24] bg-[#0a0a0f] backdrop-blur-xl fixed top-0 left-0 right-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          {/* Left: Logo + Breadcrumbs */}
          <nav className="flex items-center gap-2 min-w-0">
            <button
              onClick={navigateHome}
              className="flex items-center gap-2.5 text-white hover:opacity-80 transition-opacity shrink-0"
            >
              <img src="/logo.png" alt="Dembrandt" className="h-5 w-auto" />
            </button>

            {/* Breadcrumbs */}
            {result && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#6b6b7e] shrink-0">
                  <path d="M9 6l6 6-6 6"/>
                </svg>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[#8b8b9e] text-sm truncate">{getDomain(result.url)}</span>
                </div>
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
                className="text-[#8b8b9e] hover:text-white transition-colors p-1.5 rounded-md hover:bg-[#1a1a24]"
                title="Open original site"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
              </a>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-[#8b8b9e] hover:text-white transition-colors p-1.5 rounded-md hover:bg-[#1a1a24]"
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
              <div className="flex items-center justify-center mb-4">
                <img src="/logo.png" alt="Dembrandt" className="h-10 w-auto" />
              </div>
              <p className="text-secondary mb-10 max-w-xl mx-auto">
                Extract colors, typography, and brand assets from any website
              </p>

              <div className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto mb-6">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="stripe.com"
                    autoFocus
                    className="w-full px-4 py-3.5 pr-10 rounded-lg bg-surface border border-border-strong text-primary placeholder:text-tertiary focus:outline-none focus:border-brand"
                    onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                  />
                  {url && (
                    <button
                      onClick={() => setUrl('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary p-1"
                      title="Clear"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={handleExtract}
                  disabled={loading || !url.trim()}
                  className="px-6 py-3.5 rounded-lg bg-brand hover:bg-brand/90 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Extracting...' : 'Extract'}
                </button>
              </div>

              {error && (
                <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm max-w-lg mx-auto">
                  {error}
                </div>
              )}

              {/* Saved Files from output/ directory */}
              {savedFiles.length > 0 && (
                <div className="mt-16 max-w-4xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-secondary text-xs uppercase tracking-wider">Saved Extractions ({savedFiles.length})</h3>
                    <button
                      onClick={fetchSavedFiles}
                      disabled={loadingSavedFiles}
                      className="text-tertiary hover:text-brand text-xs transition-colors disabled:opacity-50"
                    >
                      {loadingSavedFiles ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {savedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="bg-card rounded-2xl p-5 cursor-pointer hover:bg-card-hover transition-colors group relative text-left"
                        onClick={() => loadSavedFile(file)}
                      >
                        <div className="mb-2">
                          <img 
                             src={`https://www.google.com/s2/favicons?domain=${file.domain}&sz=64`}
                             alt=""
                             className="w-8 h-8 rounded-lg"
                             onError={(e) => e.currentTarget.style.display = 'none'}
                          />
                        </div>
                        <h3 className="font-bold text-xl text-primary">{getBrandName(file.url)}</h3>
                        <p className="text-secondary text-sm mt-0.5">{file.domain}</p>
                        <p className="text-tertiary text-xs mt-2">
                          {new Date(file.extractedAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* Results */}
          {result && (
            <>
              {/* Brand Header */}
              <div className="text-center mb-12">
                <h2 className="text-5xl font-bold mb-2">{getBrandName(result.url)}</h2>
                <p className="text-secondary">{getDomain(result.url)}</p>
              </div>

              {/* Sections */}
              <div className="space-y-12 max-w-2xl mx-auto">
                {/* Logo */}
                {result.logo && (
                  <section>
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Logo</h3>
                    <div className="bg-card rounded-2xl p-6 inline-block">
                      <img 
                        src={result.logo.url} 
                        alt="Brand logo" 
                        className="max-w-full max-h-32 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const parent = e.currentTarget.parentElement
                          if (parent) {
                            parent.innerHTML = '<p class="text-tertiary text-sm">Logo image unavailable</p>'
                          }
                        }}
                      />
                    </div>
                    <p className="text-tertiary text-sm mt-3">
                      {result.logo.width}×{result.logo.height}px • <a href={result.logo.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">View source</a>
                    </p>
                  </section>
                )}

                {/* Favicons */}
                {result.favicons && result.favicons.length > 0 && (
                  <section>
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Favicons ({result.favicons.length})</h3>
                    <div className="flex flex-wrap gap-3">
                      {result.favicons.filter(f => f.url && !f.url.includes('og:') && !f.url.includes('twitter:')).slice(0, 6).map((f, i) => (
                        <img key={i} src={f.url} alt={f.type} className="w-8 h-8 rounded" onError={(e) => e.currentTarget.style.display = 'none'} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Colors */}
                <section>
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Colors ({colors.length})</h3>
                  <div className="flex flex-wrap gap-3">
                    {colors.length > 0 ? colors.map((c, i) => (
                      <div key={i} className="group relative">
                        <div
                          className="w-16 h-16 rounded-xl cursor-pointer hover:scale-105 transition-transform shadow-lg"
                          style={{ backgroundColor: c.normalized || c.color }}
                          onClick={() => navigator.clipboard.writeText(c.normalized || c.color)}
                        />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          <div className="bg-[#1a1a24] border border-[#2a2a34] rounded-lg p-3 text-xs whitespace-nowrap shadow-xl">
                            <div className="text-white font-mono mb-1">{c.normalized || c.color}</div>
                            {c.lch && <div className="text-[#8b8b9e] font-mono">{c.lch}</div>}
                            {c.oklch && <div className="text-[#8b8b9e] font-mono">{c.oklch}</div>}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-tertiary text-sm">No colors found</p>
                    )}
                  </div>
                </section>

                {/* Typography */}
                <section>
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Typography ({typography.length})</h3>
                  <p className="text-primary font-medium font-mono text-lg mb-4">{fontFamily}</p>
                  <div className="space-y-4">
                    {typography.map((t, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="text-brand font-medium text-xs uppercase tracking-tight">{t.context}</span>
                        <span className="text-primary text-xl" style={{ fontFamily: t.family }}>The quick brown fox jumps over the lazy dog.</span>
                        <div className="flex gap-2 text-xs text-secondary">
                          <span>{t.size}</span>
                          <span>/</span>
                          <span>{t.weight}</span>
                          {t.lineHeight && (
                            <>
                              <span>/</span>
                              <span>LH: {t.lineHeight}</span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Spacing */}
                <section>
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Spacing ({spacing.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {spacing.length > 0 ? spacing.map((s, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-secondary cursor-pointer hover:border-brand transition-colors"
                        onClick={() => navigator.clipboard.writeText(`${s.px}px`)}
                      >
                        {s.px}px
                      </span>
                    )) : (
                      <p className="text-tertiary text-sm">No spacing found</p>
                    )}
                  </div>
                </section>

                {/* Shadows */}
                <section>
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Shadows ({shadows.length})</h3>
                  {shadows.length > 0 ? (
                    <div className="bg-shadow-preview-bg rounded-xl p-6 flex flex-wrap gap-4">
                      {shadows.map((s, i) => (
                        <div
                          key={i}
                          className="w-16 h-16 rounded-xl bg-shadow-preview-card cursor-pointer hover:scale-105 transition-transform"
                          style={{ boxShadow: s.shadow }}
                          title={s.shadow}
                          onClick={() => navigator.clipboard.writeText(s.shadow)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-tertiary text-sm">No shadows found</p>
                  )}
                </section>

                {/* Border Radius */}
                <section>
                  <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Border Radius ({borderRadius.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    {borderRadius.length > 0 ? borderRadius.map((r: any, i) => (
                      <div key={i} className="flex flex-col gap-2 cursor-pointer" onClick={() => navigator.clipboard.writeText(r.value)}>
                        <div className="aspect-square bg-surface border border-border group hover:border-brand transition-colors flex items-center justify-center relative overflow-hidden" style={{ borderRadius: r.value }}>
                           <div className="w-full h-full bg-brand/10 absolute inset-0" />
                           <span className="text-brand font-mono text-xs z-10">{r.value}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {r.elements?.slice(0, 2).map((el: string, j: number) => (
                            <span key={j} className="text-[10px] text-tertiary px-1.5 py-0.5 bg-surface rounded uppercase tracking-tighter">{el}</span>
                          ))}
                        </div>
                      </div>
                    )) : (
                      <p className="text-tertiary text-sm">No border radius found</p>
                    )}
                  </div>
                </section>

                {/* Buttons */}
                {result.components?.buttons && result.components.buttons.length > 0 && (
                  <section>
                    <h3 className="text-secondary text-xs uppercase tracking-wider mb-4">Buttons ({result.components.buttons.length})</h3>
                    <div className="flex flex-wrap gap-4">
                      {result.components.buttons.map((b, i) => {
                        const s = b.states.default;
                        const h = b.states.hover || s;
                        const labels = ["Get Started", "Learn More", "Confirm", "Subscribe", "Log In", "Search", "Sign Up"];
                        return (
                          <div key={i} className="flex flex-col gap-2">
                             <button
                               className="transition-all duration-200 cursor-pointer text-sm font-medium whitespace-nowrap"
                               style={{
                                 backgroundColor: s.backgroundColor,
                                 color: s.color,
                                 borderRadius: s.borderRadius,
                                 padding: s.padding,
                                 border: s.border || 'none',
                                 boxShadow: s.boxShadow,
                                 fontWeight: b.fontWeight,
                                 outline: 'none'
                               }}
                               onMouseEnter={(e) => {
                                 const merged = { ...s, ...h };
                                 Object.assign(e.currentTarget.style, merged);
                               }}
                               onMouseLeave={(e) => {
                                 // Reset to original properties instead of just merging back
                                 e.currentTarget.style.backgroundColor = s.backgroundColor;
                                 e.currentTarget.style.color = s.color;
                                 e.currentTarget.style.border = s.border || 'none';
                                 e.currentTarget.style.boxShadow = s.boxShadow;
                                 e.currentTarget.style.transform = s.transform || 'none';
                                 e.currentTarget.style.opacity = s.opacity || '1';
                               }}
                             >
                               {labels[i % labels.length]}
                             </button>
                             <div className="flex gap-2 text-[9px] text-tertiary font-mono uppercase">
                               <span>{s.borderRadius}</span>
                             </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {/* Links */}
                {result.components?.links && result.components.links.length > 0 && (
                  <section>
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
                  <section>
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
                  <section>
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
                  <section>
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
              </div>

            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
