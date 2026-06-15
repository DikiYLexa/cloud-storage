const sql = require('mssql');

const config = {
    server: 'localhost\\SQLEXPRESS',
    database: 'CloudStorage',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    authentication: {
        type: 'default',
        options: {
            userName: 'cloud_user',
            password: 'Cloud123!'
        }
    }
};

console.log('📡 Connecting to SQL Server...');
console.log('🔧 Server:', config.server);
console.log('🔧 Database:', config.database);
console.log('🔧 User:', config.authentication.options.userName);

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('✅ Connected to MSSQL Server!');
        return pool.request().query('SELECT DB_NAME() AS CurrentDB').then(result => {
            console.log('🔍 Currently connected to database:', result.recordset[0].CurrentDB);
            return pool;
        });
    })
    .catch(err => {
        console.error('❌ DB error:', err.message);
        process.exit(1);
    });

module.exports = { sql, poolPromise };