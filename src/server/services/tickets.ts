import { nanoid } from 'nanoid';
import type { ApiTokenRecord } from '../../../shared/index.js';

export interface OneTimeTicketRecord {
  id: string;
  tokenId: string;
  databaseId: string;
  routeScope: 'realtime' | 'storage' | 'view' | 'any';
  createdAt: number;
  expiresAt: number;
  used: boolean;
  tokenRecord: ApiTokenRecord;
}

export class TicketService {
  private tickets = new Map<string, OneTimeTicketRecord>();

  constructor() {
    // Periodically clean up expired tickets every 30 seconds
    setInterval(() => {
      const now = Date.now();
      for (const [id, ticket] of this.tickets.entries()) {
        if (now > ticket.expiresAt || ticket.used) {
          this.tickets.delete(id);
        }
      }
    }, 30 * 1000).unref();
  }

  public createTicket(params: {
    tokenRecord: ApiTokenRecord;
    databaseId: string;
    routeScope?: 'realtime' | 'storage' | 'view' | 'any';
    ttlMs?: number;
  }): { ticket: string; expiresAt: number; expiresInSeconds: number } {
    const id = `vdb_ticket_${nanoid(24)}`;
    const now = Date.now();
    const ttlMs = params.ttlMs || 60_000; // 60 seconds default TTL
    const expiresAt = now + ttlMs;

    const record: OneTimeTicketRecord = {
      id,
      tokenId: params.tokenRecord.id,
      databaseId: params.databaseId,
      routeScope: params.routeScope || 'any',
      createdAt: now,
      expiresAt,
      used: false,
      tokenRecord: params.tokenRecord,
    };

    this.tickets.set(id, record);

    return {
      ticket: id,
      expiresAt,
      expiresInSeconds: Math.round(ttlMs / 1000),
    };
  }

  /**
   * Consume ticket atomically. Only returns tokenRecord if ticket is valid, matching database & scope,
   * not expired, and not yet used. Marks used immediately and removes.
   */
  public consumeTicket(ticketId: string, databaseId: string, routeScope: 'realtime' | 'storage' | 'view'): ApiTokenRecord | null {
    if (!ticketId || typeof ticketId !== 'string' || !ticketId.startsWith('vdb_ticket_')) {
      return null;
    }

    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;

    const now = Date.now();
    if (ticket.used || now > ticket.expiresAt) {
      this.tickets.delete(ticketId);
      return null;
    }

    if (ticket.databaseId !== databaseId) {
      return null;
    }

    if (ticket.routeScope !== 'any' && ticket.routeScope !== routeScope) {
      return null;
    }

    // Mark used and remove immediately to enforce single-use
    ticket.used = true;
    this.tickets.delete(ticketId);

    return ticket.tokenRecord;
  }
}

export const ticketService = new TicketService();
