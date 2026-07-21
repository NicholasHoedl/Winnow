import "server-only"
import { asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { requireUserId } from "@/lib/session"

import { lists, tasks } from "./schema"
import { summarizeTasks } from "./service"

export type Task = typeof tasks.$inferSelect
export type List = typeof lists.$inferSelect

export async function getLists(): Promise<List[]> {
  const userId = await requireUserId()
  return db.query.lists.findMany({
    where: eq(lists.userId, userId),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
  })
}

export async function getTasks(): Promise<Task[]> {
  const userId = await requireUserId()
  // Postgres sorts NULLs last for ASC by default, so undated tasks fall to the
  // bottom naturally.
  return db.query.tasks.findMany({
    where: eq(tasks.userId, userId),
    orderBy: [asc(tasks.dueDate), desc(tasks.createdAt)],
  })
}

export async function getTaskSummary(timeZone: string) {
  const userId = await requireUserId()
  const rows = await db.query.tasks.findMany({
    where: eq(tasks.userId, userId),
    columns: { id: true, title: true, dueDate: true, status: true },
  })
  return summarizeTasks(rows, new Date(), timeZone)
}
