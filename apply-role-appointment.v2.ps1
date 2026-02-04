# apply-role-appointment.v2.ps1
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$path, [string]$text) {
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Backup-Once([string]$path, [string]$suffix) {
  $bak = "$path.$suffix.bak"
  if (!(Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $path -Destination $bak -Force }
}

function Patch-File([string]$path, [string]$suffix, [scriptblock]$patchFn) {
  if (!(Test-Path -LiteralPath $path)) { return $false }
  Backup-Once $path $suffix
  $before = Get-Content -Raw -LiteralPath $path
  $after  = & $patchFn $before
  if ($after -ne $before) {
    Write-Utf8NoBom $path $after
    Write-Host "Patched: $path" -ForegroundColor Green
    return $true
  }
  Write-Host "No change: $path" -ForegroundColor DarkGray
  return $false
}

# ---------------------------
# Find the correct Member Edit screen (the one in your screenshot)
# ---------------------------
$memberEdit = $null
$matches = @()

$patterns = @(
  "WHS Number \(optional\)",
  "Handicap Index",
  "Valid range: -10 to 54"
)

foreach ($p in $patterns) {
  $hits = Select-String -Path "app\**\*.tsx" -Pattern $p -ErrorAction SilentlyContinue
  if ($hits) { $matches += $hits }
}

if ($matches.Count -eq 0) {
  throw "Could not locate member edit screen. Search found 0 matches for WHS/Handicap strings."
}

# choose most common file among matches
$memberEdit = ($matches | Group-Object Path | Sort-Object Count -Descending | Select-Object -First 1).Name
Write-Host "Member Edit screen detected: $memberEdit" -ForegroundColor Cyan

# ---------------------------
# 1) lib/rbac.ts -> add canManageRoles (captain-only)
# ---------------------------
$rbac = "lib\rbac.ts"
if (Test-Path $rbac) {
  Patch-File $rbac "roles" {
    param($t)
    if ($t -match "canManageRoles") { return $t }

    $out = $t

    # Add to Permissions type/interface
    $out2 = [regex]::Replace(
      $out,
      "(interface\s+Permissions\s*\{[\s\S]*?)(canEditMembers:\s*boolean;\s*)",
      "`$1`$2`r`n  canManageRoles: boolean;`r`n",
      1
    )
    if ($out2 -eq $out) {
      $out2 = [regex]::Replace(
        $out,
        "(export\s+type\s+Permissions\s*=\s*\{[\s\S]*?)(canEditMembers:\s*boolean;\s*)",
        "`$1`$2`r`n  canManageRoles: boolean;`r`n",
        1
      )
    }
    $out = $out2

    # Add to return object
    if ($out -notmatch "canManageRoles\s*:") {
      $out = [regex]::Replace(
        $out,
        "(return\s*\{[\s\S]*?)(canEditMembers:\s*[^,]+,)",
        "`$1`$2`r`n    canManageRoles: captain,",
        1
      )
    }
    if ($out -notmatch "canManageRoles\s*:") {
      $out = [regex]::Replace(
        $out,
        "(return\s*\{)",
        "`$1`r`n    canManageRoles: captain,",
        1
      )
    }

    return $out
  } | Out-Null
} else {
  Write-Host "SKIP: missing lib/rbac.ts" -ForegroundColor Yellow
}

# ---------------------------
# 2) lib/db_supabase/memberRepo.ts -> ensure updateMemberRole + trailing newline
# ---------------------------
$memberRepo = "lib\db_supabase\memberRepo.ts"
if (Test-Path $memberRepo) {
  Patch-File $memberRepo "roles" {
    param($t)
    $out = $t

    if ($out -notmatch "export\s+async\s+function\s+updateMemberRole") {
      if ($out -notmatch "\r?\n$") { $out += "`r`n" }

      $fn = @'
export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ role })
    .eq("id", memberId);

  if (error) throw error;
}
'@
      $out = $out + "`r`n" + $fn
    }

    if ($out -notmatch "\r?\n$") { $out += "`r`n" }
    return $out
  } | Out-Null
} else {
  Write-Host "SKIP: missing lib/db_supabase/memberRepo.ts" -ForegroundColor Yellow
}

