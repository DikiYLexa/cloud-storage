const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const crypto = require('crypto');
const { poolPromise } = require('./config/db');
const { authenticateToken } = require('./middleware/auth');
const { scanFileForViruses, quickExtensionCheck } = require('./middleware/virusScan');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ========== РАЗДАЧА СТАТИЧЕСКИХ ФАЙЛОВ ФРОНТЕНДА ==========
app.use(express.static(path.join(__dirname, '../public')));

// Подключение роутов
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

// ========== НАСТРОЙКА MULTER ==========
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');
        
        const [result] = await pool.execute('SELECT NOW() as serverTime, DATABASE() as dbName');
        res.json({ 
            status: 'ok', 
            serverTime: result[0].serverTime,
            database: result[0].dbName,
            message: 'Server and Database are ready!'
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// ========== ЗАГРУЗКА ФАЙЛА ==========
app.post('/api/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const extCheck = quickExtensionCheck(req.file.originalname);
        if (extCheck.isDangerous) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: extCheck.message, code: 'FORBIDDEN_EXTENSION' });
        }

        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        // ========== ПРОВЕРКА ЛИМИТА ХРАНИЛИЩА ==========
        const [userResult] = await pool.execute(
            `SELECT storage_used, storage_limit FROM Users WHERE id = ?`,
            [req.user.userId]
        );

        if (userResult.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = userResult[0];
        const newTotalSize = user.storage_used + req.file.size;

        if (newTotalSize > user.storage_limit) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                error: `Превышен лимит хранилища! Доступно: ${((user.storage_limit - user.storage_used) / 1024 / 1024).toFixed(2)} MB`,
                code: 'STORAGE_LIMIT_EXCEEDED'
            });
        }
        // ========== КОНЕЦ ПРОВЕРКИ ==========

        let originalName = req.file.originalname;
        try {
            originalName = iconv.decode(Buffer.from(req.file.originalname, 'binary'), 'utf-8');
        } catch (err) {
            console.log('Ошибка декодирования');
        }
        
        const [result] = await pool.execute(
            `INSERT INTO Files (user_id, original_name, stored_name, stored_path, file_size, mime_type)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.userId, originalName, req.file.filename, req.file.path, req.file.size, req.file.mimetype]
        );

        // Обновляем storage_used
        const [sumResult] = await pool.execute(
            `SELECT IFNULL(SUM(file_size), 0) AS total FROM Files WHERE user_id = ? AND is_deleted = 0`,
            [req.user.userId]
        );
        
        await pool.execute(
            `UPDATE Users SET storage_used = ? WHERE id = ?`,
            [sumResult[0].total, req.user.userId]
        );

        res.json({
            message: 'Файл успешно загружен',
            file: {
                id: result.insertId,
                original_name: originalName,
                size: req.file.size,
                mime_type: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Ошибка при загрузке файла' });
    }
});

// ========== ПОЛУЧЕНИЕ СПИСКА ФАЙЛОВ ==========
app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `SELECT id, original_name, file_size, mime_type, uploaded_at 
             FROM Files 
             WHERE user_id = ? AND is_deleted = 0
             ORDER BY uploaded_at DESC`,
            [req.user.userId]
        );
        res.json(result);
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ error: 'Ошибка при получении списка файлов' });
    }
});

// ========== СКАЧИВАНИЕ ФАЙЛА ==========
app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `SELECT original_name, stored_path 
             FROM Files 
             WHERE id = ? AND user_id = ? AND is_deleted = 0`,
            [req.params.id, req.user.userId]
        );

        if (result.length === 0) {
            return res.status(404).json({ error: 'Файл не найден' });
        }

        const file = result[0];
        if (!fs.existsSync(file.stored_path)) {
            return res.status(404).json({ error: 'Файл не найден на сервере' });
        }

        const encodedFileName = encodeURIComponent(file.original_name);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
        res.download(file.stored_path, file.original_name);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Ошибка при скачивании файла' });
    }
});

// ========== УДАЛЕНИЕ В КОРЗИНУ ==========
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        await pool.execute(
            `UPDATE Files 
             SET is_deleted = 1, deleted_at = NOW()
             WHERE id = ? AND user_id = ? AND is_deleted = 0`,
            [req.params.id, req.user.userId]
        );
        res.json({ message: 'Файл удалён' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

// ========== ПОЛУЧЕНИЕ КОРЗИНЫ ==========
app.get('/api/files/trash', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `SELECT id, original_name, file_size, mime_type, uploaded_at, deleted_at 
             FROM Files 
             WHERE user_id = ? AND is_deleted = 1
             ORDER BY deleted_at DESC`,
            [req.user.userId]
        );
        res.json(result);
    } catch (error) {
        console.error('Get trash error:', error);
        res.status(500).json({ error: 'Ошибка при получении корзины' });
    }
});

// ========== ВОССТАНОВЛЕНИЕ ==========
app.put('/api/files/:id/restore', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        await pool.execute(
            `UPDATE Files 
             SET is_deleted = 0, deleted_at = NULL
             WHERE id = ? AND user_id = ? AND is_deleted = 1`,
            [req.params.id, req.user.userId]
        );
        res.json({ message: 'Файл восстановлен' });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Ошибка при восстановлении' });
    }
});

// ========== ПОЛНОЕ УДАЛЕНИЕ ==========
app.delete('/api/files/:id/permanent', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [fileResult] = await pool.execute(
            `SELECT stored_path FROM Files WHERE id = ? AND user_id = ? AND is_deleted = 1`,
            [req.params.id, req.user.userId]
        );

        if (fileResult.length === 0) {
            return res.status(404).json({ error: 'Файл не найден в корзине' });
        }

        const file = fileResult[0];
        if (fs.existsSync(file.stored_path)) {
            fs.unlinkSync(file.stored_path);
        }
        
        await pool.execute(
            `DELETE FROM Files WHERE id = ? AND user_id = ? AND is_deleted = 1`,
            [req.params.id, req.user.userId]
        );

        res.json({ message: 'Файл полностью удалён' });
    } catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

// ========== ОЧИСТКА КОРЗИНЫ ==========
app.delete('/api/files/trash/empty', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [filesResult] = await pool.execute(
            `SELECT stored_path FROM Files WHERE user_id = ? AND is_deleted = 1`,
            [req.user.userId]
        );

        for (const file of filesResult) {
            if (fs.existsSync(file.stored_path)) {
                fs.unlinkSync(file.stored_path);
            }
        }
        
        await pool.execute(
            `DELETE FROM Files WHERE user_id = ? AND is_deleted = 1`,
            [req.user.userId]
        );

        res.json({ message: 'Корзина очищена' });
    } catch (error) {
        console.error('Empty trash error:', error);
        res.status(500).json({ error: 'Ошибка при очистке корзины' });
    }
});

// ========== СОЗДАНИЕ ССЫЛКИ ДЛЯ ШАРИНГА ==========
app.post('/api/files/:id/share', authenticateToken, async (req, res) => {
    const fileId = req.params.id;
    const { expiresInHours = 24, maxDownloads = 0 } = req.body;
    
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [fileCheck] = await pool.execute(
            `SELECT id FROM Files WHERE id = ? AND user_id = ? AND is_deleted = 0`,
            [fileId, req.user.userId]
        );
        
        if (fileCheck.length === 0) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);
        
        await pool.execute(
            `INSERT INTO SharedLinks (file_id, user_id, token, expires_at, max_downloads)
             VALUES (?, ?, ?, ?, ?)`,
            [fileId, req.user.userId, token, expiresAt, maxDownloads]
        );
        
        const shareUrl = `${req.protocol}://${req.get('host')}/api/s/${token}`;
        res.json({ success: true, shareUrl: shareUrl, token: token, expiresAt: expiresAt });
    } catch (error) {
        console.error('Share error:', error);
        res.status(500).json({ error: 'Ошибка при создании ссылки' });
    }
});

