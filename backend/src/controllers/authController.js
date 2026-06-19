const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { poolPromise } = require('../config/db');
const { sendVerificationEmail } = require('../config/mail');

const JWT_SECRET = process.env.JWT_SECRET || 'b0d5427b16e23f4b032ba6332c6d6b3938a3d2e4c92e959a4fa9a1813a93e5d3';

const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const register = async (req, res) => {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [checkUser] = await pool.execute(
            'SELECT id, is_email_confirmed FROM Users WHERE email = ?',
            [email]
        );

        if (checkUser.length > 0) {
            const user = checkUser[0];
            if (user.is_email_confirmed) {
                return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
            } else {
                await pool.execute('DELETE FROM Users WHERE email = ? AND is_email_confirmed = 0', [email]);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const confirmationCode = generateVerificationCode();

        const [result] = await pool.execute(
            `INSERT INTO Users (email, password_hash, full_name, is_email_confirmed, email_confirmation_token, email_confirmation_sent_at)
             VALUES (?, ?, ?, 0, ?, NOW())`,
            [email, hashedPassword, full_name || null, confirmationCode]
        );

        const newUser = {
            id: result.insertId,
            email: email,
            full_name: full_name || null
        };

        // ========== ОТПРАВКА ПИСЬМА ОТКЛЮЧЕНА ==========
        // Для ускорения регистрации письмо не отправляется.
        // Код подтверждения всегда показывается на экране.
        console.log('✅ Регистрация успешна. Код подтверждения для', email, ':', confirmationCode);

        // Всегда возвращаем код на экран
        res.status(201).json({
            message: 'Регистрация успешна! Код подтверждения показан на экране.',
            user: newUser,
            needVerification: true,
            dev_code: confirmationCode  // Всегда передаём код
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
};

const verifyCode = async (req, res) => {
    const { email, code } = req.body;
    
    console.log('🔍 Получен запрос на подтверждение:');
    console.log('Email:', email);
    console.log('Code:', code);
    
    if (!email || !code) {
        return res.status(400).json({ error: 'Email и код обязательны' });
    }

    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `UPDATE Users 
             SET is_email_confirmed = 1, 
                 email_confirmed_at = NOW(),
                 email_confirmation_token = NULL
             WHERE email = ? 
             AND email_confirmation_token = ? 
             AND is_email_confirmed = 0`,
            [email, code]
        );

        console.log('Обновлено строк:', result.affectedRows);

        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Email подтверждён!' });
        } else {
            res.status(400).json({ error: 'Неверный код подтверждения' });
        }
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Ошибка подтверждения' });
    }
};

const resendCode = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email обязателен' });
    }

    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [user] = await pool.execute(
            'SELECT id, email, full_name FROM Users WHERE email = ? AND is_email_confirmed = 0',
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден или уже подтверждён' });
        }

        const newCode = generateVerificationCode();

        await pool.execute(
            'UPDATE Users SET email_confirmation_token = ?, email_confirmation_sent_at = NOW() WHERE email = ?',
            [newCode, email]
        );

        // Пытаемся отправить письмо
        const emailResult = await sendVerificationEmail(email, newCode, user[0].full_name || email.split('@')[0]);

        let dev_code = null;
        let message = 'Новый код отправлен на почту!';

        if (!emailResult.success) {
            dev_code = newCode;
            message = 'Не удалось отправить письмо. Код на экране.';
            console.log('⚠️ Письмо не отправлено, код на экране:', newCode);
        }

        res.json({ message, dev_code });

    } catch (error) {
        console.error('Resend error:', error);
        res.status(500).json({ error: 'Ошибка при отправке кода' });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `SELECT u.id, u.email, u.password_hash, u.full_name, u.is_email_confirmed,
                    r.name as role
             FROM Users u
             LEFT JOIN Roles r ON u.role_id = r.id
             WHERE u.email = ?`,
            [email]
        );

        if (result.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = result[0];

        if (!user.is_email_confirmed) {
            return res.status(401).json({ 
                error: 'Подтвердите email. Проверьте почту или запросите новый код.',
                needVerification: true,
                email: user.email
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        await pool.execute('UPDATE Users SET last_login = NOW() WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Вход выполнен успешно!',
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                is_email_confirmed: user.is_email_confirmed,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
};

const getProfile = async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `SELECT u.id, u.email, u.full_name, u.storage_used, u.storage_limit, 
                    u.is_email_confirmed, u.created_at, u.last_login,
                    r.name as role
             FROM Users u
             LEFT JOIN Roles r ON u.role_id = r.id
             WHERE u.id = ?`,
            [req.user.userId]
        );
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json(result[0]);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

module.exports = {
    register,
    verifyCode,
    resendCode,
    login,
    getProfile
};