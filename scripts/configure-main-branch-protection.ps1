param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[^/]+/[^/]+$")]
  [string]$Repository
)

$ErrorActionPreference = "Stop"
$configuration = Join-Path $PSScriptRoot "..\.github\main-branch-protection.json"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is required to apply branch protection."
}
if (-not (Test-Path -LiteralPath $configuration)) {
  throw "Main branch protection configuration was not found."
}

gh api --method PUT "repos/$Repository/branches/main/protection" --input $configuration
if ($LASTEXITCODE -ne 0) {
  throw "GitHub did not apply main branch protection."
}

Write-Output "Main branch protection applied to $Repository."
