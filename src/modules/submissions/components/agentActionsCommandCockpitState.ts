export function retainExpandedActionTaskIds(
  expandedTaskIds: Set<string>,
  tasks: ReadonlyArray<{ id: string }>,
) {
  const availableTaskIds = new Set(tasks.map((task) => task.id));
  const retainedTaskIds = [...expandedTaskIds].filter((taskId) =>
    availableTaskIds.has(taskId),
  );

  return retainedTaskIds.length === expandedTaskIds.size
    ? expandedTaskIds
    : new Set(retainedTaskIds);
}
