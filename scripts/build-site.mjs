#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = process.cwd()
const docsRoot = join(root, 'docs')
const outRoot = join(root, 'site')
const langs = ['en', 'zh-CN', 'ja']

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineMarkdown(value, lang) {
  let html = escapeHtml(value)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = /\.md(#.*)?$/.test(href) ? href.replace(/\.md(#.*)?$/, '.html$1') : href
    return `<a href="${escapeHtml(safeHref)}">${label}</a>`
  })
  return html
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function isTableDivider(line) {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

function isTableRow(line) {
  return /^\s*\|.+\|\s*$/.test(line)
}

function renderTable(rows, lang) {
  const [header, , ...bodyRows] = rows
  const headerCells = splitTableRow(header)
  const body = bodyRows.map(row => splitTableRow(row))
  return [
    '<table>',
    '<thead>',
    `<tr>${headerCells.map(cell => `<th>${inlineMarkdown(cell, lang)}</th>`).join('')}</tr>`,
    '</thead>',
    '<tbody>',
    ...body.map(row => `<tr>${row.map(cell => `<td>${inlineMarkdown(cell, lang)}</td>`).join('')}</tr>`),
    '</tbody>',
    '</table>',
  ].join('\n')
}

function markdownToHtml(markdown, lang) {
  const lines = markdown.split(/\r?\n/)
  const html = []
  let inList = false
  let inCode = false
  const closeList = () => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const line = raw.trimEnd()
    if (line.startsWith('```')) {
      closeList()
      if (inCode) {
        html.push('</code></pre>')
        inCode = false
      } else {
        html.push('<pre><code>')
        inCode = true
      }
      continue
    }
    if (inCode) {
      html.push(`${escapeHtml(raw)}\n`)
      continue
    }
    if (!line || line.startsWith('<!--')) {
      closeList()
      continue
    }
    if (/^<a id="[a-z0-9-]+"><\/a>$/.test(line.trim())) {
      closeList()
      html.push(line.trim())
      continue
    }
    if (isTableRow(line) && lines[index + 1] && isTableDivider(lines[index + 1])) {
      closeList()
      const tableRows = [line, lines[index + 1]]
      index += 2
      while (index < lines.length && isTableRow(lines[index])) {
        tableRows.push(lines[index])
        index += 1
      }
      index -= 1
      html.push(renderTable(tableRows, lang))
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length
      const text = inlineMarkdown(heading[2], lang)
      const id = heading[2].toLowerCase().replace(/[^a-z0-9぀-ヿ㐀-鿿一-鿿]+/g, '-').replace(/^-|-$/g, '')
      html.push(`<h${level} id="${escapeHtml(id)}">${text}</h${level}>`)
      continue
    }
    if (line.startsWith('> ')) {
      closeList()
      html.push(`<blockquote>${inlineMarkdown(line.slice(2), lang)}</blockquote>`)
      continue
    }
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${inlineMarkdown(line.slice(2), lang)}</li>`)
      continue
    }
    closeList()
    html.push(`<p>${inlineMarkdown(line, lang)}</p>`)
  }
  closeList()
  if (inCode) html.push('</code></pre>')
  return html.join('\n')
}

function pageShell({ title, body, nav, lang }) {
  const langLinks = langs.map(code => {
    const label = code === 'zh-CN' ? '中文' : code.toUpperCase()
    return `<a ${code === lang ? 'aria-current="page"' : ''} href="../${code}/index.html">${label}</a>`
  }).join('')
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | Super RLL Docs</title>
  <style>
    :root { color-scheme: light dark; --bg: #f8faf9; --fg: #13201a; --muted: #5d6f67; --line: #d8e2dc; --link: #145f45; --panel: #ffffff; }
    @media (prefers-color-scheme: dark) { :root { --bg: #111714; --fg: #edf6f1; --muted: #9eb0a8; --line: #2d3a34; --link: #7ee0b2; --panel: #18211d; } }
    * { box-sizing: border-box; }
    body { margin: 0; font: 16px/1.65 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); }
    header { border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
    .top { max-width: 1240px; margin: 0 auto; padding: 14px 20px; display: flex; gap: 18px; align-items: center; justify-content: space-between; }
    .brand { font-weight: 700; letter-spacing: 0; }
    .langs { display: flex; gap: 10px; }
    .langs a { color: var(--link); text-decoration: none; font-weight: 600; }
    .langs a[aria-current="page"] { color: var(--fg); }
    .layout { max-width: 1240px; margin: 0 auto; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 34px; padding: 26px 20px 56px; }
    nav { border-right: 1px solid var(--line); padding-right: 22px; }
    nav a { display: block; color: var(--link); text-decoration: none; padding: 5px 0; }
    main { max-width: 840px; }
    h1 { font-size: clamp(2rem, 4vw, 3rem); line-height: 1.1; margin: 0 0 18px; }
    h2 { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 24px; }
    h3 { margin-top: 26px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; background: color-mix(in srgb, var(--line) 45%, transparent); padding: 1px 5px; border-radius: 4px; }
    pre { overflow: auto; padding: 16px; border: 1px solid var(--line); background: var(--panel); }
    table { width: 100%; border-collapse: collapse; margin: 18px 0 28px; display: block; overflow-x: auto; }
    th, td { border: 1px solid var(--line); padding: 9px 11px; text-align: left; vertical-align: top; }
    th { background: color-mix(in srgb, var(--line) 32%, transparent); }
    blockquote { margin: 0 0 24px; padding: 12px 16px; border-left: 4px solid var(--line); color: var(--muted); background: color-mix(in srgb, var(--panel) 74%, transparent); }
    a { color: var(--link); }
    @media (max-width: 800px) { .layout { display: block; padding-top: 18px; } nav { border-right: 0; border-bottom: 1px solid var(--line); padding: 0 0 18px; margin-bottom: 24px; } .top { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header><div class="top"><div class="brand">Super RLL Docs</div><div class="langs">${langLinks}</div></div></header>
  <div class="layout">
    <nav aria-label="Documentation">${nav}</nav>
    <main>${body}</main>
  </div>
</body>
</html>
`
}

async function filesFor(lang) {
  const dir = join(docsRoot, lang)
  if (!existsSync(dir)) return []
  return (await readdir(dir)).filter(name => name.endsWith('.md')).sort()
}

async function readInventory() {
  const path = join(docsRoot, 'docs-inventory.json')
  if (!existsSync(path)) return null
  return JSON.parse(await readFile(path, 'utf8'))
}

function navFilesFor(files, inventory) {
  if (!inventory?.pages) return files
  const visible = inventory.pages
    .filter(page => !page.nav_hidden)
    .map(page => `${page.slug}.md`)
    .filter(file => files.includes(file))
  return ['README.md', ...visible.filter(file => file !== 'README.md')]
}

async function main() {
  if (!existsSync(docsRoot)) throw new Error(`Missing ${docsRoot}`)
  await rm(outRoot, { recursive: true, force: true })
  await mkdir(outRoot, { recursive: true })

  const inventory = await readInventory()
  const filesByLang = Object.fromEntries(await Promise.all(langs.map(async lang => [lang, await filesFor(lang)])))
  const titles = {}
  for (const lang of langs) {
    titles[lang] = {}
    for (const file of filesByLang[lang]) {
      const md = await readFile(join(docsRoot, lang, file), 'utf8')
      const title = /^#\s+(.+)$/m.exec(md)?.[1] ?? basename(file, '.md')
      titles[lang][file] = title
    }
  }

  for (const lang of langs) {
    const langOut = join(outRoot, lang)
    await mkdir(langOut, { recursive: true })
    const nav = navFilesFor(filesByLang[lang], inventory)
      .map(file => {
        const href = file === 'README.md' ? 'index.html' : file.replace(/\.md$/, '.html')
        return `<a href="${href}">${escapeHtml(titles[lang][file])}</a>`
      })
      .join('\n')
    for (const file of filesByLang[lang]) {
      const markdown = await readFile(join(docsRoot, lang, file), 'utf8')
      const title = titles[lang][file]
      const body = markdownToHtml(markdown, lang)
      const html = pageShell({ title, body, nav, lang })
      const target = file === 'README.md' ? 'index.html' : file.replace(/\.md$/, '.html')
      await writeFile(join(langOut, target), html, 'utf8')
    }
  }

  await writeFile(join(outRoot, 'index.html'), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0; url=en/index.html"><title>Super RLL Docs</title></head>
<body><p><a href="en/index.html">Open Super RLL Docs</a></p></body>
</html>
`, 'utf8')
  console.log(`Built static site at ${outRoot}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
