import db from '../../db';

/*
 * 批量永久删除记忆。
 *
 * 和 memoryService.js 里的 permanentlyDeleteMemory 做的事一样
 * （删记忆本体 + 删它的修订记录），只是把多条放进同一个事务，
 * 选得多的时候不用一条一条开关事务，也不会删到一半留下半截数据。
 *
 * 传入的是 memoryId（字符串主键，不是 Dexie 的自增 id）。
 * 返回实际删掉的条数。
 */
export const permanentlyDeleteMemories = async (memoryIds) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(memoryIds) ? memoryIds : [])
        .filter(Boolean)
    )
  );

  if (ids.length === 0) {
    return 0;
  }

  let deletedCount = 0;

  await db.transaction(
    'rw',
    db.memories,
    db.memoryRevisions,
    async () => {
      const rows = await db.memories
        .where('memoryId')
        .anyOf(ids)
        .toArray();

      deletedCount = rows.length;

      if (rows.length > 0) {
        await db.memories.bulkDelete(
          rows.map((row) => row.id)
        );
      }

      await db.memoryRevisions
        .where('memoryId')
        .anyOf(ids)
        .delete();
    }
  );

  return deletedCount;
};
