const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:YdMwLv9uA55ZCXHm@db.jwwlnjcickeignkemvrj.supabase.co:5432/postgres'
});

async function run() {
  await client.connect();
  
  // Clean up subjects: Keep only one of each
  const res = await client.query(`
    select slug, count(id), array_agg(id) as ids 
    from subjects 
    group by slug 
    having count(id) > 1
  `);
  
  for(let row of res.rows) {
    if(row.ids.length > 1) {
      const keepId = row.ids[0];
      const deleteIds = row.ids.slice(1);
      
      for(let dId of deleteIds) {
        await client.query(`UPDATE cycles SET subject_id = $1 WHERE subject_id = $2`, [keepId, dId]);
        await client.query(`DELETE FROM subjects WHERE id = $1`, [dId]);
      }
    }
  }

  // Same for cycles: group by subject_id + name
  const resCycles = await client.query(`
    select subject_id, name, count(id), array_agg(id) as ids 
    from cycles 
    group by subject_id, name 
    having count(id) > 1
  `);
  
  for(let row of resCycles.rows) {
    if(row.ids.length > 1) {
      const keepId = row.ids[0];
      const deleteIds = row.ids.slice(1);
      
      for(let dId of deleteIds) {
        await client.query(`UPDATE chapters SET cycle_id = $1 WHERE cycle_id = $2`, [keepId, dId]);
        await client.query(`DELETE FROM cycles WHERE id = $1`, [dId]);
      }
    }
  }

  // Ensure subjects table has correct config
  await client.query(`
    UPDATE subjects SET name = 'Physics', name_bn = 'পদার্থবিজ্ঞান', icon = 'Atom', color = 'from-zinc-500 to-zinc-400', display_order = 1 WHERE slug = 'physics';
    UPDATE subjects SET name = 'Chemistry', name_bn = 'রসায়ন', icon = 'FlaskConical', color = 'from-zinc-500 to-zinc-400', display_order = 2 WHERE slug = 'chemistry';
    UPDATE subjects SET name = 'Higher Math', name_bn = 'উচ্চতর গণিত', icon = 'Calculator', color = 'from-zinc-500 to-zinc-400', display_order = 3 WHERE slug = 'math';
  `);
  
  // Set role correctly for the admin user
  await client.query(`UPDATE profiles SET role = 'admin' WHERE email = 'mdhosainp414@gmail.com'`);

  console.log("Database cleanup done!");
  await client.end();
}
run().catch(console.error);
