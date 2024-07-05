import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	out: './drizzle/migrations',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.DRIZZLE_DATABASE_URL,
	},
})
