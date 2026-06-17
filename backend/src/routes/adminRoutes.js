const express = require('express');
const router = express.Router();
const { poolPromise } = require('../config/db');

// ========== MIDDLEWARE ДЛЯ ПРОВЕРКИ АДМИНА ==========
const checkAdmin = async (req, res, next) => {
    try {
        console.log('Checking admin for user_id:', req.user.userId);
        
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');
        
        const [result] = await pool.execute(
            `SELECT r.name as role_name 
             FROM Users u
             JOIN Roles r ON u.role_id = r.id
             WHERE u.id = ?`,
            [req.user.userId]
        );
        
        console.log('Query result:', result);
        
        if (result.length === 0) {
            console.log('User not found');
            return res.status(403).json({ error: 'Пользователь не найден' });
        }
        
        if (result[0].role_name !== 'admin') {
            console.log('User is not admin, role:', result[0].role_name);
            return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
        }
        
        console.log('Admin access granted');
        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Ошибка проверки прав' });
    }
};

// ========== ПОЛУЧЕНИЕ СПИСКА ПОЛЬЗОВАТЕЛЕЙ ==========
router.get('/users', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [result] = await pool.execute(`
            SELECT 
                u.id, 
                u.email, 
                u.full_name, 
                u.storage_used, 
                u.storage_limit,
                r.name as role,
                u.created_at,
                u.last_login
            FROM Users u
            LEFT JOIN Roles r ON u.role_id = r.id
            ORDER BY u.id
        `);
        
        const usersWithStats = result.map(user => ({
            id: user.id,
            email: user.email,
            full_name: user.full_name || '-',
            storage_used_mb: (user.storage_used / 1024 / 1024).toFixed(2),
            storage_limit_mb: (user.storage_limit / 1024 / 1024).toFixed(0),
            usage_percent: ((user.storage_used / user.storage_limit) * 100).toFixed(1),
            role: user.role_name,
            created_at: user.created_at,
            last_login: user.last_login || 'Никогда'
        }));
        
        res.json(usersWithStats);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
});

// ========== ОБЩАЯ СТАТИСТИКА ==========
router.get('/stats', checkAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');

        const [userStats] = await pool.execute(`
            SELECT 
                COUNT(*) AS total_users,
                SUM(storage_used) AS total_storage_used,
                SUM(storage_limit) AS total_storage_limit,
                SUM(CASE WHEN last_login IS NOT NULL THEN 1 ELSE 0 END) AS active_users
            FROM Users
        `);
        
        const [fileStats] = await pool.execute(`
            SELECT 
                COUNT(*) AS total_files,
                SUM(file_size) AS total_files_size
            FROM Files
            WHERE is_deleted = 0
        `);
        
        const [trashStats] = await pool.execute(`
            SELECT 
                COUNT(*) AS deleted_files,
                SUM(file_size) AS deleted_size
            FROM Files
            WHERE is_deleted = 1
        `);
        
        const stats = {
            users: {
                total: userStats[0]?.total_users || 0,
                active: userStats[0]?.active_users || 0,
                inactive: (userStats[0]?.total_users || 0) - (userStats[0]?.active_users || 0)
            },
            storage: {
                used_mb: ((userStats[0]?.total_storage_used || 0) / 1024 / 1024).toFixed(2),
                limit_mb: ((userStats[0]?.total_storage_limit || 0) / 1024 / 1024).toFixed(0),
                usage_percent: ((userStats[0]?.total_storage_used || 0) / (userStats[0]?.total_storage_limit || 1) * 100).toFixed(1)
            },
            files: {
                total: fileStats[0]?.total_files || 0,
                total_size_mb: ((fileStats[0]?.total_files_size || 0) / 1024 / 1024).toFixed(2),
                deleted: trashStats[0]?.deleted_files || 0,
                deleted_size_mb: ((trashStats[0]?.deleted_size || 0) / 1024 / 1024).toFixed(2)
            }
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// ========== ОБНОВЛЕНИЕ ЛИМИТА ХРАНИЛИЩА ==========
router.put('/users/:id/limit', checkAdmin, async (req, res) => {
    const userId = req.params.id;
    const { limit_mb } = req.body;
    
    if (!limit_mb || limit_mb < 100) {
        return res.status(400).json({ error: 'Лимит должен быть не менее 100 MB' });
    }
    
    try {
        const pool = await poolPromise;
        if (!pool) throw new Error('Database not connected');
        
        const limitBytes = limit_mb * 1024 * 1024;
        
        await pool.execute(
            'UPDATE Users SET storage_limit = ? WHERE id = ?',
            [limitBytes, userId]
        );
        
        res.json({ message: 'Лимит обновлён', limit_mb: limit_mb });
    } catch (error) {
        console.error('Update limit error:', error);
        res.status(500).json({ error: 'Ошибка обновления лимита' });
    }
});

module.exports = router;