# Booking and Refund API Guide for Kotlin Apps

Base API URL (development): `https://oncab.in/bus-operator-dev/api2`

All request examples use JSON. Set `Content-Type: application/json` for POST requests. Public bus endpoints do not currently require an Authorization header.

Before deploying coupon usage tracking, apply `migrations/coupon_usage_limits.sql` and `migrations/coupon_seat_limit.sql` once to the database.

> Wallet and public booking endpoints currently identify passengers with `passenger_id` and registered `passenger_mobile`; this is not a substitute for verified passenger authentication. Do not treat the mobile number alone as secure proof of account ownership.

## Booking Flow

1. Search routes and schedules using `POST /bus/search-routes`.
2. Calculate the final fare using `POST /bus/calculate-fare`.
3. Create the booking using `POST /bus/create-booking`.
4. Choose either wallet payment during booking creation or PayU checkout after creating a pending booking.
5. Refresh booking state from the server after returning from the payment UI. Do not infer payment success solely from a client-side redirect.

`POST /bus/book-ticket` is an alias of `/bus/create-booking`.

### Create and pay from wallet

`POST /bus/create-booking`

```json
{
  "trip_id": 42,
  "passenger_id": 123,
  "passenger_name": "A Passenger",
  "passenger_mobile": "9876543210",
  "passenger_email": "passenger@example.com",
  "origin_stop_id": 5,
  "destination_stop_id": 12,
  "travel_date": "2026-10-05",
  "seat_numbers": ["A1", "A2"],
  "total_seats": 2,
  "payment_method": "wallet",
  "coupon_code": "WELCOME20",
  "device_id": "app-installation-id",
  "special_requests": null
}
```

Use `trip_id` or `schedule_id`; the backend resolves schedules to trips. `origin_stop_id`, `destination_stop_id`, and `travel_date` should be the selected route segment and service date. `payment_method: "wallet"` is equivalent to `use_wallet: true`.

On success, the response has HTTP `201`, a `data.booking_id`, booking reference and boarding details, `payment_status: "paid"`, and the updated `data.wallet_balance`. Wallet debit, payment record, booking, and seat reservation are committed together.

If the wallet cannot cover the full fare, the response is HTTP `409`:

```json
{
  "success": false,
  "message": "Insufficient wallet balance",
  "data": {
    "required_amount": 240.00,
    "wallet_balance": 150.00
  }
}
```

Wallet payment is all-or-nothing; partial wallet plus PayU payment is not supported. A wallet-paid booking is already paid and must not be sent to PayU.

### Create a pending booking for PayU

Create the booking with a non-wallet `payment_method` (for example `payu`). The response initially has `payment_status: "pending"`.

Then initialize PayU:

`POST /bus/payment/payu/initiate`

```json
{
  "booking_id": 987,
  "passenger_mobile": "9876543210"
}
```

The response's `data` contains:

- `action`: PayU checkout URL
- `method`: `POST`
- `fields`: signed PayU form values, including `hash`, `txnid`, `amount`, `surl`, and `furl`

Submit all returned `fields` to `action` using an HTTPS form POST in a WebView/custom tab or the app's approved PayU flow. Do not generate or change the hash in the app. The server validates PayU's signed callback and updates payment and booking status.

If `PAYU_RETURN_URL` is configured, PayU returns the user to that URL with result query parameters. These parameters are for UI navigation only; refresh the booking/payment status from the API before showing a final paid state.

### Fare calculation

### Fetch available coupons (public, no authentication)

`GET /bus/coupons`

Optional query parameters: `passenger_id`, `device_id`, `amount`, and `seat_count`. Pass the passenger and stable app-installation device IDs to hide coupons whose per-user or per-device limit that customer has reached. Pass `amount` and `seat_count` to also hide coupons that fail the minimum-fare or maximum-seats conditions. Without user/device IDs the endpoint cannot personalize usage limits.

The response `data` array contains only active, in-date coupons that have remaining global uses and pass any supplied filters.

`POST /bus/calculate-fare`

