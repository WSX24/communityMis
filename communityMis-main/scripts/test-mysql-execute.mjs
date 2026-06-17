import mysql from 'mysql2/promise';

const p = await mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

async function test(label, sql, params) {
  try {
    const [r] = await p.execute(sql, params);
    console.log(label, ': OK, rows:', r.length);
  } catch(e) {
    console.error(label, ': FAILED -', e.code);
  }
}

await test('D (LIMIT+OFFSET only)',
  'SELECT p.post_id FROM community_post p WHERE p.status=? LIMIT ? OFFSET ?',
  ['published', 10, 0]);

await test('E (1 EXISTS only)',
  'SELECT p.post_id, EXISTS(SELECT 1 FROM community_post_like l WHERE l.post_id=p.post_id AND l.user_id=?) AS liked FROM community_post p',
  [1]);

await test('F (2 EXISTS only)',
  'SELECT p.post_id, EXISTS(SELECT 1 FROM community_post_like l WHERE l.post_id=p.post_id AND l.user_id=?) AS a, EXISTS(SELECT 1 FROM user_collection uc WHERE uc.target_type="community_post" AND uc.target_id=p.post_id AND uc.user_id=?) AS b FROM community_post p',
  [1, 1]);

await test('G (1 EXISTS + LIMIT OFFSET)',
  'SELECT p.post_id, EXISTS(SELECT 1 FROM community_post_like l WHERE l.post_id=p.post_id AND l.user_id=?) AS liked FROM community_post p LIMIT ? OFFSET ?',
  [1, 10, 0]);

await p.end();
