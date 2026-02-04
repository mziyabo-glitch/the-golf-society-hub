# apply-role-appointment.clean.ps1
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$path, [string]$text) {
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Backup-Once([string]$path, [string]$suffix) {
  $bak = "$path.$suffix.bak"
  if (!(Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $path -Destination $bak -Force }
}

function Get-Raw([string]$path) {
  (Get-Content -Raw -LiteralPath $path) -replace "^\uFEFF", ""
}

$memberRepo = "lib/db_supabase/memberRepo.ts"
$memberScreen = "app/(app)/members/[id].tsx"

if (!(Test-Path -LiteralPath $memberRepo)) { throw "Missing: $memberRepo" }
if (!(Test-Path -LiteralPath $memberScreen)) { throw "Missing: $memberScreen" }

Backup-Once $memberRepo "rolesclean"
Backup-Once $memberScreen "rolesclean"

# -----------------------------
# 1) Fix memberRepo.ts function
# -----------------------------
$mr = Get-Raw $memberRepo

# If updateMemberRole exists but is missing closing brace, fix it
if ($mr -match 'export\s+async\s+function\s+updateMemberRole[\s\S]*$' -and $mr -notmatch 'export\s+async\s+function\s+updateMemberRole[\s\S]*\r?\n\}\s*\r?\n') {
  # naive: ensure file ends with a closing brace + newline
  if ($mr -notmatch '\r?\n\}\s*\r?\n\s*$') {
    $mr = $mr.TrimEnd() + "`r`n}`r`n"
  } else {
    if ($mr -notmatch "\r?\n$") { $mr += "`r`n" }
  }
}

# If updateMemberRole does not exist, append it
if ($mr -notmatch 'export\s+async\s+function\s+updateMemberRole') {
  if ($mr -notmatch "\r?\n$") { $mr += "`r`n" }
  $mr += @"

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ role })
    .eq("id", memberId);

  if (error) throw error;
}
"@
}

# Ensure trailing newline
if ($mr -notmatch "\r?\n$") { $mr += "`r`n" }
Write-Utf8NoBom $memberRepo $mr
Write-Host "Cleaned: $memberRepo" -ForegroundColor Green

# ---------------------------------------
# 2) Clean & re-add role UI to [id].tsx
# ---------------------------------------
$t = Get-Raw $memberScreen

# A) Remove all previously injected "Role (Captain only)" UI blocks anywhere
$t = [regex]::Replace($t,
  '\s*\{canManageRoles\s*&&\s*\(\s*<AppCard[\s\S]*?Role\s*\(Captain only\)[\s\S]*?<\/AppCard>\s*\)\}\s*',
  "`r`n",
  'IgnoreCase'
)

# B) Remove any injected handleUpdateRole blocks (multiple/mangled ones)
$t = [regex]::Replace($t,
  '\s*const\s+handleUpdateRole\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*',
  "`r`n",
  'IgnoreCase'
)

# C) Remove any injected weird lines that mention summaryMember / targetMemberId / id ??
$t = [regex]::Replace($t, '.*summaryMember.*\r?\n', '', 'IgnoreCase')
$t = [regex]::Replace($t, '.*targetMemberId.*\r?\n', '', 'IgnoreCase')
$t = [regex]::Replace($t, '.*\(id\s*\?\?.*\r?\n', '', 'IgnoreCase')

# D) Remove duplicate selectedRole state declarations
$t = [regex]::Replace($t,
  '(\r?\n\s*const\s+\[selectedRole,\s*setSelectedRole\]\s*=\s*useState[^\r\n]*\r?\n)+',
  "`r`n",
  'IgnoreCase'
)

# E) Fix broken </Screen> lines introduced by patching
# If we have lines that are exactly "</Screen>" without indentation, keep but normalize later.

# F) Ensure imports: updateMemberRole + guard
if ($t -notmatch 'import\s+\{\s*updateMemberRole\s*\}\s+from\s+"@/lib/db_supabase/memberRepo";') {
  $t = [regex]::Replace(
    $t,
    '(import\s+\{\s*getPermissionsForMember\s*\}\s+from\s+"@/lib/rbac";\s*)',
    '$1' + "`r`n" + 'import { updateMemberRole } from "@/lib/db_supabase/memberRepo";' + "`r`n",
    1
  )
}
if ($t -notmatch 'import\s+\{\s*guard\s*\}\s+from\s+"@/lib/guards";') {
  $t = [regex]::Replace(
    $t,
    '(import\s+\{\s*getColors,\s*spacing,\s*radius\s*\}\s+from\s+"@/lib/ui/theme";\s*)',
    '$1' + "`r`n" + 'import { guard } from "@/lib/guards";' + "`r`n",
    1
  )
}

# G) Insert selectedRole state once (right after member state)
if ($t -notmatch '\[selectedRole,\s*setSelectedRole\]') {
  $t = [regex]::Replace(
    $t,
    '(const\s+\[member,\s*setMember\]\s*=\s*useState<[^>]*>\s*\([^\)]*\);\s*)',
    '$1' + "`r`n" + '  const [selectedRole, setSelectedRole] = useState<string>("member");' + "`r`n",
    1
  )
}

# H) Ensure canManageRoles + targetMemberId defined after permissions
if ($t -notmatch 'const\s+canManageRoles\s*=') {
  $t = [regex]::Replace(
    $t,
    '(const\s+permissions\s*=\s*getPermissionsForMember\([^\)]*\);\s*)',
    '$1' + "`r`n" +
    '  const canManageRoles = !!(permissions as any).canManageRoles || ((currentMember as any)?.role === "captain");' + "`r`n" +
    '  const targetMemberId = memberId as string;' + "`r`n",
    1
  )
}

# I) Add ONE correct handleUpdateRole inside component before main return(
if ($t -notmatch 'const\s+handleUpdateRole\s*=\s*async') {
  $handler = @"
  const handleUpdateRole = async () => {
    if (!guard(canManageRoles, "Only the Captain can change roles.")) return;
    if (!targetMemberId) return;

    try {
      await updateMemberRole(targetMemberId, selectedRole);
      Alert.alert("Updated", "Role updated.");
      setMember((prev) => (prev ? ({ ...prev, role: selectedRole } as any) : prev));
    } catch (err: any) {
      console.error("[members/[id]] update role error:", err);
      Alert.alert("Error", err?.message || "Failed to update role.");
    }
  };

"@
  $t = [regex]::Replace($t, '(\r?\n\s*return\s*\(\s*)', "`r`n$handler`r`n`$1", 1)
}

# J) Insert the role UI block ONCE before the final closing </Screen> in the main render
if ($t -notmatch 'Role\s*\(Captain only\)') {
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
            <PrimaryButton onPress={handleUpdateRole} size="sm">
              Apply Role
            </PrimaryButton>
          </View>
        </AppCard>
      )}

"@
  $t = [regex]::Replace($t, '(\r?\n\s*</Screen>\s*\r?\n\s*\);\s*\r?\n\}\s*$)', "`r`n$roleUI`$1", 1)
}

# K) Collapse excessive blank lines
$t = [regex]::Replace($t, "(\r?\n){3,}", "`r`n`r`n")

Write-Utf8NoBom $memberScreen $t
Write-Host "Cleaned: $memberScreen" -ForegroundColor Green

Write-Host ""
Write-Host "Now run:" -ForegroundColor Cyan
Write-Host '  git --no-pager diff -- "app/(app)/members/[id].tsx"' -ForegroundColor White
Write-Host '  git --no-pager diff -- "lib/db_supabase/memberRepo.ts"' -ForegroundColor White
