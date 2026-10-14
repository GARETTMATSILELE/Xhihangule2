import { Notification } from '../models/Notification';
import { Property } from '../models/Property';
import { PropertyOwner } from '../models/PropertyOwner';
import { User } from '../models/User';

/**
 * In-app workflow notice. Email is skipped so a mail failure cannot be
 * reported as delivery, and a notification error never throws to the caller.
 */
export async function notifyOnce(
  companyId: string,
  userId: string | undefined,
  key: string,
  title: string,
  message: string
): Promise<void> {
  if (!companyId || !userId || !key) return;
  try {
    const existing = await Notification.findOne({
      companyId,
      userId,
      'payload.idempotencyKey': key,
    }).select('_id').lean();
    if (existing) return;
    await Notification.create({
      companyId,
      userId,
      title,
      message,
      read: false,
      payload: { idempotencyKey: key, skipEmail: true },
    });
  } catch (error) {
    console.warn('[agency-workflow] notification was not recorded');
  }
}

export async function notifyLandlord(
  companyId: string,
  propertyId: string,
  key: string,
  title: string,
  message: string
): Promise<void> {
  try {
    const property = await Property.findOne({ _id: propertyId, companyId }).select('propertyOwnerId').lean();
    const owner = property?.propertyOwnerId
      ? await PropertyOwner.findOne({ _id: property.propertyOwnerId, companyId }).select('email').lean()
      : await PropertyOwner.findOne({ companyId, properties: propertyId }).select('email').lean();
    if (!owner?.email) return;
    const user = await User.findOne({ email: owner.email, companyId, role: 'owner' }).select('_id').lean();
    await notifyOnce(companyId, user ? String(user._id) : undefined, key, title, message);
  } catch (error) {
    console.warn('[agency-workflow] landlord notification was not recorded');
  }
}

export async function notifyPropertyAgent(
  companyId: string,
  propertyId: string,
  key: string,
  title: string,
  message: string
): Promise<void> {
  try {
    const property = await Property.findOne({ _id: propertyId, companyId }).select('agentId').lean();
    await notifyOnce(companyId, property?.agentId ? String(property.agentId) : undefined, key, title, message);
  } catch (error) {
    console.warn('[agency-workflow] agent notification was not recorded');
  }
}
