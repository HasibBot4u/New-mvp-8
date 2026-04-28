const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:YdMwLv9uA55ZCXHm@db.jwwlnjcickeignkemvrj.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  const resS = await client.query('select * from subjects');
  console.log("Subjects:", resS.rows);
  const resC = await client.query('select * from cycles');
  console.log("Cycles:", resC.rows);
  const resCh = await client.query('select * from chapters');
  console.log("Chapters:", resCh.rows);
  const resV = await client.query('select * from videos limit 5');
  console.log("Videos:", resV.rows);
  await client.end();
}
run().catch(console.error);
