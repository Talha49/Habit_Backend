const express = require('express');
const router = express.Router();
const authController = require('../../controllers/v1/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/request-otp', authController.requestOTP);
router.post('/verify-otp', authController.verifyOTP);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/links/invite', authController.createLinkInvite);
router.post('/links/accept', authController.acceptLinkInvite);
router.post('/links/revoke', authController.revokeLink);
router.get('/links', authController.listLinks);
router.get('/me', authController.getCurrentUser);
router.post('/update-push-token', authController.updatePushToken);

module.exports = router;
