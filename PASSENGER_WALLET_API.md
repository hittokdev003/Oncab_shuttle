# Passenger Wallet API

Base path: `/api2/bus`

Apply `migrations/passenger_wallet.sql` and `migrations/passenger_ids_reference_users.sql` before deploying these endpoints. The second migration aligns booking/payment/refund passenger IDs with the `users` table.

## Read balance

`POST /wallet/balance`

```json
{
  "passenger_id": 123,
  "passenger_mobile": "9876543210"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "passenger_id": 123,
    "currency": "INR",
    "balance": 250.00
  }
}
```

## Read wallet transactions

`POST /wallet/transactions`

Use the same passenger identity fields and optional `page` / `limit` values. The response includes newest-first ledger entries, current balance, and pagination.

## Pay a booking with wallet

Include `use_wallet: true` in the existing `POST /create-booking` or `POST /book-ticket` body, plus the registered `passenger_id` and `passenger_mobile`. Wallet payment is all-or-nothing: the balance must cover `final_amount`. On success, the booking is `paid`, a captured wallet `Payment` and debit ledger transaction are created atomically, and the response includes the updated `wallet_balance`. Insufficient funds return HTTP 409 with `required_amount` and `wallet_balance`.

## Refunds

Admin refund processing at `PATCH /api2/refunds/:id/process` credits the passenger wallet. A successful response contains `refund_method: "wallet"` and the updated wallet balance. The balance update, ledger credit, refund completion, and payment/booking refund status updates share one database transaction. The unique ledger reference prevents duplicate credits on retries.

## Identity integration note

The current public mobile API has no passenger access-token/OTP authentication flow. Wallet endpoints therefore validate the supplied passenger ID and registered mobile pair, matching the existing booking API identity contract. Before exposing wallets with material balances in production, bind these calls to the mobile app's verified passenger session/token; an ID/mobile pair alone is not strong authentication.
