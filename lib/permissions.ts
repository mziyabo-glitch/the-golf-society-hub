import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Role definitions
 */
export type Role = 'CAPTAIN' | 'TREASURER' | 'SECRETARY' | 'HANDICAPPER' | 'MEMBER';

/**
 * Permission matrix - single source of truth
 */
const PERMISSIONS = {
  // Society management
  canCreateSociety: ['CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER', 'MEMBER'],
  canDeleteSociety: ['CAPTAIN'],
  canEditSocietySettings: ['CAPTAIN', 'TREASURER'],
  
  // Member management
  canAddMember: ['CAPTAIN', 'TREASURER'],
  canRemoveMember: ['CAPTAIN', 'TREASURER'],
  canEditMemberRoles: ['CAPTAIN'],
  canEditOwnProfile: ['CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER', 'MEMBER'],
  
  // Event management
  canCreateEvent: ['CAPTAIN', 'TREASURER', 'SECRETARY'],
  canEditEvent: ['CAPTAIN', 'TREASURER', 'SECRETARY'],
  canDeleteEvent: ['CAPTAIN'],
  canPublishResults: ['CAPTAIN', 'HANDICAPPER'],
  
  // Tee sheet
  canUploadTeeSheet: ['CAPTAIN', 'SECRETARY'],
  canEditTeeSheet: ['CAPTAIN', 'SECRETARY'],
  
  // Finances
  canManageFinances: ['CAPTAIN', 'TREASURER'],
  canViewFinances: ['CAPTAIN', 'TREASURER', 'SECRETARY'],
  
  // Handicaps
  canEditHandicaps: ['CAPTAIN', 'HANDICAPPER'],
} as const;

/**
 * Get user's role in the active society
 */
export async function getUserRole(societyId: string, uid?: string): Promise<Role | null> {
  try {
    const userId = uid || auth.currentUser?.uid;
    if (!userId) return null;

    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;

    const societies = userDoc.data()?.societies || {};
    return societies[societyId]?.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(permission: keyof typeof PERMISSIONS, role: Role | null): boolean {
  if (!role) return false;
  return PERMISSIONS[permission].includes(role);
}

/**
 * Member management permissions
 */
export function canAddMember(role: Role | null): boolean {
  return hasPermission('canAddMember', role);
}

export function canRemoveMember(role: Role | null): boolean {
  return hasPermission('canRemoveMember', role);
}

export function canEditMemberRoles(role: Role | null): boolean {
  return hasPermission('canEditMemberRoles', role);
}

export function canEditMember(role: Role | null, targetUid: string): boolean {
  // Can edit own profile OR has permission to edit members
  const isOwnProfile = auth.currentUser?.uid === targetUid;
  return isOwnProfile || hasPermission('canAddMember', role);
}

/**
 * Society management permissions
 */
export function canManageSociety(role: Role | null): boolean {
  return hasPermission('canEditSocietySettings', role);
}

export function canDeleteSociety(role: Role | null): boolean {
  return hasPermission('canDeleteSociety', role);
}

/**
 * Event management permissions
 */
export function canCreateEvent(role: Role | null): boolean {
  return hasPermission('canCreateEvent', role);
}

export function canEditEvent(role: Role | null): boolean {
  return hasPermission('canEditEvent', role);
}

export function canPublishResults(role: Role | null): boolean {
  return hasPermission('canPublishResults', role);
}

/**
 * Finance permissions
 */
export function canManageFinances(role: Role | null): boolean {
  return hasPermission('canManageFinances', role);
}

export function canViewFinances(role: Role | null): boolean {
  return hasPermission('canViewFinances', role);
}

/**
 * Tee sheet permissions
 */
export function canManageTeeSheet(role: Role | null): boolean {
  return hasPermission('canUploadTeeSheet', role);
}

/**
 * Handicap permissions
 */
export function canEditHandicaps(role: Role | null): boolean {
  return hasPermission('canEditHandicaps', role);
}

/**
 * Check if role is ManCo (management committee)
 */
export function isManCo(role: Role | null): boolean {
  if (!role) return false;
  return ['CAPTAIN', 'TREASURER', 'SECRETARY', 'HANDICAPPER'].includes(role);
}

/**
 * Check if role is Captain
 */
export function isCaptain(role: Role | null): boolean {
  return role === 'CAPTAIN';
}

/**
 * Get all permissions for a role (for debugging)
 */
export function getRolePermissions(role: Role | null): string[] {
  if (!role) return [];
  
  return Object.entries(PERMISSIONS)
    .filter(([_, roles]) => roles.includes(role))
    .map(([permission]) => permission);
}