```json
{
  "schedule_id": 42,
  "origin_stop_id": 5,
  "destination_stop_id": 12,
  "seat_count": 2,
  "coupon_code": "WELCOME20",
  "passenger_id": 123,
  "device_id": "app-installation-id"
}
```

Coupon fields are optional. Send `coupon_code` (or `coupon_id`) and the same `passenger_id` and stable app-installation `device_id` to preview user/device limits. Success data includes `total_fare`, `discount_amount`, `final_amount`, `currency`, and the resolved rate source. The booking endpoint rechecks eligibility and records usage transactionally; never use a client-calculated amount as the amount to charge. Invalid or exhausted coupons return HTTP `400` with a reason in `message`.

### Read bookings

`POST /bus/user-bookings`

```json
{
  "passenger_id": 123,
  "passenger_mobile": "9876543210",
  "page": 1,
  "limit": 20
}
```

Optional filters include `booking_status` and `travel_date`. The response is a paginated `data` array. Each booking includes `booking_status`, `payment_status`, amount fields, trip/stop details, and tracking information where available.

### Read booking details

`POST /bus/booking-details`

Send one of `booking_id`, `booking_reference`, or `boarding_pass_code`. The response's `data` includes passenger/boarding details and payment/booking status. This endpoint currently does not require passenger identity, so avoid exposing booking identifiers or boarding credentials in logs or public links.

## Wallet

Before using booking passenger IDs as `users.id`, apply `migrations/passenger_ids_reference_users.sql` once. The wallet schema must also be installed by applying `migrations/passenger_wallet.sql` once.

### Read balance

`POST /bus/wallet/balance`

```json
{
  "passenger_id": 123,
  "passenger_mobile": "9876543210"
}
```

Success returns `data.balance` in INR.

### Read transaction history

`POST /bus/wallet/transactions`

Send the same passenger fields plus optional `page` and `limit`. The response contains newest-first ledger rows, current `balance`, and pagination. A transaction row has `type` (`credit` or `debit`), `amount`, `balance_after`, `source`, `reference_type`, `reference_id`, and `created_at`.

## Refunds

Refunds for paid bookings are credited to the wallet, not returned to the bank account. When an authorized operator/admin completes refund processing, the backend credits the wallet, adds a credit ledger row, marks the refund completed with `refund_method: "wallet"`, and updates booking/payment refund state transactionally. Repeating a completed refund request is rejected and must not issue another credit.

### Mobile cancellation limitation

There is currently **no registered passenger-facing cancel-booking/refund-request route** in `routes/busRoutes.js`. A cancellation handler exists in the controller but is not mounted. The registered admin endpoint `PATCH /api2/bookings/:id/cancel` requires an admin token and must not be called directly from the passenger app. Admin refund endpoints under `/api2/refunds` are also admin-authenticated. Until a passenger cancel endpoint is exposed with passenger ownership verification, the app cannot submit a cancellation/refund request through the public API.

There is also no passenger-facing refund-status endpoint yet. Admin processing credits the wallet; the app can show the new balance/history after a refresh, but should not claim a refund is complete before that credit appears.

## Kotlin request models

```kotlin
data class PassengerIdentity(
    val passenger_id: Long,
    val passenger_mobile: String
)

data class WalletBookingRequest(
    val trip_id: Long? = null,
    val schedule_id: Long? = null,
    val passenger_id: Long,
    val passenger_name: String,
    val passenger_mobile: String,
    val passenger_email: String? = null,
    val origin_stop_id: Long? = null,
    val destination_stop_id: Long? = null,
    val travel_date: String,
    val seat_numbers: List<String>,
    val total_seats: Int,
    val payment_method: String = "wallet",
    val coupon_id: Long? = null,
    val special_requests: String? = null
)
```

Map API error responses by HTTP status: `400` invalid/missing values, `404` unknown booking/passenger, `409` insufficient wallet funds or invalid booking/payment state, and `5xx` transient server/gateway failure. For PayU and wallet operations, refresh booking and wallet state after every result before updating durable app state.
