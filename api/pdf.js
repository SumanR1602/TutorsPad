export const config = {
  maxDuration: 30,
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // @sparticuz/chromium only works on Linux (Vercel/Lambda).
  // Return 503 in local dev so the frontend falls back to window.print().
  const isLocal = process.env.VERCEL_ENV === undefined || process.env.VERCEL_ENV === 'development'
  if (isLocal) {
    return res.status(503).json({ error: 'PDF API not available in local dev — use window.print() fallback' })
  }

  // Dynamic imports so the module is never loaded on Windows/local dev
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('puppeteer-core'),
  ])

  const { html, filename } = req.body
  if (!html) {
    return res.status(400).json({ error: 'Missing html body' })
  }

  let browser
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '11mm', right: '13mm', bottom: '11mm', left: '13mm' },
    })

    const safe = (filename || 'document').replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.pdf"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(Buffer.from(pdf))
  } catch (err) {
    console.error('PDF generation error:', err)
    return res.status(500).json({ error: 'PDF generation failed' })
  } finally {
    if (browser) await browser.close()
  }
}
