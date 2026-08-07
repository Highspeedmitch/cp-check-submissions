param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")]
  [string]$Bucket,

  [ValidatePattern("^$|^[0-9]{12}$")]
  [string]$ExpectedBucketOwner = "",

  [string]$Profile = "",

  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$managedRuleId = "afterlight-browser-inspection-uploads"
$configurationPath = Join-Path $PSScriptRoot "..\infra\inspection-bucket-cors.json"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI is required to inspect or apply the inspection bucket CORS configuration."
}
if (-not (Test-Path -LiteralPath $configurationPath)) {
  throw "The versioned inspection bucket CORS configuration was not found."
}

function Invoke-S3CorsCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$AllowMissingConfiguration
  )

  $commonArguments = @("--no-cli-pager")
  if ($Profile) { $commonArguments += @("--profile", $Profile) }
  if ($ExpectedBucketOwner) {
    $Arguments += @("--expected-bucket-owner", $ExpectedBucketOwner)
  }
  $output = & aws @Arguments @commonArguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    $rendered = ($output | Out-String).Trim()
    if ($AllowMissingConfiguration -and $rendered -match "NoSuchCORSConfiguration") {
      return [pscustomobject]@{ CORSRules = @() }
    }
    throw "AWS CLI failed while managing bucket CORS: $rendered"
  }
  $json = ($output | Out-String).Trim()
  if (-not $json) { return $null }
  return $json | ConvertFrom-Json
}

function Normalize-CorsRule {
  param([Parameter(Mandatory = $true)]$Rule)

  return [ordered]@{
    ID = [string]$Rule.ID
    AllowedHeaders = @($Rule.AllowedHeaders | Sort-Object)
    AllowedMethods = @($Rule.AllowedMethods | Sort-Object)
    AllowedOrigins = @($Rule.AllowedOrigins | Sort-Object)
    ExposeHeaders = @($Rule.ExposeHeaders | Sort-Object)
    MaxAgeSeconds = [int]$Rule.MaxAgeSeconds
  }
}

$desiredConfiguration = Get-Content -Raw -LiteralPath $configurationPath | ConvertFrom-Json
$desiredRules = @($desiredConfiguration.CORSRules | Where-Object { $_.ID -eq $managedRuleId })
if ($desiredRules.Count -ne 1) {
  throw "The versioned configuration must contain exactly one $managedRuleId rule."
}
$desiredRule = $desiredRules[0]

$currentConfiguration = Invoke-S3CorsCommand -Arguments @(
  "s3api", "get-bucket-cors", "--bucket", $Bucket, "--output", "json"
) -AllowMissingConfiguration
$currentManagedRules = @($currentConfiguration.CORSRules | Where-Object { $_.ID -eq $managedRuleId })
$desiredNormalized = Normalize-CorsRule $desiredRule | ConvertTo-Json -Depth 8 -Compress
$currentNormalized = if ($currentManagedRules.Count -eq 1) {
  Normalize-CorsRule $currentManagedRules[0] | ConvertTo-Json -Depth 8 -Compress
} else {
  ""
}
$inSync = $currentManagedRules.Count -eq 1 -and $currentNormalized -eq $desiredNormalized

if ($inSync) {
  Write-Output "Inspection upload CORS is current for bucket $Bucket."
  exit 0
}

if (-not $Apply) {
  Write-Warning "Inspection upload CORS differs from the versioned configuration for bucket $Bucket."
  Write-Output "Review the live rules, then rerun with -Apply to merge the managed rule while preserving unrelated CORS rules."
  exit 2
}

$mergedRules = [System.Collections.Generic.List[object]]::new()
foreach ($rule in @($currentConfiguration.CORSRules)) {
  if ($rule.ID -ne $managedRuleId) { $mergedRules.Add($rule) }
}
$mergedRules.Add($desiredRule)
$payload = [ordered]@{ CORSRules = @($mergedRules) } | ConvertTo-Json -Depth 10 -Compress

Invoke-S3CorsCommand -Arguments @(
  "s3api", "put-bucket-cors", "--bucket", $Bucket,
  "--cors-configuration", $payload
) | Out-Null

$verifiedConfiguration = Invoke-S3CorsCommand -Arguments @(
  "s3api", "get-bucket-cors", "--bucket", $Bucket, "--output", "json"
)
$verifiedRules = @($verifiedConfiguration.CORSRules | Where-Object { $_.ID -eq $managedRuleId })
$verifiedNormalized = if ($verifiedRules.Count -eq 1) {
  Normalize-CorsRule $verifiedRules[0] | ConvertTo-Json -Depth 8 -Compress
} else {
  ""
}
if ($verifiedRules.Count -ne 1 -or $verifiedNormalized -ne $desiredNormalized) {
  throw "AWS accepted the update, but the managed inspection upload CORS rule did not verify."
}

Write-Output "Inspection upload CORS applied and verified for bucket $Bucket."
