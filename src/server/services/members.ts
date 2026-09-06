import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import type {
  DatabaseMemberRecord,
  DatabaseInviteRecord,
  MemberRole,
  UserInboxResponse,
  UserInboxInvite,
  SystemAnnouncement,
} from '../../../shared/index.js';

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
  public listMembers(databaseId: string, callerRole?: MemberRole | null): { members: DatabaseMemberRecord[]; invites: DatabaseInviteRecord[] } {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const members = metaDb.prepare(`
      SELECT m.id, m.database_id, m.user_id, m.role, m.invited_by, m.created_at, m.updated_at,
             u.username, u.email, u.avatar_url
      FROM database_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.database_id = ?
      ORDER BY m.created_at ASC
    `).all(databaseId) as any[];

    const canViewInvites = callerRole === 'owner' || callerRole === 'admin';
    const invites = canViewInvites
      ? (metaDb.prepare(`
          SELECT i.id, i.database_id, i.email, i.role, i.invited_by, i.status, i.created_at, i.expires_at,
                 d.name as database_name
          FROM database_invites i
          JOIN databases d ON i.database_id = d.id
          WHERE i.database_id = ? AND i.status = 'pending' AND i.expires_at > ?
          ORDER BY i.created_at DESC
        `).all(databaseId, now) as any[])
      : [];

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
   * Invite user by email or username to a database.
   * Creates a pending invitation for the recipient to explicitly Accept or Decline in their Inbox.
   */
  public inviteMember(
    databaseId: string,
    emailOrUsername: string,
    role: MemberRole = 'viewer',
    invitedBy: string
  ): { type: 'member' | 'invite'; record: any } {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const trimmedInput = emailOrUsername.trim();

    // Check database
    const db = metaDb.prepare('SELECT owner_id FROM databases WHERE id = ?').get(databaseId) as { owner_id: string | null } | undefined;
    if (!db) throw new Error('Database not found');

    // Check if target user already exists
    const targetUser = metaDb.prepare('SELECT id, username, email, avatar_url FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)').get(trimmedInput, trimmedInput) as
      | { id: string; username: string; email: string | null; avatar_url: string | null }
      | undefined;

    if (targetUser) {
      if (db.owner_id === targetUser.id) {
        throw new Error('User is already the owner of this database');
      }

      const existingMember = metaDb.prepare('SELECT id FROM database_members WHERE database_id = ? AND user_id = ?').get(databaseId, targetUser.id) as { id: string } | undefined;
      if (existingMember) {
        // Update existing member role directly
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

      // User exists but is not yet a member: create or update pending invitation for their inbox
      const email = (targetUser.email || `${targetUser.username}@local`).toLowerCase();
      const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
      const existingInvite = metaDb.prepare("SELECT id FROM database_invites WHERE database_id = ? AND (user_id = ? OR LOWER(email) = LOWER(?))").get(databaseId, targetUser.id, email) as { id: string } | undefined;

      if (existingInvite) {
        metaDb.prepare(`
          UPDATE database_invites
          SET role = ?, expires_at = ?, user_id = ?, username = ?, email = ?, invited_by = ?, status = 'pending', created_at = ?
          WHERE id = ?
        `).run(role, expiresAt, targetUser.id, targetUser.username, email, invitedBy, now, existingInvite.id);
        return {
          type: 'invite',
          record: {
            id: existingInvite.id,
            database_id: databaseId,
            user_id: targetUser.id,
            username: targetUser.username,
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
        INSERT INTO database_invites (id, database_id, email, user_id, username, role, invited_by, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(inviteId, databaseId, email, targetUser.id, targetUser.username, role, invitedBy, now, expiresAt);

      return {
        type: 'invite',
        record: {
          id: inviteId,
          database_id: databaseId,
          user_id: targetUser.id,
          username: targetUser.username,
          email,
          role,
          invited_by: invitedBy,
          status: 'pending',
          created_at: now,
          expires_at: expiresAt,
        },
      };
    }

    // User does not exist yet: require valid email format
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedInput);
    if (!isEmail) {
      throw new Error('User not found. Unregistered users must be invited by a valid email address.');
    }

    const email = trimmedInput.toLowerCase();
    const existingInvite = metaDb.prepare("SELECT id FROM database_invites WHERE database_id = ? AND LOWER(email) = ?").get(databaseId, email) as { id: string } | undefined;
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

    if (existingInvite) {
      metaDb.prepare(`
        UPDATE database_invites
        SET role = ?, expires_at = ?, invited_by = ?, status = 'pending', created_at = ?
        WHERE id = ?
      `).run(role, expiresAt, invitedBy, now, existingInvite.id);
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
   * Accept an invitation from Inbox -> commits member to database_members
   */
  public acceptInvite(inviteId: string, userId: string): DatabaseMemberRecord {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const user = metaDb.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId) as { id: string; username: string; email: string | null } | undefined;
    if (!user) throw new Error('User not found');

    const invite = metaDb.prepare('SELECT * FROM database_invites WHERE id = ?').get(inviteId) as any;
    if (!invite) throw new Error('Invitation not found');
    if (invite.status !== 'pending') throw new Error(`Invitation is already ${invite.status}`);
    if (invite.expires_at < now) throw new Error('Invitation has expired');

    const userEmail = (user.email || '').toLowerCase();
    const inviteEmail = (invite.email || '').toLowerCase();
    const isMatchingUser =
      invite.user_id === userId ||
      (invite.username && invite.username.toLowerCase() === user.username.toLowerCase()) ||
      (userEmail && inviteEmail && userEmail === inviteEmail);

    if (!isMatchingUser) {
      throw new Error('You do not have permission to accept this invitation');
    }

    const memberId = `mem_${nanoid(16)}`;
    metaDb.prepare(`
      INSERT INTO database_members (id, database_id, user_id, role, invited_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(database_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
    `).run(memberId, invite.database_id, userId, invite.role, invite.invited_by, now, now);

    metaDb.prepare("UPDATE database_invites SET status = 'accepted', user_id = ? WHERE id = ?").run(userId, inviteId);

    return {
      id: memberId,
      database_id: invite.database_id,
      user_id: userId,
      username: user.username,
      email: user.email,
      role: invite.role,
      invited_by: invite.invited_by,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Decline an invitation from Inbox
   */
  public declineInvite(inviteId: string, userId: string): void {
    const metaDb = getMetadataDb();
    const user = metaDb.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId) as { id: string; username: string; email: string | null } | undefined;
    if (!user) throw new Error('User not found');

    const invite = metaDb.prepare('SELECT * FROM database_invites WHERE id = ?').get(inviteId) as any;
    if (!invite) throw new Error('Invitation not found');
    if (invite.status !== 'pending') throw new Error(`Invitation is already ${invite.status}`);
    if (invite.expires_at < Date.now()) throw new Error('Invitation has expired');

    const userEmail = (user.email || '').toLowerCase();
    const inviteEmail = (invite.email || '').toLowerCase();
    const isMatchingUser =
      invite.user_id === userId ||
      (invite.username && invite.username.toLowerCase() === user.username.toLowerCase()) ||
      (userEmail && inviteEmail && userEmail === inviteEmail);

    if (!isMatchingUser) {
      throw new Error('You do not have permission to decline this invitation');
    }

    metaDb.prepare("UPDATE database_invites SET status = 'declined' WHERE id = ?").run(inviteId);
  }

  /**
   * Get complete Inbox for a user: pending database invites and active announcements
   */
  public getUserInbox(userId: string): UserInboxResponse {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const user = metaDb.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId) as { id: string; username: string; email: string | null } | undefined;
    if (!user) return { invites: [], announcements: [], unreadCount: 0 };

    const email = (user.email || '').toLowerCase();
    const invites = metaDb.prepare(`
      SELECT i.id, i.database_id, i.role, i.invited_by, i.status, i.created_at, i.expires_at,
             d.name as database_name, d.description as database_description,
             u.avatar_url as invited_by_avatar
      FROM database_invites i
      JOIN databases d ON i.database_id = d.id
      LEFT JOIN users u ON i.invited_by = u.username OR i.invited_by = u.id
      WHERE (i.user_id = ? OR LOWER(i.email) = ? OR LOWER(i.username) = LOWER(?))
        AND i.status = 'pending'
        AND i.expires_at > ?
      ORDER BY i.created_at DESC
    `).all(userId, email, user.username, now) as any[];

    const announcements = metaDb.prepare(`
      SELECT a.id, a.title, a.message, a.type, a.author_id, a.author_username,
             a.created_at, a.expires_at, a.pinned,
             CASE WHEN ura.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
      FROM system_announcements a
      LEFT JOIN user_read_announcements ura ON a.id = ura.announcement_id AND ura.user_id = ?
      WHERE a.expires_at IS NULL OR a.expires_at > ?
      ORDER BY a.pinned DESC, a.created_at DESC
    `).all(userId, now) as any[];

    const formattedInvites: UserInboxInvite[] = invites.map(i => ({
      id: i.id,
      database_id: i.database_id,
      database_name: i.database_name,
      database_description: i.database_description || null,
      role: i.role as MemberRole,
      invited_by: i.invited_by,
      invited_by_avatar: i.invited_by_avatar || null,
      created_at: i.created_at,
      expires_at: i.expires_at,
      status: i.status,
    }));

    const formattedAnnouncements: SystemAnnouncement[] = announcements.map(a => ({
      id: a.id,
      title: a.title,
      message: a.message,
      type: a.type,
      author_id: a.author_id,
      author_username: a.author_username,
      created_at: a.created_at,
      expires_at: a.expires_at || null,
      pinned: Boolean(a.pinned),
      is_read: Boolean(a.is_read),
    }));

    const unreadAnnouncementsCount = formattedAnnouncements.filter(a => !a.is_read).length;
    const unreadCount = formattedInvites.length + unreadAnnouncementsCount;

    return {
      invites: formattedInvites,
      announcements: formattedAnnouncements,
      unreadCount,
    };
  }

  /**
   * Mark an announcement as read by a user
   */
  public markAnnouncementRead(announcementId: string, userId: string): void {
    const metaDb = getMetadataDb();
    const now = Date.now();
    metaDb.prepare(`
      INSERT INTO user_read_announcements (user_id, announcement_id, read_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, announcement_id) DO UPDATE SET read_at = excluded.read_at
    `).run(userId, announcementId, now);
  }

  /**
   * Mark all active announcements as read by a user
   */
  public markAllAnnouncementsRead(userId: string): void {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const announcements = metaDb.prepare(`
      SELECT id FROM system_announcements WHERE expires_at IS NULL OR expires_at > ?
    `).all(now) as Array<{ id: string }>;

    const insert = metaDb.prepare(`
      INSERT INTO user_read_announcements (user_id, announcement_id, read_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, announcement_id) DO NOTHING
    `);

    try {
      metaDb.exec('BEGIN TRANSACTION;');
      for (const a of announcements) {
        insert.run(userId, a.id, now);
      }
      metaDb.exec('COMMIT;');
    } catch {
      try {
        metaDb.exec('ROLLBACK;');
      } catch {}
    }
  }

  /**
   * Create a system announcement (admin/super_admin)
   */
  public createAnnouncement(
    title: string,
    message: string,
    type: 'announcement' | 'maintenance' | 'security' | 'update' = 'announcement',
    authorId: string,
    authorUsername: string,
    expiresAt?: number | null,
    pinned: boolean = false
  ): SystemAnnouncement {
    const metaDb = getMetadataDb();
    const id = `ann_${nanoid(16)}`;
    const now = Date.now();
    metaDb.prepare(`
      INSERT INTO system_announcements (id, title, message, type, author_id, author_username, created_at, expires_at, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, message, type, authorId, authorUsername, now, expiresAt || null, pinned ? 1 : 0);

    return {
      id,
      title,
      message,
      type,
      author_id: authorId,
      author_username: authorUsername,
      created_at: now,
      expires_at: expiresAt || null,
      pinned,
      is_read: true,
    };
  }

  /**
   * Delete an announcement
   */
  public deleteAnnouncement(announcementId: string): void {
    const metaDb = getMetadataDb();
    metaDb.prepare('DELETE FROM system_announcements WHERE id = ?').run(announcementId);
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
    const res = metaDb.prepare("UPDATE database_invites SET status = 'revoked' WHERE id = ? AND database_id = ? AND status = 'pending'").run(inviteId, databaseId);
    return res.changes > 0;
  }

  /**
   * Claim any pending invites when a user registers with an email
   */
  public claimPendingInvites(userId: string, email: string): number {
    const metaDb = getMetadataDb();
    const user = metaDb.prepare('SELECT username FROM users WHERE id = ?').get(userId) as { username: string } | undefined;
    const res = metaDb.prepare(`
      UPDATE database_invites
      SET user_id = ?, username = COALESCE(username, ?)
      WHERE LOWER(email) = ? AND status = 'pending'
    `).run(userId, user?.username || null, email.toLowerCase());
    return Number(res.changes);
  }
}

export const databaseMembersService = new DatabaseMembersService();
