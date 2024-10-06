module.exports = {
    development: {
        client: 'mssql',
        connection: {
            server: 'LAPTOP-VLHMD50C\\SQLEXPRESS', // Your SQL Server instance
            database: 'Zoo',
            user: 'vasile', // Your SQL Server username
            password: 'vasile', // Your SQL Server password
            options: {
                enableArithAbort: true,
            }
        }
    }
};
