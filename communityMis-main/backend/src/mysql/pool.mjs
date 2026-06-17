let mysqlModulePromise = null;

export async function createMysqlPool(config) {
  const mysql = await loadMysql();
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    namedPlaceholders: true,
    multipleStatements: true,
    charset: "utf8mb4"
  });
}

export async function pingMysql(config) {
  const pool = await createMysqlPool(config);
  try {
    await pool.query("SELECT 1");
  } finally {
    await pool.end();
  }
}

export async function withTransaction(pool, operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function loadMysql() {
  if (!mysqlModulePromise) {
    mysqlModulePromise = import("mysql2/promise").catch((error) => {
      throw new Error(`mysql2 is required for AUTH_STORE=mysql. Install dependencies with npm install. ${error.message}`);
    });
  }
  return mysqlModulePromise;
}
