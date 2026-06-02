require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('Testing email...');
  console.log('EMAIL:', process.env.APP_EMAIL);
  console.log('PASS:', process.env.APP_PASS);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.APP_EMAIL,
      pass: process.env.APP_PASS
    },
    secure: true,
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    const result = await transporter.verify();
    console.log('Transporter verification successful:', result);
    
    // Optional: actually send an email to verify delivery
    const info = await transporter.sendMail({
      from: process.env.APP_EMAIL,
      to: process.env.APP_EMAIL,
      subject: 'Test Email',
      text: 'This is a test email to verify configuration.'
    });
    console.log('Test email sent:', info.response);
  } catch (error) {
    console.error('Email verification failed:', error);
  }
}

testEmail();
