import { readFileSync } from "node:fs";
import { Client } from "pg";

const file = process.argv[2];
const sql = readFileSync(file, "utf8");

const connectionString = process.env.POSTGRES_URL_NON_POOLING.replace(
  /[?&]sslmode=[^&]*/,
  "",
);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(sql);
  console.log(`Applied ${file}`);
} finally {
  await client.end();
}
