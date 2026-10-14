const fs = require('fs');
const http = require('http');

async function testPhotoUpload() {
  // 1. Register test user
  const user = await new Promise((resolve, reject) => {
    const data = JSON.stringify({
      email: `photouser_${Date.now()}@test.com`,
      password: 'password123',
      name: 'Photo User',
      role: 'prime'
    });
    const req = http.request('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  const token = user.token;
  console.log('Got user token:', token ? 'OK' : 'FAIL');

  // 2. Upload multipart file
  const boundary = '----LifeOSBoundary' + Date.now();
  const fileContent = 'Dr. Sharma Clinic: Dental checkup confirmed tomorrow at 10:00 am.';
  const payload = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="photo"; filename="appointment.txt"',
    'Content-Type: text/plain',
    '',
    fileContent,
    `--${boundary}`,
    'Content-Disposition: form-data; name="note"',
    '',
    'Dental visit card',
    `--${boundary}--`
  ].join('\r\n');

  const uploadResult = await new Promise((resolve, reject) => {
    const req = http.request('http://localhost:5000/api/captures/photo', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Authorization': `Bearer ${token}`
      }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(b) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  console.log('Upload HTTP status:', uploadResult.status);
  console.log('Scheduled Task Title:', uploadResult.data.task ? uploadResult.data.task.title : 'None');
  console.log('Scheduled Task Time:', uploadResult.data.task ? uploadResult.data.task.time : 'None');
  console.log('Capture Status:', uploadResult.data.analysis.status);

  if (uploadResult.status === 201 && uploadResult.data.task && uploadResult.data.task.time === '10:00') {
    console.log('✅ PHOTO / DOCUMENT UPLOAD & AI EXTRACTION TEST PASSED!');
  } else {
    console.error('❌ Photo upload test failed');
    process.exit(1);
  }
}

testPhotoUpload().catch(err => {
  console.error(err);
  process.exit(1);
});
