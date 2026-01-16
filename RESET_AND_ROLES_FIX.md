# Reset Society & Role Assignment Fix

## Summary

Fixed the "Reset Society" bug that was breaking the app and implemented proper role assignment with persistence.

## Files Created

1. **`lib/storage.ts`** - Centralized storage management
   - `STORAGE_KEYS` - All storage keys in one place
   - `resetAllData()` - Safe reset that clears ALL keys including session
   - `dumpStorageKeys()` - Debug helper for troubleshooting
   - `hasActiveSociety()` - Check if app is initialized

2. **`lib/permissions.ts`** - Permission checking utilities
   - Role-based access control with session admin override
   - Functions: `canCreateEvents()`, `canEditMembers()`, `canAssignRoles()`, etc.
   - Falls back to session role "admin" for testing

## Files Modified

### Core Storage & Session
- **`lib/session.ts`** - Updated to use `STORAGE_KEYS`
- **`lib/roles.ts`** - Updated to use `STORAGE_KEYS`

### Settings & Reset
- **`app/settings.tsx`** - Uses `resetAllData()` from `lib/storage.ts`
  - Now clears ALL keys including session and admin PIN
  - Redirects to `/create-society` after reset
  - Uses `canAssignRoles()` from permissions

### Member Management
- **`app/add-member.tsx`** - Fixed permissions and role assignment
  - First member automatically gets `["captain", "handicapper", "member"]` roles
  - First member is set as current user and admin session
  - Uses `canEditMembers()` from permissions
  - Uses `STORAGE_KEYS`

### Event Management
- **`app/create-event.tsx`** - Fixed permissions
  - Uses `canCreateEvents()` from permissions
  - Uses `STORAGE_KEYS`
  - Updated error message

### Role Assignment
- **`app/roles.tsx`** - Fixed to use permissions
  - Uses `canAssignRoles()` from permissions
  - Uses `STORAGE_KEYS`

### Society Creation
- **`app/create-society.tsx`** - Sets admin session on creation
  - Uses `STORAGE_KEYS`
  - Sets session role to "admin" after society creation

### Dashboard
- **`app/society.tsx`** - Updated imports
  - Uses permissions from `lib/permissions.ts`
  - Uses `STORAGE_KEYS`

## Storage Keys Used

All keys are centralized in `lib/storage.ts`:

- `GSOCIETY_ACTIVE` - Active society data
- `GSOCIETY_DRAFT` - Draft society data
- `GSOCIETY_MEMBERS` - Members list
- `GSOCIETY_EVENTS` - Events list
- `GSOCIETY_SCORES` - Scores data
- `GSOCIETY_ADMIN_PIN` - Admin PIN
- `session.currentUserId` - Current user ID
- `session.role` - Session role (admin/member)

## Reset Behavior

**Before Fix:**
- Only cleared: society, events, members, scores, draft
- Left: admin PIN, session data
- Result: App broken, couldn't add members or create events

**After Fix:**
- Clears ALL keys including session and admin PIN
- Redirects to `/create-society`
- App returns to clean first-run state

## Role Assignment

### Data Model
- Member: `{ id, name, handicap, roles: MemberRole[] }`
- Roles: `"captain" | "treasurer" | "secretary" | "handicapper" | "member" | "admin"`
- Every member has at least `["member"]`

### Auto-Assignment
- First member created gets: `["captain", "handicapper", "member"]`
- First member is set as current user and admin session
- Subsequent members get: `["member"]`

### Permissions
- **Create Events**: Captain, Secretary, Handicapper (or session admin)
- **Edit Members**: Captain, Secretary (or session admin)
- **Assign Roles**: Captain only (or session admin)
- **Edit Finances**: Captain, Treasurer (or session admin)
- **Edit Venue**: Captain, Secretary (or session admin)
- **Edit Handicaps**: Captain, Handicapper (or session admin)

### Role Management UI
- Settings → "Roles & Permissions" (Captain only)
- PIN-gated access
- Lists all members with inline checkboxes
- Save persists to `member.roles` array

## Testing Checklist

✅ Reset Society → app returns to onboarding
✅ Create society + set Admin PIN
✅ Create first user → roles assigned automatically (Captain/Handicapper/Member)
✅ Add members works
✅ Create event works
✅ Roles screen works: assign Treasurer/Secretary/Handicapper
✅ Close app, reopen: everything persists
✅ Switch session role to MEMBER: restrictions apply
✅ Switch session role to ADMIN: override still works

## Migration Notes

- Existing members without roles get `["member"]` automatically
- Legacy session keys are migrated on first load
- All storage keys now centralized in `lib/storage.ts`



