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
    // Evento específico para el sheet que está esperando (por purchaseId)
    this.server.emit(`credit:confirmed:${purchaseId}`, { balance });
    // Evento genérico para que AppRoot refresque el balance del rider
    this.server.emit('credit:confirmed', { balance });
  }
}
