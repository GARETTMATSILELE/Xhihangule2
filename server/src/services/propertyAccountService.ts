import PropertyAccount from '../models/PropertyAccount';
import { Payment } from '../models/Payment';

export async function syncPaymentsToPropertyAccounts() {
  const payments = await Payment.find().sort({ paymentDate: 1 }); // oldest first

  for (const payment of payments) {
    const propertyId = payment.propertyId;
    const ownerAmount = payment.commissionDetails?.ownerAmount;
    const paymentDate = payment.paymentDate;

    if (!propertyId || !ownerAmount || !paymentDate) continue;

    let account = await PropertyAccount.findOne({ propertyId });
    if (!account) {
      account = new PropertyAccount({ propertyId, transactions: [], runningBalance: 0 });
    }

    // Prevent duplicate payment
    const alreadyExists = account.transactions.some(
      (t) => t.paymentId?.toString() === payment._id.toString()
    );
    if (alreadyExists) continue;

    account.transactions.push({
      type: 'income',
      amount: ownerAmount,
      date: paymentDate,
      paymentId: payment._id
    });

    // Sort and recalculate running balance
    account.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    account.runningBalance = account.transactions.reduce((sum, t) => {
      return t.type === 'income' ? sum + t.amount : sum - t.amount;
    }, 0);
    account.lastUpdated = new Date();

    await account.save();
  }
} 