# ---------------------------
# 3) Patch the member edit screen -> add Role section + handler
# ---------------------------
Patch-File $memberEdit "roles" {
  param($t)
  $out = $t

  # Ensure imports
  if ($out -notmatch 'import\s+\{\s*guard\s*\}\s+from\s+"@/lib/guards"') {
    # Insert after theme import if possible
    if ($out -match 'from\s+"@/lib/ui/theme"') {
      $out = [regex]::Replace(
        $out,
        '(import\s+\{[\s\S]*?\}\s+from\s+"@/lib/ui/theme";\s*)',
        "`$1`r`nimport { guard } from `"@/lib/guards`";`r`n",
        1
      )
    } else {
      $out = "import { guard } from `"@/lib/guards`";`r`n" + $out
    }
  }

  if ($out -notmatch 'updateMemberRole') {
    # Add after rbac import
    $out = [regex]::Replace(
      $out,
      '(import\s+\{\s*getPermissionsForMember\s*\}\s+from\s+"@/lib/rbac";\s*)',
      "`$1`r`nimport { updateMemberRole } from `"@/lib/db_supabase/memberRepo`";`r`n",
      1
    )
  }

  # Ensure canManageRoles derived
  if ($out -notmatch "canManageRoles") {
    $out = [regex]::Replace(
      $out,
      '(const\s+permissions\s*=\s*getPermissionsForMember\([^\)]*\);\s*)',
      "`$1`r`n  const canManageRoles = permissions.canManageRoles;`r`n",
      1
    )
  }

  # Ensure state for role
  if ($out -notmatch "selectedRole") {
    $out = [regex]::Replace(
      $out,
      '(const\s+\[saving,[\s\S]*?\]\s*=\s*useState\([^\)]*\);\s*)',
      "`$1`r`n  const [selectedRole, setSelectedRole] = useState<string | null>(null);`r`n",
      1
    )
  }

  # Ensure handler
  if ($out -notmatch "handleUpdateRole") {
    $handler = @'
  const handleUpdateRole = async (memberId: string, role: string) => {
    if (!guard(canManageRoles, "Only the Captain can change roles.")) return;

    try {
      await updateMemberRole(memberId, role);
      Alert.alert("Updated", "Role updated.");
    } catch (err: any) {
      console.error("[member] update role error:", err);
      Alert.alert("Error", err?.message || "Failed to update role.");
    }
  };

'@
    $out = [regex]::Replace(
      $out,
      '(const\s+permissions\s*=\s*getPermissionsForMember\([^\)]*\);\s*[\s\S]*?\r?\n)',
      "`$0`r`n$handler",
      1
    )
  }

  # Inject UI: add Role section above the Save/Cancel buttons
  if ($out -notmatch "Change Role|Role \(Captain") {
    $ui = @'
        {canManageRoles && (
          <AppCard style={{ marginTop: spacing.base }}>
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>Role (Captain only)</AppText>
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
              Appoint Treasurer / Secretary / Handicapper for this member.
            </AppText>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
              {[
                { key: "member", label: "Member" },
                { key: "treasurer", label: "Treasurer" },
                { key: "secretary", label: "Secretary" },
                { key: "handicapper", label: "Handicapper" },
              ].map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => {
                    setSelectedRole(r.key);
                    // NOTE: you must have the member's id in scope; see patch note below.
                  }}
                  style={({ pressed }) => ({
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: selectedRole === r.key ? colors.primary : colors.border,
                    backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                  })}
                >
                  <AppText variant="small">{r.label}</AppText>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.sm }}>
              <PrimaryButton
                onPress={() => {
                  // IMPORTANT: this screen must have the viewed member id available.
                  // We patch a placeholder below, you may need to rename 'memberId' to your variable.
                  if (!selectedRole) return;
                  handleUpdateRole(memberId as any, selectedRole);
                }}
                size="sm"
                disabled={!selectedRole}
              >
                Apply Role
              </PrimaryButton>
            </View>
          </AppCard>
        )}

'@

    # Insert before the action buttons container if it exists
    if ($out -match "(<View\s+style=\{styles\.actions\}[\s\S]*?</View>)") {
      $out = [regex]::Replace(
        $out,
        "(<View\s+style=\{styles\.actions\})",
        "$ui`$1",
        1
      )
    } else {
      # fallback: insert near end of Screen
      $out = [regex]::Replace(
        $out,
        "(</ScrollView>\s*</Screen>)",
        "`$1`r`n$ui",
        1
      )
    }
  }

  # Fix any BOM artifacts if they exist
  $out = $out -replace "^\uFEFF", ""

  return $out
} | Out-Null

Write-Host ""
Write-Host "DONE." -ForegroundColor Cyan
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  git --no-pager diff" -ForegroundColor White
Write-Host "  npx expo start -c" -ForegroundColor White
Write-Host ""
Write-Host "NOTE: if build fails, open the patched member edit screen and rename 'memberId' to whatever your screen uses for the viewed member id." -ForegroundColor Yellow
Write-Host "If clicking Apply Role throws a Supabase error, RLS is blocking UPDATE members.role." -ForegroundColor Yellow
