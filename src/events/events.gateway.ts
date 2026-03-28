import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  emitShopStatusChanged(shopId: string, status: string) {
    this.server.emit('shop:status_changed', { shopId, status });
  }

  emitNewDeliveryGroup(groupId: string) {
    this.server.emit('group:new', { groupId });
  }

  emitRiderStatusChanged(accountId: string, available: boolean) {
    this.server.emit('rider:status_changed', { accountId, available });
  }

  emitCreditConfirmed(purchaseId: string, balance: number) {
    this.server.emit(`credit:confirmed:${purchaseId}`, { balance });
    this.server.emit('credit:confirmed', { balance });
  }

  emitCreditRejected(purchaseId: string, reason?: string) {
    this.server.emit(`credit:rejected:${purchaseId}`, { reason: reason ?? null });
    this.server.emit('credit:rejected', { reason: reason ?? null });
  }

  emitRiderOrderDelivered(accountId: string) {
    this.server.emit(`rider:order_delivered:${accountId}`, {});
  }

  emitOrderUpdated() {
    this.server.emit('order:updated', {});
  }
}
