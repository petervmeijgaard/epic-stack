import { invariant, invariantResponse } from '@epic-web/invariant'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { and, eq } from 'drizzle-orm'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { db } from '#app/db'
import { notes } from '#app/db/schema.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { NoteEditor } from './__note-editor.tsx'

export { action } from './__note-editor.server.tsx'

export async function loader({ params, request }: LoaderFunctionArgs) {
	invariant(params.noteId, 'No noteId provided')

	const userId = await requireUserId(request)
	const note = await db.query.notes.findFirst({
		columns: {
			id: true,
			title: true,
			content: true,
		},
		with: {
			images: {
				columns: {
					id: true,
					altText: true,
				},
			},
		},
		where: and(eq(notes.id, params.noteId), eq(notes.ownerId, userId)),
	})
	invariantResponse(note, 'Not found', { status: 404 })
	return json({ note: note })
}

export default function NoteEdit() {
	const data = useLoaderData<typeof loader>()

	return <NoteEditor note={data.note} />
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No note with the id "{params.noteId}" exists</p>
				),
			}}
		/>
	)
}
