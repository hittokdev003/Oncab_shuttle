'use strict';

const { saveOtp, verifyOtp, sendFast2SMSOtp } = require('../services/smsService');

async function test() {
  console.log('Testing OTP Service...');

  const mobile = '9062498005';
  const testOtp = '7890';

  saveOtp(mobile, testOtp, 5);
  console.log('1. Verify correct OTP:', verifyOtp(mobile, testOtp)); // should be true
  console.log('2. Verify second time (should be consumed):', verifyOtp(mobile, testOtp)); // should be false

  // Test Fast2SMS dry call
  saveOtp(mobile, '4321', 5);
  console.log('3. Fast2SMS sending real OTP...');
  const res = await sendFast2SMSOtp(mobile, '4321');
  console.log('Fast2SMS response:', res);
}

test().catch(console.error);
