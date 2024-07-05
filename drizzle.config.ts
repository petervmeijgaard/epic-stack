import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	schema: './app/db/schema.ts',
	out: './drizzle/migrations',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.DRIZZLE_DATABASE_URL,
	},
})
