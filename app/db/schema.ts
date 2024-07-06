import { createId } from '@paralleldrive/cuid2'
import { relations } from 'drizzle-orm'
import {
	index,
	uniqueIndex,
	integer,
	sqliteTable,
	text,
	blob,
} from 'drizzle-orm/sqlite-core'

const timestamp = <TName extends string>(name: TName) =>
	integer(name, { mode: 'timestamp' })
		.notNull()
		.$default(() => new Date())

export const users = sqliteTable('user', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => createId()),
	email: text('email').unique().notNull(),
	username: text('username').unique().notNull(),
	name: text('name'),

	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at'),
})

export const notes = sqliteTable(
	'note',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => createId()),
		title: text('title').notNull(),
		content: text('content').notNull(),

		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),

		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	},
	(table) => ({
		// non-unique foreign key
		ownerId: index('note_owner_id_idx').on(table.ownerId),
		// This helps our order by in the user search a LOT
		ownerIdWithUpdatedAt: index('note_owner_id_updated_at_idx').on(
			table.ownerId,
			table.updatedAt,
		),
	}),
)

export const noteImages = sqliteTable(
	'note_image',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => createId()),
		altText: text('alt_text'),
		contentType: text('content_type').notNull(),
		blob: blob('blob', { mode: 'buffer' }).notNull(),

		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),

		noteId: text('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	},
	(table) => ({
		// non-unique foreign key
		noteId: index('note_image_note_id_idx').on(table.noteId),
	}),
)

export const userImages = sqliteTable('user_image', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => createId()),
	altText: text('alt_text'),
	contentType: text('content_type').notNull(),
	blob: blob('blob', { mode: 'buffer' }).notNull(),

	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at'),

	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
})

export const passwords = sqliteTable('password', {
	hash: text('hash').notNull(),

	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
})

export const sessions = sqliteTable(
	'session',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => createId()),
		expirationDate: integer('expiration_date', { mode: 'timestamp' }).notNull(),

		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),

		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	},
	(table) => ({
		// non-unique foreign key
		userId: index('session_user_id_idx').on(table.userId),
	}),
)

export const permissions = sqliteTable(
	'permission',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => createId()),
		action: text('action').notNull(), // e.g. create, read, update, delete
		entity: text('entity').notNull(), // e.g. note, user, etc.
		access: text('access').notNull(), // e.g. own or any
		description: text('description').notNull().default(''),

		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),
	},
	(table) => ({
		actionWithEntityWithAccess: uniqueIndex(
			'permission_action_entity_access_idx',
		).on(table.action, table.entity, table.access),
	}),
)

export const roles = sqliteTable('role', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => createId()),
	name: text('name').notNull().unique(),
	description: text('description').notNull().default(''),

	createdAt: timestamp('created_at'),
	updatedAt: timestamp('updated_at'),
})

export const verifications = sqliteTable(
	'verification',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => createId()),
		createdAt: timestamp('created_at'),

		// The type of verification, e.g. "email" or "phone"
		type: text('type').notNull(),

		// The thing we're trying to verify, e.g. a user's email or phone number
		target: text('target').notNull(),

		// The secret key used to generate the otp
		secret: text('secret').notNull(),

		// The algorithm used to generate the otp
		algorithm: text('algorithm').notNull(),

		// The number of digits in the otp
		digits: integer('digits').notNull(),

		// The number of seconds the otp is valid for
		period: integer('period').notNull(),

		// The valid characters for the otp
		charSet: text('char_set').notNull(),

		// When it's safe to delete this verification
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
	},
	(table) => ({
		targetWithType: uniqueIndex('verification_target_type_unique').on(
			table.target,
			table.type,
		),
	}),
)

export const connections = sqliteTable(
	'connection',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => createId()),
		providerName: text('provider_name').notNull(),
		providerId: text('provider_id').notNull(),

		createdAt: timestamp('created_at'),
		updatedAt: timestamp('updated_at'),

		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	},
	(table) => ({
		providerNameWithProviderId: uniqueIndex(
			'connection_provider_name_prodiver_id_unique',
		).on(table.providerName, table.providerId),
	}),
)

export const permissionsToRoles = sqliteTable('permission_role', {
	permissionId: text('permission_id')
		.notNull()
		.references(() => permissions.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade',
		}),
	roleId: text('role_id')
		.notNull()
		.references(() => roles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
})

export const rolesToUsers = sqliteTable('role_user', {
	roleId: text('role_id')
		.notNull()
		.references(() => roles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
})

export const usersRelations = relations(users, ({ one, many }) => ({
	image: one(userImages),
	password: one(passwords),
	notes: many(notes),
	roles: many(roles),
	sessions: many(sessions),
	connections: many(connections),
}))

export const notesRelations = relations(notes, ({ many, one }) => ({
	owner: one(users),
	images: many(noteImages),
}))

export const noteImagesRelations = relations(noteImages, ({ one }) => ({
	note: one(notes),
}))

export const userImagesRelations = relations(userImages, ({ one }) => ({
	user: one(users),
}))

export const passwordsRelations = relations(passwords, ({ one }) => ({
	user: one(users),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
	roles: many(roles),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
	users: many(users),
	permissions: many(permissions),
}))

export const connectionsRelations = relations(connections, ({ one }) => ({
	user: one(users),
}))

export const permissionsToRolesRelations = relations(
	permissionsToRoles,
	({ one }) => ({
		permission: one(permissions),
		role: one(roles),
	}),
)

export const rolesToUsersRelations = relations(rolesToUsers, ({ one }) => ({
	role: one(roles),
	user: one(users),
}))

export type Connection = typeof connections.$inferSelect

export type Password = typeof passwords.$inferSelect

export type User = typeof users.$inferSelect

export type Note = typeof notes.$inferSelect

export type NoteImage = typeof noteImages.$inferSelect
