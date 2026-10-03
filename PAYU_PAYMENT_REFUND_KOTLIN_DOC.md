# PayU Payment + Refund Integration Guide for Kotlin App Developers

This document explains how the Android/Kotlin app should interact with the backend for booking payments and refund processing.

## 1. Important security rule

Do not store or expose PayU merchant credentials in the Android app.

- Never store `PAYU_KEY`
- Never store `PAYU_SALT`
- Never send merchant secret values to the app
- The app must only get the checkout form fields from the backend and submit them to the PayU hosted checkout page

All sensitive credentials must remain on the backend server only.

---

## 2. Base URL

Use the backend base URL for all payment APIs.

```text
https://your-backend-domain.com
```

Example:

```text
https://api.example.com/api2/bus/payment/payu/initiate
```

---

## 3. Payment flow

### Step 1: Create booking

Before initiating payment, create the booking first.

Endpoint:

```http
POST /api2/bus/create-booking
```

Request body:

```json
{
  "trip_id": 12,
  "passenger_name": "John Doe",
  "passenger_mobile": "9876543210",
  "passenger_email": "john@example.com",
  "origin_stop_id": 3,
  "destination_stop_id": 7,
  "travel_date": "2026-10-10",
  "total_seats": 1,
  "payment_method": "payu",
  "special_requests": "Window seat"
}
```

Response example:

```json
{
  "success": true,
  "message": "Booking confirmed",
  "data": {
    "id": 101,
    "booking_reference": "BK-1234567890-123",
    "final_amount": 390.00,
    "payment_status": "pending"
  }
}
```

### Step 2: Start PayU checkout

Endpoint:

```http
POST /api2/bus/payment/payu/initiate
```

Request body:

```json
{
  "booking_id": 101,
  "passenger_mobile": "9876543210"
}
```

Response:

```json
{
  "success": true,
  "message": "PayU checkout initialized",
  "data": {
    "action": "https://test.payu.in/_payment",
    "method": "POST",
    "fields": {
      "key": "PAYU_MERCHANT_KEY",
      "txnid": "OC1721234567890",
      "amount": "390.00",
      "productinfo": "Booking BK-1234567890-123",
      "firstname": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "surl": "https://your-backend.example.com/api2/bus/payment/payu-callback",
      "furl": "https://your-backend.example.com/api2/bus/payment/payu-callback",
      "udf1": "101",
      "hash": "generated_payu_hash"
    }
  }
}
```

### Step 3: Open PayU payment page

The app should:

1. Receive the `data.action`, `data.method`, and `data.fields`
2. Build an HTML form or use a WebView
3. Submit the form to the returned `action` URL
4. Let the user complete the PayU payment flow in the browser/WebView

The app should not try to compute the PayU hash itself. The backend already computes it and sends it to the app.

### Step 4: Payment callback

The backend listens at:

```http
POST /api2/bus/payment/payu-callback
```

The backend validates:

- merchant key
- response hash
- payment amount
- booking id
- transaction status

Then it updates:

- `payments.status` to `captured` or `failed`
- `bookings.payment_status` to `paid` or `failed`
- `bookings.transaction_id` or payment ref id

### Step 5: Final redirect

After callback processing, the backend redirects to your configured return URL:

```text
PAYU_RETURN_URL
```

Example:

```text
https://your-app.example.com/payment-result?payment_status=success&txnid=OC1721234567890&booking_id=101
```

The app should read the redirect query params and display success/failure status to the user.

---

## 4. Kotlin app integration pattern

### Data class for initiate response

```kotlin
data class PayUInitiateResponse(
    val success: Boolean,
    val message: String,
    val data: PayUCheckoutData
)

data class PayUCheckoutData(
    val action: String,
    val method: String,
    val fields: PayUFields
)

data class PayUFields(
    val key: String,
    val txnid: String,
    val amount: String,
    val productinfo: String,
    val firstname: String,
    val email: String,
    val phone: String,
    val surl: String,
    val furl: String,
    val udf1: String,
    val hash: String
)
```

### API call example

```kotlin
val request = PayUInitiateRequest(
    booking_id = bookingId,
    passenger_mobile = mobileNumber
)
```

Then submit a POST request to:

```text
/api2/bus/payment/payu/initiate
```

Use `Retrofit`, `OkHttp`, or your app’s preferred HTTP client.

### WebView example

