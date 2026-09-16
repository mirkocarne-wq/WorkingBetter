import { Injectable, Logger } from '@nestjs/common';
import type { AutomationEventPayload } from '@wb/shared';

export type PlatformEventHandler = (event: AutomationEventPayload) => Promise<void>;

/**
 * Eventi di dominio in-process (ADR-0015): i moduli emettono, le automazioni ascoltano.
 * Gli handler girano nella stessa transazione dell'evento; un errore in un handler non fa fallire l'operazione di origine.
 */
@Injectable()
export class PlatformEventsService {
  private readonly log = new Logger('PlatformEvents');
  private readonly handlers: PlatformEventHandler[] = [];

  on(handler: PlatformEventHandler) {
    this.handlers.push(handler);
  }

  async emit(event: AutomationEventPayload): Promise<void> {
    for (const h of this.handlers) {
      try {
        await h(event);
      } catch (e) {
        this.log.warn(`handler ${event.type} fallito: ${(e as Error).message}`);
      }
    }
  }
}
