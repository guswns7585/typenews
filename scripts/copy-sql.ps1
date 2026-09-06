# 마이그레이션 SQL을 클립보드에 담는다. Supabase SQL Editor에 바로 붙여넣기 위한 것.
#
# 쓰는 법
#   .\scripts\copy-sql.ps1 0023            한 파일
#   .\scripts\copy-sql.ps1 0023 0024       여러 파일을 순서대로 이어서
#   .\scripts\copy-sql.ps1 -List           있는 파일 목록만 보기
#
# 번호 앞부분만 적으면 된다. 0023 → 0023_display_name_unique.sql

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Names,
  [switch]$List
)

$ErrorActionPreference = "Stop"
# 콘솔이 기본 코드페이지면 안내 문구의 한글이 깨진다. 클립보드 내용과는 무관하다.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$dir = Join-Path (Split-Path -Parent $PSScriptRoot) "supabase\migrations"

if (-not (Test-Path $dir)) {
  Write-Error "마이그레이션 폴더를 찾을 수 없습니다: $dir"
}

if ($List -or -not $Names) {
  Write-Host "supabase/migrations`n"
  Get-ChildItem $dir -Filter "*.sql" | Sort-Object Name | ForEach-Object {
    "{0,8:N0}자  {1}" -f (Get-Item $_.FullName).Length, $_.Name
  }
  Write-Host "`n예: .\scripts\copy-sql.ps1 0023 0024"
  return
}

$builder = New-Object System.Text.StringBuilder
$picked = @()

foreach ($name in $Names) {
  $matched = @(Get-ChildItem $dir -Filter "$name*.sql" | Sort-Object Name)
  if ($matched.Count -eq 0) {
    Write-Error "'$name'으로 시작하는 파일이 없습니다. -List로 목록을 보세요."
  }
  if ($matched.Count -gt 1) {
    Write-Error "'$name'에 여러 파일이 걸립니다: $($matched.Name -join ', ')"
  }

  $file = $matched[0]
  $picked += $file.Name

  # 여러 개를 이어붙일 때 어디서부터 어느 파일인지 보이게 한다.
  if ($Names.Count -gt 1) {
    [void]$builder.AppendLine("-- ==========================================================================")
    [void]$builder.AppendLine("-- $($file.Name)")
    [void]$builder.AppendLine("-- ==========================================================================")
    [void]$builder.AppendLine("")
  }
  [void]$builder.AppendLine((Get-Content $file.FullName -Raw -Encoding UTF8))
  [void]$builder.AppendLine("")
}

$text = $builder.ToString()
Set-Clipboard -Value $text

# 붙여넣기 전에 클립보드가 실제로 그 내용인지 확인한다. 한글이 깨지면 여기서 드러난다.
$back = Get-Clipboard -Raw
if ($back.Length -ne $text.Length) {
  Write-Error "클립보드에 제대로 담기지 않았습니다 ($($text.Length)자 → $($back.Length)자)"
}

Write-Host "클립보드에 담았습니다 — $($picked -join ' + ') ($($text.Length.ToString('N0'))자)"
Write-Host "Supabase 대시보드 → SQL Editor에 붙여넣고 Run."
