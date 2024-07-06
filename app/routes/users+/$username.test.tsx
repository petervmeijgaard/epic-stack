/**
 * @vitest-environment jsdom
 */
import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { createRemixStub } from '@remix-run/testing'
import { render, screen } from '@testing-library/react'
import setCookieParser from 'set-cookie-parser'
import { test } from 'vitest'
import { db } from '#app/db'
import {
	users,
	userImages as userImagesSchema,
	sessions,
} from '#app/db/schema.ts'
import { loader as rootLoader } from '#app/root.tsx'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createUser, getUserImages } from '#tests/db-utils.ts'
import { default as UsernameRoute, loader } from './$username.tsx'

test('The user profile when not logged in as self', async () => {
	const userImages = await getUserImages()
	const userImage =
		userImages[faker.number.int({ min: 0, max: userImages.length - 1 })]

	invariant(userImage, 'No user image')

	const user = await db.transaction(async (tx) => {
		const [user] = await tx.insert(users).values(createUser()).returning({
			id: users.id,
			username: users.username,
			name: users.name,
		})

		invariant(user, 'No user created')

		await tx.insert(userImagesSchema).values({ ...userImage, userId: user.id })

		return user
	})

	const App = createRemixStub([
		{
			path: '/users/:username',
			Component: UsernameRoute,
			loader,
		},
	])

	const routeUrl = `/users/${user.username}`
	render(<App initialEntries={[routeUrl]} />)

	await screen.findByRole('heading', { level: 1, name: user.name! })
	await screen.findByRole('img', { name: user.name! })
	await screen.findByRole('link', { name: `${user.name}'s notes` })
})

test('The user profile when logged in as self', async () => {
	const userImages = await getUserImages()
	const userImage =
		userImages[faker.number.int({ min: 0, max: userImages.length - 1 })]

	invariant(userImage, 'No user image')

	const user = await db.transaction(async (tx) => {
		const [user] = await tx.insert(users).values(createUser()).returning({
			id: users.id,
			username: users.username,
			name: users.name,
		})

		invariant(user, 'No user created')

		await tx.insert(userImagesSchema).values({ ...userImage, userId: user.id })

		return user
	})

	const [session] = await db
		.insert(sessions)
		.values({
			expirationDate: getSessionExpirationDate(),
			userId: user.id,
		})
		.returning({ id: sessions.id })

	invariant(session, 'No session created')

	const authSession = await authSessionStorage.getSession()
	authSession.set(sessionKey, session.id)
	const setCookieHeader = await authSessionStorage.commitSession(authSession)
	const parsedCookie = setCookieParser.parseString(setCookieHeader)
	const cookieHeader = new URLSearchParams({
		[parsedCookie.name]: parsedCookie.value,
	}).toString()

	const App = createRemixStub([
		{
			id: 'root',
			path: '/',
			loader: async (args) => {
				// add the cookie header to the request
				args.request.headers.set('cookie', cookieHeader)
				return rootLoader(args)
			},
			children: [
				{
					path: 'users/:username',
					Component: UsernameRoute,
					loader: async (args) => {
						// add the cookie header to the request
						args.request.headers.set('cookie', cookieHeader)
						return loader(args)
					},
				},
			],
		},
	])

	const routeUrl = `/users/${user.username}`
	await render(<App initialEntries={[routeUrl]} />)

	await screen.findByRole('heading', { level: 1, name: user.name! })
	await screen.findByRole('img', { name: user.name! })
	await screen.findByRole('button', { name: /logout/i })
	await screen.findByRole('link', { name: /my notes/i })
	await screen.findByRole('link', { name: /edit profile/i })
})
