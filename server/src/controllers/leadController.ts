import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Lead } from '../models/Lead';
import { AppError } from '../middleware/errorHandler';
import { hasAnyRole } from '../utils/access';
import { Buyer } from '../models/Buyer';
import { Deal } from '../models/Deal';
import { Property } from '../models/Property';
import { User } from '../models/User';

const norm = (s: any) => String(s || '').trim().toLowerCase();
const asNum = (v: any) => (v == null || v === '' || isNaN(Number(v)) ? undefined : Number(v));

function scorePropertyForLead(lead: any, p: any) {
  const reasons: string[] = [];
  let score = 0;

  const asking = Number(p?.price || p?.rent || 0);
  const leadMin = asNum(lead?.budgetMin);
  const leadMax = asNum(lead?.budgetMax);

  // Budget match
  if (asking > 0 && (leadMin != null || leadMax != null)) {
    const okMin = leadMin == null ? true : asking >= leadMin;
    const okMax = leadMax == null ? true : asking <= leadMax;
    if (okMin && okMax) {
      score += 40;
      reasons.push('Within budget');
    }
  }

  // Suburb / area match (string match against address/name)
  const suburbs: string[] = Array.isArray(lead?.preferredSuburbs) ? lead.preferredSuburbs : [];
  if (suburbs.length > 0) {
    const hay = `${p?.address || ''} ${p?.name || ''}`.toLowerCase();
    const hit = suburbs.map((x) => String(x || '').trim()).filter(Boolean).find((s) => hay.includes(s.toLowerCase()));
    if (hit) {
      score += 30;
      reasons.push(`Preferred suburb: ${hit}`);
    }
  }

  // Bedrooms match
  const minBedrooms = asNum(lead?.minBedrooms);
  const pBeds = asNum(p?.bedrooms) ?? 0;
  if (minBedrooms != null) {
    if (pBeds >= minBedrooms) {
      score += 20;
      reasons.push(`At least ${minBedrooms} bedrooms`);
    }
  }

  // Property type match
  const leadType = norm(lead?.propertyType);
  const propType = norm(p?.type);
  if (leadType && propType && leadType === propType) {
    score += 10;
    reasons.push(`Property type: ${p.type}`);
  }

  // Optional feature reasons (no score in Phase 1)
  const wantedFeatures: string[] = Array.isArray(lead?.features) ? lead.features : [];
  const amenities: string[] = Array.isArray(p?.amenities) ? p.amenities : [];
  if (wantedFeatures.length > 0 && amenities.length > 0) {
    const amenHay = amenities.map((a) => norm(a));
    const hits = wantedFeatures
      .map((f) => String(f || '').trim())
      .filter(Boolean)
      .filter((f) => amenHay.includes(norm(f)));
    hits.slice(0, 3).forEach((f) => reasons.push(`${f} available`));
  }

  // Clear flag for under offer
  if (String(p?.status) === 'under_offer') {
    reasons.push('Under Offer');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export const listLeads = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const query: any = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (!hasAnyRole(req, ['admin', 'accountant'])) {
      query.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }
    const leads = await Lead.find(query).sort({ createdAt: -1 });
    res.json({ status: 'success', data: leads });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch leads' });
  }
};

export const createLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const {
      name,
      source,
      interest,
      email,
      phone,
      status,
      notes,
      budgetMin,
      budgetMax,
      preferredSuburbs,
      propertyType,
      minBedrooms,
      features
    } = req.body;
    if (!name) throw new AppError('Name is required', 400);

    const lead = await Lead.create({
      name,
      source: source || '',
      interest: interest || '',
      notes: notes || '',
      email,
      phone,
      status: status || 'New',
      budgetMin: budgetMin != null && !isNaN(Number(budgetMin)) ? Number(budgetMin) : undefined,
      budgetMax: budgetMax != null && !isNaN(Number(budgetMax)) ? Number(budgetMax) : undefined,
      preferredSuburbs: Array.isArray(preferredSuburbs)
        ? preferredSuburbs.map((s: any) => String(s || '').trim()).filter(Boolean)
        : (typeof preferredSuburbs === 'string'
          ? preferredSuburbs.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined),
      propertyType: propertyType ? String(propertyType) : undefined,
      minBedrooms: minBedrooms != null && !isNaN(Number(minBedrooms)) ? Number(minBedrooms) : undefined,
      features: Array.isArray(features) ? features.map((f: any) => String(f || '').trim()).filter(Boolean) : undefined,
      companyId: req.user.companyId,
      ownerId: req.user.userId
    });
    res.status(201).json({ status: 'success', data: lead });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to create lead' });
  }
};

