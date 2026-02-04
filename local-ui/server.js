import express from 'express'
import cors from 'cors'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Get list of saved extractions from output directory
app.get('/api/saved-extractions', async (req, res) => {
  try {
    const outputDir = join(__dirname, '..', 'output')
    
    if (!existsSync(outputDir)) {
      return res.json([])
    }

    const domains = await readdir(outputDir, { withFileTypes: true })
    const extractions = []

    for (const domainEntry of domains) {
      if (!domainEntry.isDirectory() || domainEntry.name.startsWith('.')) continue

      const domainPath = join(outputDir, domainEntry.name)
      const files = await readdir(domainPath)

      for (const file of files) {
        // Show only standard JSON extractions in the UI
        if (file.endsWith('.json') && !file.endsWith('.tokens.json')) {
          const filePath = join(domainPath, file)
          const content = await readFile(filePath, 'utf-8')
          const data = JSON.parse(content)
          
          extractions.push({
            id: `${domainEntry.name}-${file}`,
            domain: domainEntry.name,
            filename: file,
            url: data.url || `https://${domainEntry.name}`,
            extractedAt: data.extractedAt || file.replace('.json', ''),
            type: 'json',
            path: `${domainEntry.name}/${file}`
          })
        }
      }
    }

    // Sort by extraction date, newest first
    extractions.sort((a, b) => new Date(b.extractedAt) - new Date(a.extractedAt))
    res.json(extractions)
  } catch (error) {
    console.error('Error listing saved extractions:', error)
    res.status(500).json({ error: error.message })
  }
})

// Load a specific saved extraction
app.get('/api/saved-extractions/:domain/:filename', async (req, res) => {
  try {
    const { domain, filename } = req.params
    const filePath = join(__dirname, '..', 'output', domain, filename)

    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    const content = await readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    res.json(data)
  } catch (error) {
    console.error('Error loading saved extraction:', error)
    res.status(500).json({ error: error.message })
  }
})


// Proxy images to bypass CORS restrictions
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url
  if (!imageUrl) {
    return res.status(400).json({ error: 'URL parameter required' })
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' })
    }

    const contentType = response.headers.get('content-type')
    res.setHeader('Content-Type', contentType || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')

    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (error) {
    console.error('Proxy error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/extract', async (req, res) => {
  const { url, options = {} } = req.body

  if (!url) {
    return res.status(400).json({ error: 'URL is required' })
  }

  const args = [join(__dirname, '..', 'index.js'), url, '--json-only', '--save-output']

  if (options.darkMode) args.push('--dark-mode')
  if (options.mobile) args.push('--mobile')
  if (options.slow) args.push('--slow')

  console.log(`Extracting: ${url} (Format: ${options.format || 'json'})`)

  const child = spawn('node', args, {
    cwd: join(__dirname, '..'),
    env: { ...process.env, FORCE_COLOR: '0' }
  })

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (data) => { stdout += data.toString() })
  child.stderr.on('data', (data) => { stderr += data.toString() })

  child.on('close', async (code) => {
    if (code !== 0) {
      console.error(`Extraction failed (code ${code}): ${stderr}`)
      return res.status(500).json({ error: stderr || 'Extraction failed' })
    }

    try {
      // Try parsing direct stdout first (since we use --json now)
      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch (e) {
        // Fallback: Find JSON between first { and last } if any other junk slip in
        const jsonStart = stdout.indexOf('{')
        const jsonEnd = stdout.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('No JSON found in output')
        }
        result = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1))
      }
      
      res.json(result)
    } catch (e) {
      console.error('Parse error:', e, '\nStdout:', stdout)
      res.status(500).json({ error: 'Failed to parse extraction result' })
    }
  })

  child.on('error', (err) => {
    console.error('Spawn error:', err)
    res.status(500).json({ error: err.message })
  })
})

app.listen(PORT, () => {
  console.log(`Dembrandt API running on http://localhost:${PORT}`)
})
