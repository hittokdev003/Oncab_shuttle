const https = require('https');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZHJpdmVyX2lkIjoyLCJkcml2ZXJfdXNlcl9pZCI6bnVsbCwibmFtZSI6ImZnaGZnaCIsIm1vYmlsZSI6IjcwMjk3MjU5NzgiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzkxMTc3ODIyLCJleHAiOjE3OTM3Njk4MjJ9.ASzmkJgB44bh4DGrpF6z8LeSUqJfCvezzqVH4eWu3iI';

const data = JSON.stringify({});

const options = {
  hostname: 'oncab.in',
  path: '/bus-operator-dev/api2/bus-driver/available-schedules',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('No-Date Available Schedules Response:', body);
  });
});

req.write(data);
req.end();
