'use strict';

const crypto = require('crypto');

const getPayUConfig = () => {
  const key = process.env.PAYU_KEY;
  const salt = process.env.PAYU_SALT; 
  console.log(key,salt);
  
  if (!key || !salt) throw new Error('PayU is not configured. Set PAYU_KEY and PAYU_SALT.');
  return {
    key,
    salt,
    checkoutUrl: process.env.PAYU_CHECKOUT_URL || 'https://test.payu.in/_payment',
    apiUrl: process.env.PAYU_API_URL || 'https://test.payu.in/merchant/postservice.php?form=2',
  };
};

const sha512 = (value) => crypto.createHash('sha512').update(value, 'utf8').digest('hex');

const paymentHash = ({ key, txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '', salt }) => (
  sha512([key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', salt].join('|'))
);

const responseHash = (response, salt) => {
  const parts = [
    ...(response.additionalCharges ? [response.additionalCharges] : []),
    salt,
    response.status || '',
    '', '', '', '', '',
    response.udf5 || '',
    response.udf4 || '',
    response.udf3 || '',
    response.udf2 || '',
    response.udf1 || '',
    response.email || '',
    response.firstname || '',
    response.productinfo || '',
    response.amount || '',
    response.txnid || '',
    response.key || '',
  ];
  return sha512(parts.join('|'));
};

const secureCompare = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
};

const apiHash = ({ key, command, var1, salt }) => sha512(`${key}|${command}|${var1}|${salt}`);

const postPayUCommand = async (command, var1, extra = {}) => {
  const config = getPayUConfig();
  const params = new URLSearchParams({
    key: config.key,
    command,
    var1: String(var1),
    hash: apiHash({ key: config.key, command, var1: String(var1), salt: config.salt }),
    ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, String(value)])),
  });
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.msg || result.message || 'PayU API request failed');
  return result;
};

const initiateRefund = ({ mihpayid, amount, refundToken }) => postPayUCommand(
  'cancel_refund_transaction',
  mihpayid,
  { var2: Number(amount).toFixed(2), var3: refundToken }
);

const checkRefundStatus = (requestId) => postPayUCommand('check_action_status', requestId);

module.exports = { getPayUConfig, sha512, paymentHash, responseHash, secureCompare, initiateRefund, checkRefundStatus };
