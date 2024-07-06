import { invariant } from '@epic-web/invariant'
import { redirect } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import { and, eq, gt, Simplify, SQL } from 'drizzle-orm'
import { Authenticator } from 'remix-auth'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { db } from '#app/db'
import {
	type Connection,
	connections,
	type Password,
	passwords,
	roles,
	rolesToUsers,
	sessions,
	type User,
	userImages,
	users,
} from '#app/db/schema.ts'
import { connectionSessionStorage, providers } from './connections.server.ts'
import { prisma } from './db.server.ts'
import { combineHeaders, downloadFile } from './misc.tsx'
import { type ProviderUser } from './providers/provider.ts'
import { authSessionStorage } from './session.server.ts'
import { Operators, TableRelationalConfig } from 'drizzle-orm/relations'

export const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30
export const getSessionExpirationDate = () =>
	new Date(Date.now() + SESSION_EXPIRATION_TIME)

export const sessionKey = 'sessionId'

export const authenticator = new Authenticator<ProviderUser>(
	connectionSessionStorage,
)

for (const [providerName, provider] of Object.entries(providers)) {
	authenticator.use(provider.getAuthStrategy(), providerName)
}

export async function getUserId(request: Request) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	if (!sessionId) return null
	const session = await db.query.sessions.findFirst({
		with: { user: { columns: { id: true } } },
		where: and(
			eq(sessions.id, sessionId),
			gt(sessions.expirationDate, new Date()),
		),
	})
	if (!session?.user) {
		throw redirect('/', {
			headers: {
				'set-cookie': await authSessionStorage.destroySession(authSession),
			},
		})
	}
	return session.user.id
}

export async function requireUserId(
	request: Request,
	{ redirectTo }: { redirectTo?: string | null } = {},
) {
	const userId = await getUserId(request)
	if (!userId) {
		const requestUrl = new URL(request.url)
		redirectTo =
			redirectTo === null
				? null
				: redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`
		const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
		const loginRedirect = ['/login', loginParams?.toString()]
			.filter(Boolean)
			.join('?')
		throw redirect(loginRedirect)
	}
	return userId
}

export async function requireAnonymous(request: Request) {
	const userId = await getUserId(request)
	if (userId) {
		throw redirect('/')
	}
}

export async function login({
	username,
	password,
}: {
	username: User['username']
	password: string
}) {
	const user = await verifyUserPassword({ username }, password)
	if (!user) return null
	const [session] = await db
		.insert(sessions)
		.values({
			expirationDate: getSessionExpirationDate(),
			userId: user.id,
		})
		.returning({
			id: sessions.id,
			expirationDate: sessions.expirationDate,
			userId: sessions.userId,
		})
	invariant(session, 'Failed to create session')
	return session
}

export async function resetUserPassword({
	username,
	password,
}: {
	username: User['username']
	password: string
}) {
	const hashedPassword = await getPasswordHash(password)
	return await db.transaction(async (tx) => {
		const user = await tx.query.users.findFirst({
			where: eq(users.username, username),
			columns: {
				id: true,
				email: true,
				username: true,
				name: true,
				createdAt: true,
				updatedAt: true,
			},
		})

		invariant(user, 'User not found')

		await tx.update(passwords).set({
			hash: hashedPassword,
			userId: user.id,
		})

		return user
	})
}

export async function signup({
	email,
	username,
	password,
	name,
}: {
	email: User['email']
	username: User['username']
	name: User['name']
	password: string
}) {
	const hashedPassword = await getPasswordHash(password)

	const session = await db.transaction(async (tx) => {
		const [user] = await tx
			.insert(users)
			.values({
				email: email.toLowerCase(),
				username: username.toLowerCase(),
				name,
			})
			.returning({ id: users.id })

		const role = await tx.query.roles.findFirst({
			where: eq(roles.name, 'user'),
			columns: { id: true },
		})

		invariant(role, 'Failed to find user role')
		invariant(user, 'Failed to create user')

		await tx.insert(passwords).values({
			hash: hashedPassword,
			userId: user.id,
		})

		await tx.insert(rolesToUsers).values({
			userId: user.id,
			roleId: role.id,
		})

		const [session] = await tx
			.insert(sessions)
			.values({
				expirationDate: getSessionExpirationDate(),
				userId: user.id,
			})
			.returning({
				id: sessions.id,
				expirationDate: sessions.expirationDate,
			})

		invariant(session, 'Failed to create session')

		return session
	})

	return session
}

export async function signupWithConnection({
	email,
	username,
	name,
	providerId,
	providerName,
	imageUrl,
}: {
	email: User['email']
	username: User['username']
	name: User['name']
	providerId: Connection['providerId']
	providerName: Connection['providerName']
	imageUrl?: string
}) {
	const session = await db.transaction(async (tx) => {
		const [user] = await tx
			.insert(users)
			.values({
				email: email.toLowerCase(),
				username: username.toLowerCase(),
				name,
			})
			.returning({ id: users.id })

		const role = await tx.query.roles.findFirst({
			where: eq(roles.name, 'user'),
			columns: { id: true },
		})

		invariant(user, 'Failed to create user')
		invariant(role, 'Failed to find user role')

		await tx.insert(rolesToUsers).values({
			userId: user.id,
			roleId: role.id,
		})
		await tx.insert(connections).values({
			userId: user.id,
			providerId,
			providerName,
		})

		if (imageUrl) {
			await tx.insert(userImages).values({
				...(await downloadFile(imageUrl)),
				userId: user.id,
			})
		}

		const [session] = await tx
			.insert(sessions)
			.values({
				expirationDate: getSessionExpirationDate(),
				userId: user.id,
			})
			.returning({
				id: sessions.id,
				expirationDate: sessions.expirationDate,
			})

		invariant(session, 'Failed to create session')

		return session
	})

	return session
}

export async function logout(
	{
		request,
		redirectTo = '/',
	}: {
		request: Request
		redirectTo?: string
	},
	responseInit?: ResponseInit,
) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	// if this fails, we still need to delete the session from the user's browser
	// and it doesn't do any harm staying in the db anyway.
	if (sessionId) {
		// the .catch is important because that's what triggers the query.
		// learn more about PrismaPromise: https://www.prisma.io/docs/orm/reference/prisma-client-reference#prismapromise-behavior
		void db
			.delete(sessions)
			.where(eq(sessions.id, sessionId))
			.catch(() => {})
	}
	throw redirect(safeRedirect(redirectTo), {
		...responseInit,
		headers: combineHeaders(
			{ 'set-cookie': await authSessionStorage.destroySession(authSession) },
			responseInit?.headers,
		),
	})
}

export async function getPasswordHash(password: string) {
	const hash = await bcrypt.hash(password, 10)
	return hash
}

type Where =
	| SQL
	| undefined
	| ((
			fields: Simplify<
				[TTableConfig['columns']] extends [never] ? {} : TTableConfig['columns']
			>,
			operators: Operators,
	  ) => SQL | undefined)

export async function verifyUserPassword(
	where: Where,
	password: Password['hash'],
) {
	const userWithPassword = await db.query.users.findFirst({
		where,
		columns: { id: true },
		with: { password: { columns: { hash: true } } },
	})

	if (!userWithPassword || !userWithPassword.password) {
		return null
	}

	const isValid = await bcrypt.compare(password, userWithPassword.password.hash)

	if (!isValid) {
		return null
	}

	return { id: userWithPassword.id }
}
