import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema.ts'

export const connection = createClient({
	url: process.env.DRIZZLE_DATABASE_URL,
})

export const db = drizzle(connection, { schema })
