export type LeadMessageKind =
  | 'viewing_confirmation'
  | 'follow_up_reminder'
  | 'property_matches'
  | 'property_brochure'
  | 'application_request';

export interface LeadMessagePayload {
  leadId: string;
  leadName: string;
  phone?: string;
  email?: string;
  subject?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppProvider {
  id: 'meta_cloud' | 'twilio' | 'custom' | string;
  sendMessage(payload: LeadMessagePayload): Promise<void>;
}

export interface EmailProvider {
  id: 'smtp' | 'microsoft_365' | 'google_workspace' | 'custom' | string;
  sendEmail(payload: LeadMessagePayload): Promise<void>;
}

class LeadCommunicationService {
  private whatsappProvider?: WhatsAppProvider;
  private emailProvider?: EmailProvider;

  registerWhatsAppProvider(provider: WhatsAppProvider) {
    this.whatsappProvider = provider;
  }

  registerEmailProvider(provider: EmailProvider) {
    this.emailProvider = provider;
  }

  hasWhatsAppProvider() {
    return Boolean(this.whatsappProvider);
  }

  hasEmailProvider() {
    return Boolean(this.emailProvider);
  }

  async sendWhatsApp(payload: LeadMessagePayload) {
    if (!this.whatsappProvider) {
      throw new Error('WhatsApp provider is not configured');
    }
    await this.whatsappProvider.sendMessage(payload);
  }

  async sendEmail(payload: LeadMessagePayload) {
    if (!this.emailProvider) {
      throw new Error('Email provider is not configured');
    }
    await this.emailProvider.sendEmail(payload);
  }
}

export const leadCommunicationService = new LeadCommunicationService();
export default leadCommunicationService;
