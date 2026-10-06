'use strict';

const https = require('https');

// In-memory OTP storage: mobile -> { otp, expiresAt }
const otpStore = new Map();

/**
 * Save OTP for a mobile number with TTL
 * @param {string} mobile 
 * @param {string|number} otp 
 * @param {number} ttlMinutes 
 */
const saveOtp = (mobile, otp, ttlMinutes = 10) => {
  const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  otpStore.set(cleanMobile, { otp: String(otp), expiresAt });
};

/**
 * Verify OTP code for a mobile number
 * @param {string} mobile 
 * @param {string|number} otp 
 * @returns {boolean}
 */
const verifyOtp = (mobile, otp) => {
  const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
  const record = otpStore.get(cleanMobile);
  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    otpStore.delete(cleanMobile);
    return false;
  }

  if (record.otp === String(otp).trim()) {
    otpStore.delete(cleanMobile);
    return true;
  }

  return false;
};

/**
 * Send OTP via Fast2SMS DLT gateway
 * @param {string} mobile 
 * @param {string|number} otp 
 * @returns {Promise<Object>}
 */
const sendFast2SMSOtp = (mobile, otp) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.FAST2SMS_API_KEY || 'hBcO4ElCs8FL6PjiNHVyq7Sd1XUTtKfM2Y9rv0omGuAIDwJWxapZEwiHzQNuPGWeTnm2kaotDhFRVJ9K';
    const senderId = process.env.FAST2SMS_SENDER_ID || 'HITTOK';
    const messageTemplate = process.env.FAST2SMS_MESSAGE_TEMPLATE || '203672';

    const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);

    const postData = JSON.stringify({
      route: 'dlt',
      sender_id: senderId,
      message: messageTemplate,
      variables_values: String(otp),
      flash: 0,
      numbers: cleanMobile,
    });

    const options = {
      hostname: 'www.fast2sms.com',
      port: 443,
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ return: false, message: data });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[SMS Service Error]:', err.message);
      resolve({ return: false, message: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ return: false, message: 'Request timeout' });
    });

    req.write(postData);
    req.end();
  });
};

module.exports = {
  saveOtp,
  verifyOtp,
  sendFast2SMSOtp,
};
