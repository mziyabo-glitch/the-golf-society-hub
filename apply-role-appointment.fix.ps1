# apply-role-appointment.fix.ps1
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$path, [string]$text) {
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Backup-Once([string]$path, [string]$suffix) {
  $bak = "$path.$suffix.bak"
  if (!(Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $path -Destination $bak -Force }
}

function Patch-File([string]$path, [string]$suffix, [scriptblock]$patchFn) {
  if (!(Test-Path -LiteralPath $path)) { throw "Missing file: $path" }
  Backup-Once $path $suffix
  $before = Get-Content -Raw -LiteralPath $path
  $after  = & $patchFn $before
  if ($after -ne $before) {
    $after = $after -replace "^\uFEFF", ""  # remove BOM if present
    Write-Utf8NoBom $path $after
    Write-Host "Patched: $path" -ForegroundColor Green
  } else {
    Write-Host "No change: $path" -ForegroundColor DarkGray
  }
}

$memberRepo = "lib/db_supabase/memberRepo.ts"
$memberScreen = "app/(app)/members/[id].tsx"

# -------------------------
# Ensure updateMemberRole exists (and ends with newline)
# -------------------------
Patch-File $memberRepo "rolesfix" {
  param($t)
  $out = $t

  if ($out -notmatch "export\s+async\s+function\s+updateMemberRole") {
    if ($out -notmatch "\r?\n$") { $out += "`r`n" }

    $out += @"

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ role })
    .eq("id", memberId);

  if (error) throw error;
}
"@
  }

  if ($out -notmatch "\r?\n$") { $out += "`r`n" }
  return $out
}

