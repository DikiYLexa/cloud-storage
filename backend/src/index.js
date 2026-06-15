const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const iconv = require('iconv-lite');
const crypto = require('crypto');
const { poolPromise, sql } = require('./config/db');
const { authenticateToken } = require('./middleware/auth');
const { scanFileForViruses, quickExtensionCheck } = require('./middleware/virusScan');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
        const result = await pool.request().query('SELECT GETDATE() as serverTime, DB_NAME() as dbName');
        res.json({ 
            status: 'ok', 
            serverTime: result.recordset[0].serverTime,
            database: result.recordset[0].dbName,
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

        const pool = await poolPromise;
        
        let originalName = req.file.originalname;
        try {
            originalName = iconv.decode(Buffer.from(req.file.originalname, 'binary'), 'utf-8');
        } catch (err) {
            console.log('Ошибка декодирования');
        }
        
        const result = await pool.request()
            .input('user_id', sql.Int, req.user.userId)
            .input('original_name', sql.NVarChar, originalName)
            .input('stored_name', sql.NVarChar, req.file.filename)
            .input('stored_path', sql.NVarChar, req.file.path)
            .input('file_size', sql.BigInt, req.file.size)
            .input('mime_type', sql.NVarChar, req.file.mimetype)
            .query(`
                INSERT INTO Files (user_id, original_name, stored_name, stored_path, file_size, mime_type)
                VALUES (@user_id, @original_name, @stored_name, @stored_path, @file_size, @mime_type);
                SELECT SCOPE_IDENTITY() AS id;
            `);

        await pool.request()
            .input('user_id', sql.Int, req.user.userId)
            .query(`
                UPDATE Users 
                SET storage_used = (SELECT ISNULL(SUM(file_size), 0) FROM Files WHERE user_id = @user_id AND is_deleted = 0)
                WHERE id = @user_id
            `);

        res.json({
            message: 'Файл успешно загружен',
            file: {
                id: result.recordset[0].id,
                original_name: originalName,
                size: req.file.size,
                mime_type: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Ошибка при загрузке файла' });
    }
});

// ========== ПОЛУЧЕНИЕ СПИСКА ФАЙЛОВ ==========
app.get('/api/files', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('user_id', sql.Int, req.user.userId)
            .query(`
                SELECT id, original_name, file_size, mime_type, uploaded_at 
                FROM Files 
                WHERE user_id = @user_id AND is_deleted = 0
                ORDER BY uploaded_at DESC
            `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ error: 'Ошибка при получении списка файлов' });
    }
});

// ========== СКАЧИВАНИЕ ФАЙЛА ==========
app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('user_id', sql.Int, req.user.userId)
            .query(`
                SELECT original_name, stored_path 
                FROM Files 
                WHERE id = @id AND user_id = @user_id AND is_deleted = 0
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Файл не найден' });
        }

        const file = result.recordset[0];
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
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('user_id', sql.Int, req.user.userId)
            .query(`
                UPDATE Files 
                SET is_deleted = 1, deleted_at = GETDATE()
                WHERE id = @id AND user_id = @user_id AND is_deleted = 0
            `);
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
        const result = await pool.request()
            .input('user_id', sql.Int, req.user.userId)
            .query(`
                SELECT id, original_name, file_size, mime_type, uploaded_at, deleted_at 
                FROM Files 
                WHERE user_id = @user_id AND is_deleted = 1
                ORDER BY deleted_at DESC
            `);
        res.json(result.recordset);
    } catch (error) {
        console.error('Get trash error:', error);
        res.status(500).json({ error: 'Ошибка при получении корзины' });
    }
});

// ========== ВОССТАНОВЛЕНИЕ ==========
app.put('/api/files/:id/restore', authenticateToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('user_id', sql.Int, req.user.userId)
            .query(`
                UPDATE Files 
                SET is_deleted = 0, deleted_at = NULL
                WHERE id = @id AND user_id = @user_id AND is_deleted = 1
            `);
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
        const fileResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('user_id', sql.Int, req.user.userId)
            .query('SELECT stored_path FROM Files WHERE id = @id AND user_id = @user_id AND is_deleted = 1');

        if (fileResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Файл не найден в корзине' });
        }

        const file = fileResult.recordset[0];
        if (fs.existsSync(file.stored_path)) {
            fs.unlinkSync(file.stored_path);
        }
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('user_id', sql.Int, req.user.userId)
            .query('DELETE FROM Files WHERE id = @id AND user_id = @user_id AND is_deleted = 1');

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
        const filesResult = await pool.request()
            .input('user_id', sql.Int, req.user.userId)
            .query('SELECT stored_path FROM Files WHERE user_id = @user_id AND is_deleted = 1');

        for (const file of filesResult.recordset) {
            if (fs.existsSync(file.stored_path)) {
                fs.unlinkSync(file.stored_path);
            }
        }
        
        await pool.request()
            .input('user_id', sql.Int, req.user.userId)
            .query('DELETE FROM Files WHERE user_id = @user_id AND is_deleted = 1');

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
        
        const fileCheck = await pool.request()
            .input('id', sql.Int, fileId)
            .input('user_id', sql.Int, req.user.userId)
            .query('SELECT id FROM Files WHERE id = @id AND user_id = @user_id AND is_deleted = 0');
        
        if (fileCheck.recordset.length === 0) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + expiresInHours);
        
        await pool.request()
            .input('file_id', sql.Int, fileId)
            .input('user_id', sql.Int, req.user.userId)
            .input('token', sql.NVarChar, token)
            .input('expires_at', sql.DateTime, expiresAt)
            .input('max_downloads', sql.Int, maxDownloads)
            .query(`
                INSERT INTO SharedLinks (file_id, user_id, token, expires_at, max_downloads)
                VALUES (@file_id, @user_id, @token, @expires_at, @max_downloads)
            `);
        
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
        const result = await pool.request()
            .input('token', sql.NVarChar, token)
            .query(`
                SELECT f.original_name, f.stored_path, sl.expires_at, sl.max_downloads, sl.download_count
                FROM SharedLinks sl
                JOIN Files f ON sl.file_id = f.id
                WHERE sl.token = @token AND sl.is_active = 1
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).send('Ссылка не найдена');
        }
        
        const share = result.recordset[0];
        
        if (new Date() > new Date(share.expires_at)) {
            return res.status(410).send('Срок действия ссылки истек');
        }
        
        if (share.max_downloads > 0 && share.download_count >= share.max_downloads) {
            return res.status(410).send('Лимит скачиваний исчерпан');
        }
        
        await pool.request()
            .input('token', sql.NVarChar, token)
            .query('UPDATE SharedLinks SET download_count = download_count + 1 WHERE token = @token');
        
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
});

// ========== ЗАПУСК ==========
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});