import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import type { DatabaseMemberRecord, DatabaseInviteRecord, MemberRole } from '../../../shared/index.js';

export class DatabaseMembersService {
  /**
   * Check user's access level on a specific database
   */
  public getUserDatabaseRole(databaseId: string, userId: string, systemRole?: string): MemberRole | null {
    if (systemRole === 'super_admin' || systemRole === 'admin') {
      return 'owner';
    }

    const metaDb = getMetadataDb();
    const db = metaDb.prepare('SELECT owner_id FROM databases WHERE id = ?').get(databaseId) as { owner_id: string | null } | undefined;
    if (!db) return null;

    if (db.owner_id === userId) {
      return 'owner';
    }

    const member = metaDb.prepare('SELECT role FROM database_members WHERE database_id = ? AND user_id = ?').get(databaseId, userId) as { role: string } | undefined;
    if (member) {
      return (member.role as MemberRole) || 'viewer';
    }

    return null;
  }

  /**
   * List all members of a database plus pending invites
   */
  public listMembers(databaseId: string): { members: DatabaseMemberRecord[]; invites: DatabaseInviteRecord[] } {
    const metaDb = getMetadataDb();
    const members = metaDb.prepare(`
      SELECT m.id, m.database_id, m.user_id, m.role, m.invited_by, m.created_at, m.updated_at,
             u.username, u.email, u.avatar_url
      FROM database_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.database_id = ?
      ORDER BY m.created_at ASC
    `).all(databaseId) as any[];

    const invites = metaDb.prepare(`
      SELECT i.id, i.database_id, i.email, i.role, i.invited_by, i.status, i.created_at, i.expires_at,
             d.name as database_name
      FROM database_invites i
      JOIN databases d ON i.database_id = d.id
      WHERE i.database_id = ? AND i.status = 'pending'
      ORDER BY i.created_at DESC
    `).all(databaseId) as any[];

    return {
      members: members.map(m => ({
        id: m.id,
        database_id: m.database_id,
        user_id: m.user_id,
        username: m.username,
        email: m.email || null,
        avatar_url: m.avatar_url || null,
        role: m.role as MemberRole,
        invited_by: m.invited_by,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })),
      invites: invites.map(i => ({
        id: i.id,
        database_id: i.database_id,
        database_name: i.database_name,
        email: i.email,
        role: i.role as MemberRole,
        invited_by: i.invited_by,
        status: i.status as any,
        created_at: i.created_at,
        expires_at: i.expires_at,
      })),
    };
  }

  /**
   * Invite user by email or username to a database
   */
  public inviteMember(
    databaseId: string,
    emailOrUsername: string,
    role: MemberRole = 'viewer',
    invitedBy: string
  ): { type: 'member' | 'invite'; record: any } {
    const metaDb = getMetadataDb();
    const now = Date.now();

    // Check if target user already exists
    const targetUser = metaDb.prepare('SELECT id, username, email, avatar_url FROM users WHERE username = ? OR email = ?').get(emailOrUsername, emailOrUsername) as
      | { id: string; username: string; email: string | null; avatar_url: string | null }
      | undefined;

    // Check database owner
    const db = metaDb.prepare('SELECT owner_id FROM databases WHERE id = ?').get(databaseId) as { owner_id: string | null } | undefined;
    if (!db) throw new Error('Database not found');

    if (targetUser) {
      if (db.owner_id === targetUser.id) {
        throw new Error('User is already the owner of this database');
      }

      const existingMember = metaDb.prepare('SELECT id FROM database_members WHERE database_id = ? AND user_id = ?').get(databaseId, targetUser.id) as { id: string } | undefined;
      if (existingMember) {
        // Update role
        metaDb.prepare('UPDATE database_members SET role = ?, updated_at = ? WHERE id = ?').run(role, now, existingMember.id);
        return {
          type: 'member',
          record: {
            id: existingMember.id,
            database_id: databaseId,
            user_id: targetUser.id,
            username: targetUser.username,
            email: targetUser.email,
            avatar_url: targetUser.avatar_url,
            role,
            invited_by: invitedBy,
            created_at: now,
            updated_at: now,
          },
        };
      }

      const memberId = `mem_${nanoid(16)}`;
      metaDb.prepare(`
        INSERT INTO database_members (id, database_id, user_id, role, invited_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(memberId, databaseId, targetUser.id, role, invitedBy, now, now);

      return {
        type: 'member',
        record: {
          id: memberId,
          database_id: databaseId,
          user_id: targetUser.id,
          username: targetUser.username,
          email: targetUser.email,
          avatar_url: targetUser.avatar_url,
          role,
          invited_by: invitedBy,
          created_at: now,
          updated_at: now,
        },
      };
    }

    // If user does not exist yet, create a pending database invite by email
    const email = emailOrUsername.toLowerCase();
    const existingInvite = metaDb.prepare("SELECT id FROM database_invites WHERE database_id = ? AND email = ? AND status = 'pending'").get(databaseId, email) as { id: string } | undefined;
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

    if (existingInvite) {
      metaDb.prepare('UPDATE database_invites SET role = ?, expires_at = ? WHERE id = ?').run(role, expiresAt, existingInvite.id);
      return {
        type: 'invite',
        record: {
          id: existingInvite.id,
          database_id: databaseId,
          email,
          role,
          invited_by: invitedBy,
          status: 'pending',
          created_at: now,
          expires_at: expiresAt,
        },
      };
    }

    const inviteId = `inv_${nanoid(16)}`;
    metaDb.prepare(`
      INSERT INTO database_invites (id, database_id, email, role, invited_by, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(inviteId, databaseId, email, role, invitedBy, now, expiresAt);

    return {
      type: 'invite',
      record: {
        id: inviteId,
        database_id: databaseId,
        email,
        role,
        invited_by: invitedBy,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
      },
    };
  }

  /**
   * Remove member from database
   */
  public removeMember(databaseId: string, memberOrUserId: string): boolean {
    const metaDb = getMetadataDb();
    metaDb.prepare('DELETE FROM database_members WHERE database_id = ? AND (id = ? OR user_id = ?)').run(databaseId, memberOrUserId, memberOrUserId);
    return true;
  }

  /**
   * Revoke invite scoped to a database
   */
  public revokeInvite(databaseId: string, inviteId: string): boolean {
    const metaDb = getMetadataDb();
    const res = metaDb.prepare("UPDATE database_invites SET status = 'revoked' WHERE id = ? AND database_id = ?").run(inviteId, databaseId);
    return res.changes > 0;
  }

  /**
   * Claim any pending invites when a user registers with an email
   */
  public claimPendingInvites(userId: string, email: string): number {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const invites = metaDb.prepare("SELECT id, database_id, role, invited_by FROM database_invites WHERE email = ? AND status = 'pending' AND expires_at > ?").all(email.toLowerCase(), now) as Array<{
      id: string;
      database_id: string;
      role: string;
      invited_by: string;
    }>;

    for (const inv of invites) {
      const memberId = `mem_${nanoid(16)}`;
      try {
        metaDb.prepare(`
          INSERT INTO database_members (id, database_id, user_id, role, invited_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(memberId, inv.database_id, userId, inv.role, inv.invited_by, now, now);
        metaDb.prepare("UPDATE database_invites SET status = 'accepted' WHERE id = ?").run(inv.id);
      } catch {}
    }

    return invites.length;
  }
}

export const databaseMembersService = new DatabaseMembersService();
