const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
    register,
    verifyCode,
    resendCode,
    login,
    getProfile
} = require('../controllers/authController');

// Публичные маршруты
router.post('/register', register);
router.post('/verify-code', verifyCode);
router.post('/resend-code', resendCode);
router.post('/login', login);

// Защищённые маршруты
router.get('/profile', authenticateToken, getProfile);
router.get('/verify-token', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

module.exports = router;