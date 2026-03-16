import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

// Use compiled seeds in Docker, source seeds otherwise
const seedsPath = fs.existsSync('./dist/database/seeds')
  ? 'dist/database/seeds/*.js'
  : 'database/seeds/*.ts';

const SeedDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'arroyo',
  password: process.env.DB_PASSWORD || 'arroyo1234',
  database: process.env.DB_NAME || 'delivery',
  synchronize: false,
  logging: true,
  entities: ['src/**/*.entity.ts'],
  migrations: [seedsPath],
});

export default SeedDataSource;