export const updateLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const updates = req.body || {};
    // Normalize optional requirement fields if present
    if ('budgetMin' in updates) {
      updates.budgetMin = updates.budgetMin != null && !isNaN(Number(updates.budgetMin)) ? Number(updates.budgetMin) : undefined;
    }
    if ('budgetMax' in updates) {
      updates.budgetMax = updates.budgetMax != null && !isNaN(Number(updates.budgetMax)) ? Number(updates.budgetMax) : undefined;
    }
    if ('minBedrooms' in updates) {
      updates.minBedrooms = updates.minBedrooms != null && !isNaN(Number(updates.minBedrooms)) ? Number(updates.minBedrooms) : undefined;
    }
    if ('preferredSuburbs' in updates) {
      updates.preferredSuburbs = Array.isArray(updates.preferredSuburbs)
        ? updates.preferredSuburbs.map((s: any) => String(s || '').trim()).filter(Boolean)
        : (typeof updates.preferredSuburbs === 'string'
          ? updates.preferredSuburbs.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined);
    }
    if ('features' in updates) {
      updates.features = Array.isArray(updates.features)
        ? updates.features.map((f: any) => String(f || '').trim()).filter(Boolean)
        : undefined;
    }
    const prev = await Lead.findOne({ _id: id, companyId: req.user.companyId });
    const lead = await Lead.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
    if (!lead) throw new AppError('Lead not found', 404);

    // If lead transitioned to Won, create a Buyer record tied to a property
    try {
      const becameWon = (updates?.status === 'Won') || (prev?.status !== 'Won' && lead.status === 'Won');
      if (becameWon) {
        // Determine propertyId: prefer explicit from request; fallback to a deal linked to this lead
        let propertyId: string | undefined = updates?.propertyId;
        if (!propertyId) {
          const deal = await Deal.findOne({ leadId: lead._id, companyId: req.user.companyId }).sort({ createdAt: -1 }).lean();
          if (deal) propertyId = String(deal.propertyId);
        }
        // Upsert buyer by email/phone/name within company
        const query: any = { companyId: req.user.companyId };
        if (lead.email) query.email = lead.email;
        else if (lead.phone) query.phone = lead.phone;
        else query.name = lead.name;
        let buyer = await Buyer.findOne(query);
        if (!buyer) {
          buyer = await Buyer.create({
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            prefs: lead.interest || '',
            propertyId: propertyId,
            companyId: req.user.companyId,
            ownerId: req.user.userId
          } as any);
          // If we have a valid propertyId, also set Property.buyerId for deterministic lookup.
          if (propertyId && mongoose.Types.ObjectId.isValid(String(propertyId))) {
            const propObjectId = new mongoose.Types.ObjectId(String(propertyId));
            await Property.updateOne(
              { _id: propObjectId, companyId: req.user.companyId },
              { $set: { buyerId: buyer._id } }
            );
            await Buyer.updateMany(
              { companyId: req.user.companyId, propertyId: propObjectId, _id: { $ne: buyer._id } },
              { $unset: { propertyId: '' } }
            );
          }
        } else if (propertyId) {
          // Attach/update property link and ensure Property.buyerId is set for payments.
          if (mongoose.Types.ObjectId.isValid(String(propertyId))) {
            const propObjectId = new mongoose.Types.ObjectId(String(propertyId));
            buyer.propertyId = propObjectId as any;
            // Fill missing fields where possible (do not overwrite existing values)
            if (!buyer.email && lead.email) buyer.email = lead.email;
            if (!buyer.phone && lead.phone) buyer.phone = lead.phone;
            if (!buyer.name && lead.name) buyer.name = lead.name;
            await buyer.save();

            await Property.updateOne(
              { _id: propObjectId, companyId: req.user.companyId },
              { $set: { buyerId: buyer._id } }
            );
            await Buyer.updateMany(
              { companyId: req.user.companyId, propertyId: propObjectId, _id: { $ne: buyer._id } },
              { $unset: { propertyId: '' } }
            );
          }
        }
      }
    } catch (e) {
      // Non-fatal: log and continue
      console.warn('Lead->Buyer sync failed:', e);
    }

    res.json({ status: 'success', data: lead });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to update lead' });
  }
};

