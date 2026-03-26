import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreditsService } from './credits.service';
import { BnbService } from '../bnb/bnb.service';

@Injectable()
export class CreditPollingService {
  private readonly logger = new Logger(CreditPollingService.name);

  constructor(
    private readonly creditsService: CreditsService,
    private readonly bnb: BnbService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollBnbPendingQrs() {
    if (!this.bnb.enabled) return;
    try {
      await this.creditsService.processPendingBnbPurchases();
    } catch (err) {
      this.logger.error('Error polling BNB pending QRs', err);
    }
  }
}
