#requires -Version 5.1
<#
.SYNOPSIS
    Removes the logsize layout debugger from the single HTML file of a target folder.

.DESCRIPTION
    Scans -TargetDir (non-recursively) for *.html files using the same rules as
    install.ps1 (more than one -> error, zero -> error, exactly one -> act on it),
    then strips the <!-- logsize:begin --> ... <!-- logsize:end --> block that
    install.ps1 inserted. If the block is not present it reports that and exits 0.

.PARAMETER TargetDir
    Folder holding the HTML file. Defaults to the current directory.

.EXAMPLE
    ./front-logsize/uninstall.ps1 -TargetDir ./reviewer-update
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
    Write-Error "No HTML file found in '$TargetDir' — nothing to detach logsize from."
    exit 1
}
$html = $htmlFiles[0]

$content = Get-Content -Raw -LiteralPath $html.FullName

if ($content -notmatch 'logsize:begin') {
    Write-Host "logsize is not attached to $($html.Name) — nothing to do." -ForegroundColor Yellow
    exit 0
}

# Remove the whole begin..end block (and its leading indent + trailing newline).
$pattern    = '(?s)[ \t]*<!-- logsize:begin.*?<!-- logsize:end -->[ \t]*\r?\n?'
$newContent = [regex]::Replace($content, $pattern, '')
Set-Content -LiteralPath $html.FullName -Value $newContent -NoNewline

Write-Host "Removed logsize from $($html.Name)." -ForegroundColor Green
