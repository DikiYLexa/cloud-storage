const mysql = require('mysql2/promise');

const getConfig = () => {
    if (process.env.MYSQL_URL) {
        return {
            uri: process.env.MYSQL_URL,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
    }
    
    return {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'cloud_user',
        password: process.env.DB_PASSWORD || 'Cloud123!',
        database: process.env.DB_NAME || 'CloudStorage',
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    };
};

let pool = null;

const poolPromise = (async () => {
    try {
        const config = getConfig();
        
        console.log('📡 Connecting to MySQL...');
        console.log('🔧 Host:', config.host || config.uri);
        
        if (config.uri) {
            pool = await mysql.createPool(config.uri);
        } else {
            pool = await mysql.createPool(config);
        }
        
        const connection = await pool.getConnection();
        const [result] = await connection.query('SELECT DATABASE() AS CurrentDB');
        console.log('✅ Connected to MySQL!');
        console.log('🔍 Database:', result[0].CurrentDB);
        connection.release();
        
        return pool;
    } catch (err) {
        console.error('❌ DB error:', err.message);
        return null;
    }
})();

module.exports = { poolPromise };