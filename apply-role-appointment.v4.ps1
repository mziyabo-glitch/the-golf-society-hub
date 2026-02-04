# apply-role-appointment.v4.ps1
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom([string]$path, [string]$text) {
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Backup-Once([string]$path, [string]$suffix) {
  $bak = "$path.$suffix.bak"
  if (!(Test-Path -LiteralPath $bak)) { Copy-Item -LiteralPath $path -Destination $bak -Force }
}

function Patch-File([string]$path, [scriptblock]$patchFn) {
  if (!(Test-Path -LiteralPath $path)) { throw "Missing file: $path" }
  Backup-Once $path "roles"
  $before = Get-Content -Raw -LiteralPath $path
  $after  = & $patchFn $before

  if ($after -ne $before) {
    $after = $after -replace "^\uFEFF", ""  # strip BOM if present
    Write-Utf8NoBom $path $after
    Write-Host "Patched: $path" -ForegroundColor Green
  } else {
    Write-Host "No change: $path" -ForegroundColor Yellow
  }
}

$target = "app/(app)/members/[id].tsx"
if (!(Test-Path -LiteralPath $target)) {
  throw "Target not found: $target"
}

Patch-File $target {
  param($t)
  $out = $t

  # 1) Ensure imports: guard + updateMemberRole
  if ($out -notmatch 'import\s+\{\s*guard\s*\}\s+from\s+"@/lib/guards"') {
    # insert after theme import if possible
    if ($out -match 'from\s+"@/lib/ui/theme";') {
      $out = [regex]::Replace(
        $out,
        '(from\s+"@/lib/ui/theme";\s*)',
        "`$1`r`nimport { guard } from `"@/lib/guards`";`r`n",
        1
      )
    } else {
      $out = "import { guard } from `"@/lib/guards`";`r`n" + $out
    }
  }

  if ($out -notmatch 'updateMemberRole') {
    # insert after memberRepo imports if present, else after rbac import
    if ($out -match 'from\s+"@/lib/rbac";') {
      $out = [regex]::Replace(
        $out,
        '(import\s+\{\s*getPermissionsForMember\s*\}\s+from\s+"@/lib/rbac";\s*)',
        "`$1`r`nimport { updateMemberRole } from `"@/lib/db_supabase/memberRepo`";`r`n",
        1
      )
    } else {
      $out = "import { updateMemberRole } from `"@/lib/db_supabase/memberRepo`";`r`n" + $out
    }
  }

  # 2) Ensure we have a role state
  if ($out -notmatch '\bselectedRole\b') {
    # add near top state declarations (best effort: after first useState)
    $out = [regex]::Replace(
      $out,
      '(useState<[^>]+>\([^\)]*\);\s*\r?\n)',
      "`$1  const [selectedRole, setSelectedRole] = useState<string>(`"member`");`r`n",
      1
    )
  }

  # 3) Ensure we can reference the edited member id from the route param
  # We expect a useLocalSearchParams pattern; if not found, we still set a safe fallback.
  if ($out -notmatch '\btargetMemberId\b') {
    # Try to place after permissions creation or near top of component
    $out = [regex]::Replace(
      $out,
      '(const\s+permissions\s*=\s*getPermissionsForMember\([^\)]*\);\s*)',
      "`$1`r`n  const targetMemberId = (id ?? memberId) as string;`r`n",
      1
    )
  }

  # 4) Ensure canManageRoles (Captain only) – use permissions if available, fallback to current member role
  if ($out -notmatch '\bcanManageRoles\b') {
    $out = [regex]::Replace(
      $out,
      '(const\s+permissions\s*=\s*getPermissionsForMember\([^\)]*\);\s*)',
      "`$1`r`n  const canManageRoles = !!(permissions as any).canManageRoles || ((member as any)?.role === `"captain`");`r`n",
      1
    )
  }

  # 5) Add handler to save role
  if ($out -notmatch 'handleUpdateRole') {
    $handler = @"
  const handleUpdateRole = async () => {
    if (!guard(canManageRoles, "Only the Captain can change roles.")) return;
    if (!targetMemberId) return;

    try {
      await updateMemberRole(targetMemberId, selectedRole);
      Alert.alert("Updated", "Role updated.");
      // Optional: refresh member details if this screen loads member info from DB
      // await loadMember();
    } catch (err: any) {
      console.error("[members/[id]] update role error:", err);
      Alert.alert("Error", err?.message || "Failed to update role.");
    }
  };

"@
    $out = $out + "`r`n" + $handler
  }

  # 6) Insert UI block: Role section (Captain only)
  if ($out -notmatch 'Role \(Captain only\)') {
    $ui = @"
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

    # Best effort insertion: put it before the bottom action buttons if we can find them,
    # otherwise just before </ScrollView> or </Screen>.
    if ($out -match '(</ScrollView>)') {
      $out = [regex]::Replace($out, '(</ScrollView>)', "$ui`r`n`$1", 1)
    } elseif ($out -match '(</Screen>)') {
      $out = [regex]::Replace($out, '(</Screen>)', "$ui`r`n`$1", 1)
    } else {
      $out = $out + "`r`n" + $ui
    }
  }

  return $out
}

Write-Host ""
Write-Host "DONE. Next:" -ForegroundColor Cyan
Write-Host "  git --no-pager diff -- app/(app)/members/[id].tsx" -ForegroundColor White
Write-Host "  npx expo start -c" -ForegroundColor White
Write-Host ""
Write-Host "If role updates fail with a Supabase error, it's RLS. You'll need a policy allowing Captain to update members.role." -ForegroundColor Yellow