export const deleteLead = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);
    const { id } = req.params;
    const lead = await Lead.findOneAndDelete({ _id: id, companyId: req.user.companyId });
    if (!lead) throw new AppError('Lead not found', 404);
    res.json({ status: 'success', message: 'Lead deleted' });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to delete lead' });
  }
};

export const getLeadSuggestedProperties = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) throw new AppError('Authentication required', 401);
    if (!req.user.companyId) throw new AppError('Company ID not found', 400);

    const { id } = req.params;
    const leadQuery: any = { _id: id, companyId: new mongoose.Types.ObjectId(req.user.companyId) };
    if (!hasAnyRole(req, ['admin', 'accountant'])) {
      leadQuery.ownerId = new mongoose.Types.ObjectId(req.user.userId);
    }

    const lead = await Lead.findOne(leadQuery).lean();
    if (!lead) throw new AppError('Lead not found', 404);

    const includeUnderOffer = String((req.query as any)?.includeUnderOffer || '1') !== '0';
    const statusFilter = includeUnderOffer ? ['available', 'under_offer'] : ['available'];

    const props = await Property.find({
      companyId: new mongoose.Types.ObjectId(req.user.companyId),
      rentalType: 'sale',
      status: { $in: statusFilter }
    })
      .select('_id name address price status bedrooms type amenities ownerId')
      .lean();

    const scored = (props || [])
      .map((p: any) => {
        const { score, reasons } = scorePropertyForLead(lead, p);
        return { p, score, reasons };
      })
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const listingAgentIds = Array.from(
      new Set(
        scored
          .map((x) => String(x?.p?.ownerId || ''))
          .filter(Boolean)
          .filter((oid) => oid !== String((lead as any)?.ownerId))
      )
    );

    const agents = listingAgentIds.length
      ? await User.find({ _id: { $in: listingAgentIds.map((x) => new mongoose.Types.ObjectId(x)) }, companyId: req.user.companyId })
          .select('_id firstName lastName email')
          .lean()
      : [];
    const agentById: Record<string, any> = {};
    (agents || []).forEach((u: any) => {
      agentById[String(u._id)] = u;
    });

    const suggestions = scored.map(({ p, score, reasons }) => {
      const ownerId = String((p as any)?.ownerId || '');
      const agent = ownerId ? agentById[ownerId] : undefined;
      const listingAgent =
        ownerId && ownerId !== String((lead as any)?.ownerId) && agent
          ? { id: ownerId, name: `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email || 'Agent' }
          : undefined;

      return {
        property: {
          _id: p._id,
          name: p.name,
          address: p.address,
          price: p.price,
          status: p.status,
          bedrooms: p.bedrooms,
          type: p.type,
          ownerId: p.ownerId
        },
        score,
        reasons,
        listingAgent
      };
    });

    res.json({ status: 'success', data: { leadId: id, suggestions } });
  } catch (error) {
    if (error instanceof AppError) return res.status(error.statusCode).json({ status: 'error', message: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to fetch suggested properties' });
  }
};


