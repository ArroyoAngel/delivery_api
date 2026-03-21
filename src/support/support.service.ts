import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicketEntity } from './entities/support-ticket.entity';

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly tickets: Repository<SupportTicketEntity>,
  ) {}

  async createTicket(accountId: string, subject: string, message: string) {
    const ticket = this.tickets.create({ accountId, subject, message });
    return this.tickets.save(ticket);
  }

  async getMyTickets(accountId: string) {
    return this.tickets.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAllTickets(limit = 100, status?: string) {
    const qb = this.tickets
      .createQueryBuilder('t')
      .leftJoin('accounts', 'a', 'a.id = t.account_id')
      .addSelect('a.email', 'email')
      .orderBy('t.created_at', 'DESC')
      .limit(limit);

    if (status) qb.where('t.status = :status', { status });

    const raw = await qb.getRawAndEntities();

    return raw.entities.map((e, i) => ({
      ...e,
      email: raw.raw[i]?.email ?? null,
    }));
  }

  async updateTicket(
    id: string,
    status: string,
    adminNotes?: string,
  ) {
    const ticket = await this.tickets.findOneBy({ id });
    if (!ticket) throw new NotFoundException('Ticket no encontrado');
    ticket.status = status;
    if (adminNotes !== undefined) ticket.adminNotes = adminNotes;
    return this.tickets.save(ticket);
  }
}
