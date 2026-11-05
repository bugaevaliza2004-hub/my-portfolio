import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const WORKS_DIR = path.resolve('src/assets/works')
const DOCS_DIR = path.resolve('src/assets/docs')
const SCRIPT = path.resolve('scripts/make-previews.ps1')

/**
 * Превью работ для 3D-сцены всегда соответствуют оригиналам:
 * — при старте `npm run dev` и `npm run build` недостающие/устаревшие превью пересобираются;
 * — в dev-режиме при замене/добавлении/удалении файла в src/assets/works
 *   превью пересобирается, и страница перезагружается с новой текстурой.
 * Скрипт инкрементальный: трогает только изменённые файлы.
 */
function previewsPlugin() {
  const run = (logger) => {
    if (process.platform !== 'win32') {
      logger?.warn('[previews] автогенерация работает только на Windows — запустите scripts/make-previews.ps1 вручную')
      return
    }
    try {
      const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT], {
        encoding: 'utf8',
      })
      out
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => (logger ? logger.info(line) : console.log(line)))
    } catch (err) {
      const msg = `[previews] ошибка генерации превью: ${err.stderr || err.message}`
      if (logger) logger.error(msg)
      else console.error(msg)
    }
  }

  return {
    name: 'portfolio-previews',
    buildStart() {
      run()
    },
    configureServer(server) {
      let timer = null
      const onChange = (file) => {
        const p = path.resolve(file)
        const isCover = p.startsWith(DOCS_DIR) && /-cover\.(jpe?g|png)$/i.test(p)
        if (!p.startsWith(WORKS_DIR) && !isCover) return
        clearTimeout(timer)
        // небольшая задержка: файл мог ещё дописываться при копировании
        timer = setTimeout(() => {
          run(server.config.logger)
          server.ws.send({ type: 'full-reload' })
        }, 400)
      }
      server.watcher.add([WORKS_DIR, DOCS_DIR])
      server.watcher.on('add', onChange)
      server.watcher.on('change', onChange)
      server.watcher.on('unlink', onChange)
    },
  }
}

/**
 * Копия index.html как 404.html в сборке: хостинги (GitHub Pages, Netlify и др.)
 * отдают 404.html на неверный адрес — открывается наш сайт, а он сам
 * показывает красивую страницу 404. В dev-режиме Vite делает это сам.
 */
function notFoundPagePlugin() {
  return {
    name: 'portfolio-404',
    apply: 'build',
    writeBundle(options) {
      const index = path.join(options.dir, 'index.html')
      if (fs.existsSync(index)) fs.copyFileSync(index, path.join(options.dir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [previewsPlugin(), react(), notFoundPagePlugin()],
})
