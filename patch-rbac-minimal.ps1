$ErrorActionPreference="Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Patch-File {
  param(
    [string]$path,
    [string]$handlerRegex,
    [string]$guardLine,
    [int]$indentSpaces = 4
  )

  $bytes = [IO.File]::ReadAllBytes($path)

  # Strip UTF-8 BOM if present
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    $bytes = $bytes[3..($bytes.Length-1)]
  }

  $text = [Text.Encoding]::UTF8.GetString($bytes)
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }

  $importLine = 'import { guard } from "@/lib/guards";'

  # Add import after last import if missing
  if ($text -notmatch [regex]::Escape($importLine)) {
    $imports = [regex]::Matches($text, 'import[^\n]*;\s*', 'Multiline')
    if ($imports.Count -eq 0) { throw "No imports found in $path" }
    $last = $imports[$imports.Count-1]
    $text = $text.Insert($last.Index + $last.Length, "$nl$importLine$nl")
  }

  # Insert guard line inside handler if missing
  if ($text -notmatch [regex]::Escape($guardLine)) {
    $m = [regex]::Match($text, $handlerRegex)
    if (!$m.Success) { throw "Handler anchor not found in $path using: $handlerRegex" }
    $pos = $m.Index + $m.Length
    $indent = " " * $indentSpaces
    $text = $text.Insert($pos, "$nl$indent$guardLine$nl")
  }

  [IO.File]::WriteAllText($path, $text, $utf8NoBom)
  Write-Host "Patched: $path" -ForegroundColor Green
}

# 1) Members tab
Patch-File `
  -path "app/(app)/(tabs)/members.tsx" `
  -handlerRegex 'const\s+handleAddMember\s*=\s*async\s*\(\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canCreateMembers, "Only authorized ManCo roles can add members.")) return;'

Patch-File `
  -path "app/(app)/(tabs)/members.tsx" `
  -handlerRegex 'const\s+handleUpdateMember\s*=\s*async\s*\(\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canEditMembers || permissions.canManageHandicaps, "You don?t have permission to edit this member.")) return;'

# 2) Treasurer
Patch-File `
  -path "app/(app)/treasurer.tsx" `
  -handlerRegex 'const\s+handleSaveOpeningBalance\s*=\s*async\s*\([^)]*\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can update the opening balance.")) return;'

Patch-File `
  -path "app/(app)/treasurer.tsx" `
  -handlerRegex 'const\s+handleSaveEntry\s*=\s*async\s*\([^)]*\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can add or edit finance entries.")) return;'

# 3) Membership fees
Patch-File `
  -path "app/(app)/membership-fees.tsx" `
  -handlerRegex 'const\s+handleSaveFee\s*=\s*async\s*\(\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canManageMembershipFees, "Only the Captain or Treasurer can set the annual fee.")) return;'

Patch-File `
  -path "app/(app)/membership-fees.tsx" `
  -handlerRegex 'const\s+handleToggleFee\s*=\s*async\s*\([^)]*\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canManageMembershipFees, "Only the Captain or Treasurer can update membership fee status.")) return;'

# 4) Event finance
Patch-File `
  -path "app/(app)/event-finance.tsx" `
  -handlerRegex 'const\s+handleSave\s*=\s*async\s*\(\)\s*=>\s*\{' `
  -guardLine 'if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can edit event finance.")) return;'
