const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'b0d5427b16e23f4b032ba6332c6d6b3938a3d2e4c92e959a4fa9a1813a93e5d3';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный или просроченный токен' });
        }
        req.user = user;
        next();
    });
};

module.exports = { authenticateToken };