# Coupon API Postman Test

Import `Oncab-Coupons.postman_collection.json` into Postman. The requests run sequentially in this order:

1. Admin login and store the access token.
2. Create a unique percentage coupon and store its ID.
3. Find the created coupon in the admin list.
4. Validate the coupon for a passenger and device.
5. Calculate a real fare with the coupon.
6. Create a booking and redeem the coupon.
7. Confirm passenger/device usage history.
8. Confirm the same passenger/device cannot reuse the coupon.

## Configure Before Running

Apply `../migrations/coupon_usage_limits.sql` and `../migrations/coupon_seat_limit.sql` to the target database first. Set collection variables in Postman:

- `baseUrl`: default is `http://localhost:4000/api2`; change it to the target API base URL as needed.
- `adminEmail` and `adminPassword`: an active admin account with coupon permissions.
- `scheduleId`, `tripId`, `originStopId`, `destinationStopId`: IDs for a real upcoming trip and its stops.
- `passengerId`, `passengerMobile`, `passengerEmail`: an existing active customer; the mobile must match that passenger record.

The collection uses fare `500`, a 10% discount, and a maximum discount of `200` in its coupon-validation sample. Adjust `fareAmount` if a route's actual fare differs. The fare calculation and booking requests use the real server-calculated fare.

The booking request reserves a seat and increments coupon usage. Use a non-production database and a disposable test passenger/trip. The last request is expected to return HTTP `400` because the coupon has a per-user limit of one.
