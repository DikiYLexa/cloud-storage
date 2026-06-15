const { poolPromise, sql } = require('../config/db');

// ========== ПОЛУЧЕНИЕ СПИСКА ПОЛЬЗОВАТЕЛЕЙ ==========
const getUsers = async (req, res) => {
    try {
        const pool = await poolPromise;
        
        const result = await pool.request()
            .query(`
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
        
        const usersWithStats = result.recordset.map(user => ({
            id: user.id,
            email: user.email,
            full_name: user.full_name || '-',
            storage_used_mb: (user.storage_used / 1024 / 1024).toFixed(2),
            storage_limit_mb: (user.storage_limit / 1024 / 1024).toFixed(0),
            usage_percent: ((user.storage_used / user.storage_limit) * 100).toFixed(1),
            role: user.role,
            created_at: user.created_at,
            last_login: user.last_login || 'Никогда'
        }));
        
        res.json(usersWithStats);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Ошибка получения списка пользователей' });
    }
};

// ========== ОБЩАЯ СТАТИСТИКА ==========
const getStats = async (req, res) => {
    try {
        const pool = await poolPromise;
        
        const userStats = await pool.request()
            .query(`
                SELECT 
                    COUNT(*) AS total_users,
                    SUM(storage_used) AS total_storage_used,
                    SUM(storage_limit) AS total_storage_limit,
                    SUM(CASE WHEN last_login IS NOT NULL THEN 1 ELSE 0 END) AS active_users
                FROM Users
            `);
        
        const fileStats = await pool.request()
            .query(`
                SELECT 
                    COUNT(*) AS total_files,
                    SUM(file_size) AS total_files_size
                FROM Files
                WHERE is_deleted = 0
            `);
        
        const trashStats = await pool.request()
            .query(`
                SELECT 
                    COUNT(*) AS deleted_files,
                    SUM(file_size) AS deleted_size
                FROM Files
                WHERE is_deleted = 1
            `);
        
        const stats = {
            users: {
                total: userStats.recordset[0].total_users,
                active: userStats.recordset[0].active_users,
                inactive: userStats.recordset[0].total_users - userStats.recordset[0].active_users
            },
            storage: {
                used_mb: (userStats.recordset[0].total_storage_used / 1024 / 1024).toFixed(2),
                limit_mb: (userStats.recordset[0].total_storage_limit / 1024 / 1024).toFixed(0),
                usage_percent: ((userStats.recordset[0].total_storage_used / userStats.recordset[0].total_storage_limit) * 100).toFixed(1)
            },
            files: {
                total: fileStats.recordset[0].total_files,
                total_size_mb: (fileStats.recordset[0].total_files_size / 1024 / 1024).toFixed(2),
                deleted: trashStats.recordset[0].deleted_files,
                deleted_size_mb: (trashStats.recordset[0].deleted_size / 1024 / 1024).toFixed(2)
            }
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
};

// ========== ОБНОВЛЕНИЕ ЛИМИТА ХРАНИЛИЩА ==========
const updateStorageLimit = async (req, res) => {
    const userId = req.params.id;
    const { limit_mb } = req.body;
    
    if (!limit_mb || limit_mb < 100) {
        return res.status(400).json({ error: 'Лимит должен быть не менее 100 MB' });
    }
    
    try {
        const pool = await poolPromise;
        const limitBytes = limit_mb * 1024 * 1024;
        
        await pool.request()
            .input('user_id', sql.Int, userId)
            .input('limit', sql.BigInt, limitBytes)
            .query('UPDATE Users SET storage_limit = @limit WHERE id = @user_id');
        
        res.json({ message: 'Лимит обновлён', limit_mb: limit_mb });
    } catch (error) {
        console.error('Update limit error:', error);
        res.status(500).json({ error: 'Ошибка обновления лимита' });
    }
};

module.exports = {
    getUsers,
    getStats,
    updateStorageLimit
};