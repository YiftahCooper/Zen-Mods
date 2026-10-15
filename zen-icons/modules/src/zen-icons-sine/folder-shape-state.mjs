function parseState(serialized) {
  try {
    const value = JSON.parse(serialized || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

export function readFolderShapeState(serialized, folderId) {
  const state = parseState(serialized);
  return typeof state[folderId] === "boolean" ? state[folderId] : true;
}

export function setFolderShapeState(serialized, folderId, showFolderShape) {
  const state = parseState(serialized);
  state[String(folderId)] = Boolean(showFolderShape);
  return JSON.stringify(state);
}