# -------------------------
# Fix the Member Detail screen
# -------------------------
Patch-File $memberScreen "rolesfix" {
  param($t)
  $out = $t

  # 1) Ensure imports are clean (single import each)
  if ($out -notmatch 'import\s+\{\s*updateMemberRole\s*\}\s+from\s+"@/lib/db_supabase/memberRepo";') {
    # add after getPermissionsForMember import
    $out = [regex]::Replace(
      $out,
      '(import\s+\{\s*getPermissionsForMember\s*\}\s+from\s+"@/lib/rbac";\s*)',
      '$1' + "`r`n" + 'import { updateMemberRole } from "@/lib/db_supabase/memberRepo";' + "`r`n",
      1
    )
  }

  if ($out -notmatch 'import\s+\{\s*guard\s*\}\s+from\s+"@/lib/guards";') {
    # add after theme import
    $out = [regex]::Replace(
      $out,
      '(import\s+\{\s*getColors,\s*spacing,\s*radius\s*\}\s+from\s+"@/lib/ui/theme";\s*)',
      '$1' + "`r`n" + 'import { guard } from "@/lib/guards";' + "`r`n",
      1
    )
  }

  # Remove duplicate imports if present
  $out = [regex]::Replace($out, '(\r?\n)*import\s+\{\s*updateMemberRole\s*\}\s+from\s+"@/lib/db_supabase/memberRepo";(\r?\n)+import\s+\{\s*updateMemberRole\s*\}\s+from\s+"@/lib/db_supabase/memberRepo";', "`r`nimport { updateMemberRole } from `"/@/lib/db_supabase/memberRepo`";", 1)
  $out = [regex]::Replace($out, '(\r?\n)*import\s+\{\s*guard\s*\}\s+from\s+"@/lib/guards";(\r?\n)+import\s+\{\s*guard\s*\}\s+from\s+"@/lib/guards";', "`r`nimport { guard } from `"/@/lib/guards`";", 1)

  # 2) Remove ALL injected Role (Captain only) blocks anywhere
  $out = [regex]::Replace(
    $out,
    '\s*\{canManageRoles\s*&&\s*\(\s*<AppCard[\s\S]*?Role\s*\(Captain only\)[\s\S]*?<\/AppCard>\s*\)\}\s*',
    "`r`n",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  # 3) Remove any duplicate selectedRole state declarations (keep one)
  # Remove all occurrences first, then add a single clean one later.
  $out = [regex]::Replace(
    $out,
    '(\r?\n\s*const\s+\[selectedRole,\s*setSelectedRole\]\s*=\s*useState<.*?>\([^\)]*\);\s*)+',
    "`r`n",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  $out = [regex]::Replace(
    $out,
    '(\r?\n\s*const\s+\[selectedRole,\s*setSelectedRole\]\s*=\s*useState\s*\([^\)]*\);\s*)+',
    "`r`n",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  # 4) Fix broken vars injected (id ?? memberId)
  $out = [regex]::Replace(
    $out,
    '\r?\n\s*const\s+targetMemberId\s*=\s*\(id\s*\?\?\s*memberId\)\s*as\s*string;\s*',
    "`r`n",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  # 5) Remove handleUpdateRole that was appended AFTER styles (outside component)
  $out = [regex]::Replace(
    $out,
    '\r?\n\s*const\s+handleUpdateRole\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*$',
    "`r`n",
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  # 6) Insert a SINGLE selectedRole state inside the component after member state
  if ($out -notmatch '\[selectedRole,\s*setSelectedRole\]') {
    $out = [regex]::Replace(
      $out,
      '(const\s+\[member,\s*setMember\]\s*=\s*useState<[^>]*>\s*\([^\)]*\);\s*)',
      '$1' + "`r`n" + '  const [selectedRole, setSelectedRole] = useState<string>("member");' + "`r`n",
      1
    )
  }

  # 7) Insert canManageRoles + role sync (inside component, after permissions)
  if ($out -notmatch 'const\s+canManageRoles\s*=') {
    $out = [regex]::Replace(
      $out,
      '(const\s+permissions\s*=\s*getPermissionsForMember\([^\)]*\);\s*)',
      '$1' + "`r`n" +
      '  const canManageRoles = !!(permissions as any).canManageRoles || ((currentMember as any)?.role === "captain");' + "`r`n" +
      '  const targetMemberId = memberId as string;' + "`r`n",
      1
    )
  }

  # 8) Insert handleUpdateRole INSIDE component (after handleCancel or before return)
  if ($out -notmatch 'function\s+handleUpdateRole' -and $out -notmatch 'const\s+handleUpdateRole\s*=') {
    $handler = @"
  const handleUpdateRole = async () => {
    if (!guard(canManageRoles, "Only the Captain can change roles.")) return;
    if (!targetMemberId) return;

    try {
      await updateMemberRole(targetMemberId, selectedRole);
      Alert.alert("Updated", "Role updated.");
      // Refresh member so UI reflects role change immediately
      // (assumes you have a loadMember() or similar; if not, we just update local state)
      setMember((prev) => (prev ? ({ ...prev, role: selectedRole } as any) : prev));
    } catch (err: any) {
      console.error("[members/[id]] update role error:", err);
      Alert.alert("Error", err?.message || "Failed to update role.");
    }
  };
"@
    # Insert before the first "return (" of the main render
    $out = [regex]::Replace(
      $out,
      '(\r?\n\s*return\s*\(\s*)',
      "`r`n$handler`r`n`$1",
      1
    )
  }

  # 9) Sync selectedRole when member loads (optional but recommended)
  if ($out -notmatch 'setSelectedRole\(\(m\.role') {
    $out = [regex]::Replace(
      $out,
      '(setMember\((?<m>[^;]*?)\);\s*)',
      '$0' + "`r`n" + '      // Keep role picker in sync with loaded member' + "`r`n" +
      '      const m = (summaryMember ?? null) as any;' + "`r`n",
      1
    )
    # If above guess fails, do nothing. We keep it simple.
  }

  # 10) Insert the Role card ONCE in the main UI (near bottom, before closing </Screen>)
  if ($out -notmatch 'Role\s*\(Captain only\)') {
    $roleUI = @"
      {canManageRoles && (
        <AppCard style={{ marginTop: spacing.base }}>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>Role (Captain only)</AppText>
          <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
            Appoint Treasurer / Secretary / Handicapper.
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
                onPress={() => setSelectedRole(r.key)}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderColor: selectedRole === r.key ? colors.primary : colors.border,
                  backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <AppText variant="small">{r.label}</AppText>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.sm }}>
            <PrimaryButton
              onPress={handleUpdateRole}
              size="sm"
              disabled={!selectedRole}
            >
              Apply Role
            </PrimaryButton>
          </View>
        </AppCard>
      )}
"@

    # Insert before the LAST </Screen> in the file (main render)
    $out = [regex]::Replace($out, '(</Screen>\s*\);\s*\r?\n\}\s*\r?\n)', "$roleUI`r`n`$1", 1)
  }

  # 11) Tidy extra blank lines
  $out = [regex]::Replace($out, "(\r?\n){3,}", "`r`n`r`n")

  return $out
}

Write-Host ""
Write-Host "Done. Now run:" -ForegroundColor Cyan
Write-Host '  git --no-pager diff -- "app/(app)/members/[id].tsx"' -ForegroundColor White
Write-Host '  git --no-pager diff -- "lib/db_supabase/memberRepo.ts"' -ForegroundColor White
