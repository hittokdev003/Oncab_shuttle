const https = require('https');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZHJpdmVyX2lkIjoyLCJkcml2ZXJfdXNlcl9pZCI6bnVsbCwibmFtZSI6ImZnaGZnaCIsIm1vYmlsZSI6IjcwMjk3MjU5NzgiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzkxMTc3ODIyLCJleHAiOjE3OTM3Njk4MjJ9.ASzmkJgB44bh4DGrpF6z8LeSUqJfCvezzqVH4eWu3iI';

const options = {
  hostname: 'oncab.in',
  path: '/bus-operator-dev/api2/bus-driver/profile',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Profile Response:', body);
  });
});

req.on('error', (e) => console.error(e));
req.end();
