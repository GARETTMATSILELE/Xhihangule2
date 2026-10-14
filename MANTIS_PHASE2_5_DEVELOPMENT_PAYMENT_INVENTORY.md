# Phase 2.5 development payment inventory

Local `property-management.payments`. 162 documents. None were updated.

## Type and domain

Every payment is missing `transactionDomain`. Fallback uses `paymentType`.

| paymentType | Stored transactionDomain | Count | Fallback domain |
| --- | --- | ---: | --- |
| rental | missing | 84 | RENTAL |
| introduction | missing | 6 | RENTAL |
| sale | missing | 72 | SALE |

Contradictions between `paymentType` and a stored domain: 0, because no domain is stored.

Payments whose fallback domain differs from the property's current `rentalType`: 0.

## Completed accounting flags

| | Count |
| --- | ---: |
| Completed | 155 |
| accountingComplete true | 2 |
| accountingComplete false | 1 |
| accountingComplete missing | 152 |

The false payment is `6aad38ad8586d1d64c4bd5df`, rental, amount 500, accounting status `incomplete`, owner income absent. The integrity job already reports that gap. It is not marked complete.

## Cash with no owner income

11 completed payments with positive `amount` and no owner-income line:

- 6 introduction payments, owner amounts populated, no ledger line, no trust row
- `692d95e22442ee2a23b8b12b` rental, amount 800, deposit 800, owner amount 0
- `6965f6653f75a1f46fa11b80` rental, amount 200, owner amount 0
- `6aad38a0dd00586abc5daa70` and `6aad38a4dd00586abc5daab4` rental, amount 500, owner amount 500
- `6aad38ad8586d1d64c4bd5df` rental, amount 500, owner amount 425, `accountingComplete` false

## Deposits

| Shape | Count | Income present |
| --- | ---: | --- |
| amount > 0 and deposit > 0 | 19 | 18 |
| amount <= 0 and deposit > 0 | 4 | 0 |
| amount > 0 and deposit = 0 | 134 | — |

## Trust linked to payments

| Class | Count |
| --- | ---: |
| SALE | 67 |
| RENTAL | 11 |
| INTRODUCTION | 0 |

Rental buyer-trust payment ids, not reversed:

- `699d5f53d8858aa4cfb34079` credit 800
- `69a9748976485a201c941648` credit 1400
- `69aabbbdb77cb18d366b2ef9` credit 800
- `69e0ba905c387a08121670dc` credit 800
- `69e0be4d5c387a0812167598` credit 10
- `6a1ea88042b7a73860322593` credit 1100
- `6a3512b364e5210d95f35d2b` credit 650
- `6a366b3a4d08bf74915a1ff7` credit 550
- `6a4cffc90375ea7aa0affe76` credit 1100
- `6a881a49059b47c43e716211` credit 2000
- `6aad38ad8586d1d64c4bd5df` credit 500

## Commission and journals

```text
Sale payments whose company line is rental_commission and not sales_commission: 45
Rental payments posted as sales_commission: 0
Completed positive-cash payments with no journal: 129
Completed positive-cash payments whose journal module disagrees with the fallback domain: 0
```

## Reversals

5 payments have a reversal link. No existing pair shows a payment domain that differs from the property's current type, so a domain-change reversal was not present to observe.
