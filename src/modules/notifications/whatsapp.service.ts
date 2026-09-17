import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendWhatsAppMessagePayload {
  to: string;
  message: string;
  templateName?: string;
  templateParams?: Record<string, string>;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiUrl: string | undefined;
  private readonly accessToken: string | undefined;
  private readonly phoneNumberId: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL');
    this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
  }

  /**
   * إرسال رسالة واتساب مباشرة إلى رقم المستلم.
   * في حال عدم توفر بيانات API يتم تسجيل الرسالة في الـ Logs كـ Sandbox/Mock.
   */
  async sendMessage(payload: SendWhatsAppMessagePayload): Promise<boolean> {
    const { to, message } = payload;

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.log(
        `[WhatsApp Mock Provider] Message to ${to}: "${message}"`,
      );
      return true;
    }

    try {
      const url = `${this.apiUrl || 'https://graph.facebook.com/v18.0'}/${this.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(
          `Failed to send WhatsApp message to ${to}. Status: ${response.status}. Body: ${errText}`,
        );
        return false;
      }

      this.logger.log(`WhatsApp message successfully dispatched to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error dispatching WhatsApp message to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