// ========== СКАЧИВАНИЕ ПО ССЫЛКЕ (ПУБЛИЧНЫЙ) ==========
app.get('/api/s/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(
            `SELECT f.original_name, f.stored_path, sl.expires_at, sl.max_downloads, sl.download_count
             FROM SharedLinks sl
             JOIN Files f ON sl.file_id = f.id
             WHERE sl.token = ? AND sl.is_active = 1`,
            [token]
        );
        
        if (result.length === 0) {
            return res.status(404).send('Ссылка не найдена');
        }
        
        const share = result[0];
        
        if (new Date() > new Date(share.expires_at)) {
            return res.status(410).send('Срок действия ссылки истек');
        }
        
        if (share.max_downloads > 0 && share.download_count >= share.max_downloads) {
            return res.status(410).send('Лимит скачиваний исчерпан');
        }
        
        await pool.execute(
            `UPDATE SharedLinks SET download_count = download_count + 1 WHERE token = ?`,
            [token]
        );
        
        res.download(share.stored_path, share.original_name);
    } catch (error) {
        console.error('Share download error:', error);
        res.status(500).send('Ошибка при скачивании файла');
    }
});

// ========== ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/profile', authenticateToken, async (req, res) => {
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
});

// ========== ЗАПУСК ==========
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});