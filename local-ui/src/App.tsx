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
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [dropdownIndex, setDropdownIndex] = useState(0)
  const [gridIndex, setGridIndex] = useState(0)
  const [savedFiles, setSavedFiles] = useState<SavedFileEntry[]>([])
  const [loadingSavedFiles, setLoadingSavedFiles] = useState(false)
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
            const response = await fetch(`http://localhost:3001/api/saved-extractions/${match.domain}/${match.filename}`)
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

  // Navigate to adjacent extraction
  const navigateToAdjacent = useCallback((direction: 'prev' | 'next') => {
    if (!result || savedFiles.length === 0) return
    const currentDomain = getDomain(result.url)
    const currentIndex = savedFiles.findIndex(f => getDomain(f.url) === currentDomain)
    if (currentIndex === -1) return

    const newIndex = direction === 'next'
      ? (currentIndex + 1) % savedFiles.length
      : (currentIndex - 1 + savedFiles.length) % savedFiles.length
    loadSavedFile(savedFiles[newIndex])
  }, [result, savedFiles])

  // WASD + Arrow keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const key = e.key.toLowerCase()

      // Dropdown navigation when open
      if (dropdownOpen && savedFiles.length > 0) {
        if (e.key === 'ArrowLeft' || key === 'a') {
          e.preventDefault()
          setDropdownIndex(prev => (prev - 1 + savedFiles.length) % savedFiles.length)
        } else if (e.key === 'ArrowRight' || key === 'd') {
          e.preventDefault()
          setDropdownIndex(prev => (prev + 1) % savedFiles.length)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          loadSavedFile(savedFiles[dropdownIndex])
          setDropdownOpen(false)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDropdownOpen(false)
        }
        return
      }

      // Landing page grid navigation (when no result selected)
      if (!result && savedFiles.length > 0) {
        if (key === 'a' || e.key === 'ArrowLeft') {
          e.preventDefault()
          setGridIndex(prev => (prev - 1 + savedFiles.length) % savedFiles.length)
        } else if (key === 'd' || e.key === 'ArrowRight') {
          e.preventDefault()
          setGridIndex(prev => (prev + 1) % savedFiles.length)
        } else if (key === 's' || e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault()
          loadSavedFile(savedFiles[gridIndex])
        }
        return
      }

      // Global navigation when dropdown closed and result is shown
      if (key === 'w') {
        e.preventDefault()
        navigateHome()
      } else if (key === 's') {
        e.preventDefault()
        if (result) {
          // Set initial index to current item
          const currentIndex = savedFiles.findIndex(f => getDomain(f.url) === getDomain(result.url))
          setDropdownIndex(currentIndex >= 0 ? currentIndex : 0)
          setDropdownOpen(true)
        }
      } else if (key === 'a') {
        e.preventDefault()
        if (result) navigateToAdjacent('prev')
      } else if (key === 'd') {
        e.preventDefault()
        if (result) navigateToAdjacent('next')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [result, navigateToAdjacent, navigateHome, dropdownOpen, dropdownIndex, savedFiles])



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
    setSelectedFileId(file.id)
    isLoadingRef.current = true
    // Clear stale data immediately — title updates before fetch completes
    setResult({ url: file.url, extractedAt: file.extractedAt } as ExtractionResult)
    try {
      const response = await fetch(`http://localhost:3001/api/saved-extractions/${file.domain}/${file.filename}`)
      const rawData = await response.json()
      navigateToSite(normalizeResult(rawData))
    } catch (e) {
      console.error('Failed to load saved file:', e)
    }
  }

  // Load saved files on mount
  useEffect(() => {
    fetchSavedFiles()
  }, [])

  const colors = result?.colors?.palette || []
  const typography = result?.typography?.styles || []
  const fontFamily = typography[0]?.family || 'system-ui, sans-serif'
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

            {/* WASD Legend */}
            <div className="hidden sm:flex items-center gap-1 text-xs text-[#a0a0b2] ml-2">
              <kbd className="px-1.5 py-0.5 bg-[#1a1a24] border border-[#2a2a34] rounded text-[#c0c0cc]">W</kbd>
              <span>home</span>
              <kbd className="px-1.5 py-0.5 bg-[#1a1a24] border border-[#2a2a34] rounded text-[#c0c0cc] ml-2">S</kbd>
              <span>select</span>
              <kbd className="px-1.5 py-0.5 bg-[#1a1a24] border border-[#2a2a34] rounded text-[#c0c0cc] ml-2">A</kbd>
              <kbd className="px-1.5 py-0.5 bg-[#1a1a24] border border-[#2a2a34] rounded text-[#c0c0cc]">D</kbd>
              <span>nav</span>
            </div>

            {/* Dropdown selector */}
            {result && (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#a0a0b2] shrink-0">
                  <path d="M9 6l6 6-6 6"/>
                </svg>
                <div className="relative">
                  <button
                    onClick={() => {
                      if (!dropdownOpen) {
                        const currentIndex = savedFiles.findIndex(f => getDomain(f.url) === getDomain(result.url))
                        setDropdownIndex(currentIndex >= 0 ? currentIndex : 0)
                      }
                      setDropdownOpen(!dropdownOpen)
                    }}
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
                      <div className="absolute top-full left-0 mt-1 bg-[#12121a] border border-[#2a2a34] rounded-md shadow-2xl z-50 min-w-[220px] max-h-[calc(100vh-80px)] overflow-y-auto py-1">
                        {savedFiles.map((file, index) => {
                          const isActive = file.id === selectedFileId
                          const isFocused = index === dropdownIndex
                          return (
                            <button
                              key={file.id}
                              onClick={() => {
                                loadSavedFile(file)
                                setDropdownOpen(false)
                              }}
                              onMouseEnter={() => setDropdownIndex(index)}
                              className={`w-full text-left px-2.5 py-2 text-sm flex items-center gap-2.5 transition-colors mx-1 rounded cursor-pointer ${
                                isFocused
                                  ? 'bg-[#1a1a24] text-white'
                                  : 'text-[#a0a0b0] hover:text-white hover:bg-[#1a1a24]'
                              } ${isActive ? 'font-bold' : ''}`}
                              style={{ width: 'calc(100% - 8px)' }}
                            >
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${file.domain}&sz=32`}
                                alt=""
                                className="w-4 h-4 rounded"
                                onError={(e) => e.currentTarget.style.display = 'none'}
                              />
                              <span className="truncate flex-1">{getBrandName(file.url)}</span>
                              {isActive && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand shrink-0">
                                  <path d="M20 6L9 17l-5-5"/>
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
                {/* Navigation buttons */}
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => navigateToAdjacent('prev')}
                    className="text-[#a0a0b2] hover:text-white p-2 rounded hover:bg-[#1a1a24] transition-colors cursor-pointer"
                    title="Previous (A)"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => navigateToAdjacent('next')}
                    className="text-[#a0a0b2] hover:text-white p-2 rounded hover:bg-[#1a1a24] transition-colors cursor-pointer"
                    title="Next (D)"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 6l6 6-6 6"/>
                    </svg>
                  </button>
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
                className="text-[#a0a0b2] hover:text-white transition-colors p-2 rounded-md hover:bg-[#1a1a24] cursor-pointer"
                title="Open original site"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
              </a>
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
                    {savedFiles.map((file, index) => (
                      <div
                        key={file.id}
                        className={`bg-card rounded-2xl p-5 cursor-pointer hover:bg-card-hover transition-all group relative text-left ${
                          index === gridIndex ? 'ring-2 ring-brand ring-offset-2 ring-offset-background' : ''
                        }`}
                        onClick={() => loadSavedFile(file)}
                        onMouseEnter={() => setGridIndex(index)}
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
              <div className="flex gap-8">
                <div className="hidden lg:block w-32 shrink-0">
                <nav className="sticky top-20 pt-1">
                  {navSections.map(s => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault()
                        document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className="block text-xs text-tertiary hover:text-primary transition-colors py-1 cursor-pointer"
                    >
                      {s.label}
                    </a>
                  ))}
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
                            src={`http://localhost:3001/api/proxy-image?url=${encodeURIComponent(logoUrl)}`}
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
                            src={`http://localhost:3001/api/proxy-image?url=${encodeURIComponent(bestFavicon.url)}`}
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
                            <div className="text-[#6b6b7e] mt-1.5">click to copy</div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-tertiary text-sm">No colors found</p>
                    )}
                  </div>
                </section>

                {/* Typography */}
                <section id="typography">
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
                <section id="spacing">
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
                <section id="shadows">
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
                <section id="border-radius">
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
                  <section id="buttons">
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
