const https = require('https');

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZHJpdmVyX2lkIjoyLCJkcml2ZXJfdXNlcl9pZCI6bnVsbCwibmFtZSI6ImZnaGZnaCIsIm1vYmlsZSI6IjcwMjk3MjU5NzgiLCJyb2xlIjoiZHJpdmVyIiwiaWF0IjoxNzkxMTc3ODIyLCJleHAiOjE3OTM3Njk4MjJ9.ASzmkJgB44bh4DGrpF6z8LeSUqJfCvezzqVH4eWu3iI';

function testDate(dateStr) {
  const data = JSON.stringify({ assignment_date: dateStr });
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
      console.log(`Date [${dateStr}] Status:`, res.statusCode, 'Body:', body);
    });
  });

  req.write(data);
  req.end();
}

testDate('2026-10-05');
testDate('2026-10-06');
testDate('2026-10-07');