```kotlin
val webView = WebView(context)
webView.settings.javaScriptEnabled = true
webView.loadUrl("about:blank")

val formHtml = """
<html>
<body onload="document.forms[0].submit()">
  <form method="POST" action="${checkoutData.action}">
    <input type="hidden" name="key" value="${checkoutData.fields.key}" />
    <input type="hidden" name="txnid" value="${checkoutData.fields.txnid}" />
    <input type="hidden" name="amount" value="${checkoutData.fields.amount}" />
    <input type="hidden" name="productinfo" value="${checkoutData.fields.productinfo}" />
    <input type="hidden" name="firstname" value="${checkoutData.fields.firstname}" />
    <input type="hidden" name="email" value="${checkoutData.fields.email}" />
    <input type="hidden" name="phone" value="${checkoutData.fields.phone}" />
    <input type="hidden" name="surl" value="${checkoutData.fields.surl}" />
    <input type="hidden" name="furl" value="${checkoutData.fields.furl}" />
    <input type="hidden" name="udf1" value="${checkoutData.fields.udf1}" />
    <input type="hidden" name="hash" value="${checkoutData.fields.hash}" />
  </form>
</body>
</html>
"""

webView.loadDataWithBaseURL(null, formHtml, "text/html", "UTF-8", null)
```

---

## 5. Refund flow

### Refund lifecycle states

The backend refund model supports:

- `pending`
- `processing`
- `completed`
- `failed`

### How a refund is created

When a user cancels a paid booking, the backend creates a refund record automatically.

Example:

```http
POST /api2/bus/cancel-booking
```

If the booking was paid, a matching refund record is created in `pending` state.

### Process refund from backend/admin side

The admin/operator side uses:

```http
PATCH /api2/refunds/:id/process
```

Request body:

```json
{
  "notes": "Passenger cancelled ticket, refund requested"
}
```

For PayU payments, the backend calls the PayU refund API and updates the refund status to `processing`.

### Verify refund status

After initiating the refund, verify it using:

```http
PATCH /api2/refunds/:id/verify-payu
```

This checks the PayU refund result and then updates the refund to:

- `completed` if PayU confirms successful refund
- `failed` if PayU rejects or fails the refund

### Refund response example

```json
{
  "success": true,
  "message": "PayU refund initiated; verify its status before marking it complete",
  "data": {
    "id": 55,
    "refund_reference": "REF-1727781234567",
    "status": "processing",
    "refund_method": "payu"
  }
}
```

After verification:

```json
{
  "success": true,
  "message": "PayU refund status: completed",
  "data": {
    "id": 55,
    "status": "completed"
  }
}
```

---

## 6. Kotlin app responsibilities

The app should:

- create booking
- call PayU initiation API
- open checkout page
- read redirect result after success/failure
- show payment status to user
- on cancellation, request refund if a refund record exists in backend
- refresh refund status if the backend returns `processing`

The app should not:

- store merchant keys
- compute PayU hash locally
- directly call PayU APIs from the mobile app

---

## 7. Recommended payment result handling in Kotlin

```kotlin
sealed class PaymentResult {
    data class Success(
        val bookingId: Int,
        val txnId: String,
        val paymentStatus: String
    ) : PaymentResult()

    data class Failed(
        val bookingId: Int,
        val reason: String
    ) : PaymentResult()
}
```

On callback/redirect:

```kotlin
val paymentStatus = intent.data?.getQueryParameter("payment_status")
val txnId = intent.data?.getQueryParameter("txnid")
val bookingId = intent.data?.getQueryParameter("booking_id")
```

Then show UI state:

- success → show payment successful and ticket confirmed
- failed → show retry option or contact support

---

## 8. Recommended response and status mapping

| Backend status | Meaning | App action |
|---|---|---|
| `pending` | booking created, not yet paid | open PayU checkout |
| `paid` | payment captured successfully | show booking as confirmed |
| `failed` | payment failed | show retry / error |
| `processing` | refund started, waiting for PayU final status | show refund in progress |
| `completed` | refund confirmed | show refund approved |
| `refunded` | payment fully refunded | show refunded state |

---

## 9. Final developer checklist

- [ ] Booking created before payment
- [ ] App calls `/api2/bus/payment/payu/initiate`
- [ ] App submits returned form to PayU hosted checkout
- [ ] Backend verifies PayU callback hash and amount
- [ ] App reads redirect params from `PAYU_RETURN_URL`
- [ ] Cancellation creates refund record on backend
- [ ] Refund is verified via `/api2/refunds/:id/verify-payu`
- [ ] App never stores merchant secret keys

If you want, I can also generate:

1. a Kotlin Retrofit interface for this API, or
2. a full Android payment screen flow with WebView and redirect handling.
