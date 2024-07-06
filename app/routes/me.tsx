import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { eq } from 'drizzle-orm'
import { db } from '#app/db'
import { users } from '#app/db/schema.ts'
import { requireUserId, logout } from '#app/utils/auth.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
	if (!user) {
		const requestUrl = new URL(request.url)
		const loginParams = new URLSearchParams([
			['redirectTo', `${requestUrl.pathname}${requestUrl.search}`],
		])
		const redirectTo = `/login?${loginParams}`
		await logout({ request, redirectTo })
		return redirect(redirectTo)
	}
	return redirect(`/users/${user.username}`)
}
