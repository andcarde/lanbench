#requires -Version 5.1
<#
.SYNOPSIS
    Attaches the logsize layout debugger to the single HTML file of a target folder.

.DESCRIPTION
    Scans -TargetDir (non-recursively) for *.html files:
      * more than one HTML file -> error (it cannot guess which one you mean);
      * zero HTML files          -> error (there is nothing to attach it to);
      * exactly one HTML file    -> inserts a <script src=".../logsize.js"></script>
                                    block just before the closing </body> tag.

    The inserted block is wrapped in <!-- logsize:begin --> / <!-- logsize:end -->
    markers so uninstall.ps1 can remove it cleanly. Re-running is a no-op when the
    block is already present. The src is computed relative to the HTML file, so the
    page keeps working over file://.

.PARAMETER TargetDir
    Folder holding the HTML file. Defaults to the current directory.

.EXAMPLE
    ./front-logsize/install.ps1 -TargetDir ./reviewer-update
#>
[CmdletBinding()]
param(
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

# Resolve the single HTML file in the target directory (non-recursive).
if (-not (Test-Path -LiteralPath $TargetDir)) {
    Write-Error "Target directory not found: $TargetDir"
    exit 1
}
$htmlFiles = @(Get-ChildItem -LiteralPath $TargetDir -Filter '*.html' -File)

if ($htmlFiles.Count -gt 1) {
    Write-Error ("Found $($htmlFiles.Count) HTML files in '$TargetDir' — refusing to guess. " +
        "Files: " + ($htmlFiles.Name -join ', '))
    exit 1
}
if ($htmlFiles.Count -eq 0) {
    Write-Error "No HTML file found in '$TargetDir' — nothing to attach logsize to."
    exit 1
}
$html = $htmlFiles[0]

# Compute the src relative to the HTML file (forward slashes, file://-safe).
$logsizeJs = Join-Path $PSScriptRoot 'logsize.js'
if (-not (Test-Path -LiteralPath $logsizeJs)) {
    Write-Error "logsize.js not found next to this script ($logsizeJs)."
    exit 1
}
$fromUri = [System.Uri]((Resolve-Path -LiteralPath $html.DirectoryName).Path.TrimEnd('\') + '\')
$toUri   = [System.Uri]((Resolve-Path -LiteralPath $logsizeJs).Path)
$relSrc  = [System.Uri]::UnescapeDataString($fromUri.MakeRelativeUri($toUri).ToString())

$content = Get-Content -Raw -LiteralPath $html.FullName

# Idempotent: bail out if it is already attached.
if ($content -match 'logsize:begin') {
    Write-Host "logsize is already attached to $($html.Name) — nothing to do." -ForegroundColor Yellow
    exit 0
}

# Find the last </body> and insert the block before it, matching its indentation.
$bodyMatches = [regex]::Matches($content, '(?i)([ \t]*)</body>')
if ($bodyMatches.Count -eq 0) {
    Write-Error "$($html.Name) has no </body> tag — cannot find an insertion point."
    exit 1
}
$last   = $bodyMatches[$bodyMatches.Count - 1]
$indent = $last.Groups[1].Value
$nl     = if ($content -match "`r`n") { "`r`n" } else { "`n" }

$block = @(
    "$indent<!-- logsize:begin (front-logsize layout debugger — remove with uninstall.ps1) -->",
    "$indent<script src=`"$relSrc`"></script>",
    "$indent<!-- logsize:end -->",
    ""
) -join $nl

$newContent = $content.Substring(0, $last.Index) + $block + $content.Substring($last.Index)
Set-Content -LiteralPath $html.FullName -Value $newContent -NoNewline

Write-Host "Attached logsize to $($html.Name) (src=`"$relSrc`")." -ForegroundColor Green
Write-Host "Open the page, open DevTools, type 'logsize' and press Enter." -ForegroundColor Green
