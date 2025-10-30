import { Request, Response } from 'express';
import Company from '../models/Company';

export const getFiscalHealth = async (req: Request, res: Response) => {
  try {
    const companyId = (req.query.companyId as string) || '';
    if (!companyId) {
      return res.status(400).json({ status: 'error', message: 'companyId is required' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ status: 'error', message: 'Company not found' });
    }

    const fiscalConfig = company.fiscalConfig || {} as any;
    const enabled = Boolean(fiscalConfig.enabled);

    if (!enabled) {
      return res.json({
        status: 'ok',
        enabled,
        connected: false,
        reason: 'disabled',
        checkedAt: new Date().toISOString(),
        details: {
          providerName: fiscalConfig.providerName || null,
          agentName: fiscalConfig.agentName || null,
          deviceSerial: fiscalConfig.deviceSerial || null,
          fdmsBaseUrl: fiscalConfig.fdmsBaseUrl || null
        }
      });
    }

    const fdmsBaseUrl: string | undefined = fiscalConfig.fdmsBaseUrl;

    // If we have an agent base URL, attempt a lightweight health probe
    if (fdmsBaseUrl) {
      let connected = false;
      let errorMessage: string | undefined;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const url = fdmsBaseUrl.replace(/\/$/, '') + '/health';
          const response = await fetch(url, { method: 'GET', signal: controller.signal });
          connected = response.ok;
        } finally {
          clearTimeout(timeout);
        }
      } catch (e: any) {
        connected = false;
        errorMessage = e?.message || 'Health probe failed';
      }

      return res.json({
        status: 'ok',
        enabled,
        connected,
        checkedAt: new Date().toISOString(),
        details: {
          providerName: fiscalConfig.providerName || null,
          agentName: fiscalConfig.agentName || null,
          deviceSerial: fiscalConfig.deviceSerial || null,
          fdmsBaseUrl,
          error: connected ? undefined : (errorMessage || 'Agent health endpoint not reachable')
        }
      });
    }

    // No agent URL; cannot verify connectivity programmatically
    return res.json({
      status: 'ok',
      enabled,
      connected: false,
      reason: 'no_agent_url',
      checkedAt: new Date().toISOString(),
      details: {
        providerName: fiscalConfig.providerName || null,
        agentName: fiscalConfig.agentName || null,
        deviceSerial: fiscalConfig.deviceSerial || null,
        fdmsBaseUrl: null
      }
    });
  } catch (error: any) {
    return res.status(500).json({ status: 'error', message: error?.message || 'Failed to check fiscal health' });
  }
};


