const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { poolPromise, sql } = require('../config/db');
const { sendVerificationEmail } = require('../config/mail');

const JWT_SECRET = process.env.JWT_SECRET || 'b0d5427b16e23f4b032ba6332c6d6b3938a3d2e4c92e959a4fa9a1813a93e5d3';

// Генерация 6-значного кода
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Регистрация
const register = async (req, res) => {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        const pool = await poolPromise;

        const checkUser = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id, is_email_confirmed FROM Users WHERE email = @email');

        if (checkUser.recordset.length > 0) {
            const user = checkUser.recordset[0];
            if (user.is_email_confirmed) {
                return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
            } else {
                await pool.request()
                    .input('email', sql.NVarChar, email)
                    .query('DELETE FROM Users WHERE email = @email AND is_email_confirmed = 0');
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const confirmationCode = generateVerificationCode();

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('password_hash', sql.NVarChar, hashedPassword)
            .input('full_name', sql.NVarChar, full_name || null)
            .input('confirmation_code', sql.NVarChar, confirmationCode)
            .query(`
                INSERT INTO Users (email, password_hash, full_name, is_email_confirmed, email_confirmation_token, email_confirmation_sent_at)
                VALUES (@email, @password_hash, @full_name, 0, @confirmation_code, GETDATE());
                SELECT SCOPE_IDENTITY() AS id, @email AS email, @full_name AS full_name;
            `);

        const newUser = {
            id: result.recordset[0].id,
            email: result.recordset[0].email,
            full_name: result.recordset[0].full_name
        };

        try {
            await sendVerificationEmail(email, confirmationCode, full_name || email.split('@')[0]);
            console.log('✅ Код подтверждения для', email, ':', confirmationCode);
        } catch (mailError) {
            console.error('Failed to send email:', mailError);
        }

        res.status(201).json({
            message: 'Регистрация успешна! Введите 6-значный код подтверждения.',
            user: newUser,
            needVerification: true,
            dev_code: confirmationCode
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
};

// Подтверждение email по коду
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

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('code', sql.NVarChar, code)
            .query(`
                UPDATE Users 
                SET is_email_confirmed = 1, 
                    email_confirmed_at = GETDATE(),
                    email_confirmation_token = NULL
                WHERE email = @email 
                AND email_confirmation_token = @code 
                AND is_email_confirmed = 0;
                SELECT @@ROWCOUNT AS updated;
            `);

        console.log('Результат обновления (updated):', result.recordset[0].updated);

        if (result.recordset[0].updated > 0) {
            res.json({ success: true, message: 'Email подтверждён!' });
        } else {
            res.status(400).json({ error: 'Неверный код подтверждения' });
        }
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Ошибка подтверждения' });
    }
};

// Повторная отправка кода
const resendCode = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email обязателен' });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id, email, full_name FROM Users WHERE email = @email AND is_email_confirmed = 0');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден или уже подтверждён' });
        }

        const user = result.recordset[0];
        const newCode = generateVerificationCode();

        await pool.request()
            .input('code', sql.NVarChar, newCode)
            .input('email', sql.NVarChar, email)
            .query('UPDATE Users SET email_confirmation_token = @code, email_confirmation_sent_at = GETDATE() WHERE email = @email');

        await sendVerificationEmail(email, newCode, user.full_name || email.split('@')[0]);
        console.log('✅ Новый код подтверждения для', email, ':', newCode);

        res.json({ message: 'Новый код отправлен', dev_code: newCode });

    } catch (error) {
        console.error('Resend error:', error);
        res.status(500).json({ error: 'Ошибка при отправке кода' });
    }
};

// Логин
const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT u.id, u.email, u.password_hash, u.full_name, u.is_email_confirmed,
                       r.name as role
                FROM Users u
                LEFT JOIN Roles r ON u.role_id = r.id
                WHERE u.email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = result.recordset[0];

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

        await pool.request()
            .input('userId', sql.Int, user.id)
            .query('UPDATE Users SET last_login = GETDATE() WHERE id = @userId');

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

// Получение профиля
const getProfile = async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, req.user.userId)
            .query(`
                SELECT u.id, u.email, u.full_name, u.storage_used, u.storage_limit, 
                       u.is_email_confirmed, u.created_at, u.last_login,
                       r.name as role
                FROM Users u
                LEFT JOIN Roles r ON u.role_id = r.id
                WHERE u.id = @userId
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json(result.recordset[0]);
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