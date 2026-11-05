# Генерирует лёгкие превью работ для 3D-сцены:
#   src/assets/works/<папка>/<файл>.jpg  ->  src/assets/previews/<папка>/<файл>.jpg
#   src/assets/docs/<id>-cover.jpg      ->  src/assets/previews/docs/<id>-cover.jpg
# Оригиналы не изменяются (они открываются в модале в полном качестве).
#
# Инкрементально: превью пересоздаётся, только если оригинал новее превью
# (заменили файл с тем же именем) или превью ещё нет. Превью удалённых работ стираются.
# Запускается автоматически из vite.config.js (при старте dev/build и при изменении
# файлов в works/). Вручную:  powershell -ExecutionPolicy Bypass -File scripts/make-previews.ps1 [-Force]
param(
  [int]$LargeMax = 1280, # одиночные листы (резюме, опыт, лендинги)
  [int]$SmallMax = 768,  # работы в рядах (иллюстрации, постеры)
  [int]$CoverMax = 1024, # обложки документов на столе
  [int]$Quality = 82,
  [switch]$Force         # пересоздать все превью
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8 # вывод читает Vite (Node) в UTF-8
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '..\src\assets'
$src = (Resolve-Path (Join-Path $root 'works')).Path
$dst = Join-Path $root 'previews'
$small = @('illustrations', 'posters')

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$expected = @{}
$updated = 0

# Источники: все работы + обложки документов (лежат на столе в 3D;
# галерея страниц по-прежнему открывает оригиналы)
$docsDir = (Resolve-Path (Join-Path $root 'docs')).Path
$sources = @(
  Get-ChildItem $src -Recurse -File -Include *.jpg, *.jpeg, *.png | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1)
    $max = if ($small -contains $rel.Split('\')[0]) { $SmallMax } else { $LargeMax }
    [pscustomobject]@{ File = $_; Rel = $rel; Max = $max }
  }
  Get-ChildItem $docsDir -File -Filter '*-cover.*' | ForEach-Object {
    [pscustomobject]@{ File = $_; Rel = (Join-Path 'docs' $_.Name); Max = $CoverMax }
  }
)

$sources | ForEach-Object {
  $max = $_.Max
  $rel = $_.Rel
  $out = Join-Path $dst ([IO.Path]::ChangeExtension($rel, '.jpg'))
  $_ = $_.File
  $expected[[IO.Path]::GetFullPath($out)] = $true

  # превью актуально — пропускаем
  if (-not $Force -and (Test-Path $out) -and (Get-Item $out).LastWriteTimeUtc -ge $_.LastWriteTimeUtc) { return }

  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  # читаем через поток, чтобы не блокировать оригинал (его можно сразу снова заменить)
  $bytes = [IO.File]::ReadAllBytes($_.FullName)
  $ms = New-Object IO.MemoryStream (, $bytes)
  $img = [System.Drawing.Image]::FromStream($ms)
  $scale = [Math]::Min([double]1, [double]$max / [Math]::Max($img.Width, $img.Height))
  $w = [int][Math]::Round($img.Width * $scale)
  $h = [int][Math]::Round($img.Height * $scale)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.SmoothingMode = 'HighQuality'
  $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save($out, $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose(); $ms.Dispose()
  $updated++
  '[previews] обновлено: {0} ({1}x{2}, {3:N0} KB)' -f $rel, $w, $h, ((Get-Item $out).Length / 1KB)
}

# превью работ, которых больше нет
if (Test-Path $dst) {
  Get-ChildItem $dst -Recurse -File | Where-Object { -not $expected.ContainsKey($_.FullName) } | ForEach-Object {
    Remove-Item $_.FullName -Force
    '[previews] удалено лишнее: {0}' -f $_.Name
  }
}

if ($updated -eq 0) { '[previews] все превью актуальны' }
