export function paginateRows<T>(rows: T[], requestedPage: number, size = 20) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(requestedPage) || 1));
  return {
    page,
    pages,
    items: rows.slice((page - 1) * size, page * size),
    total: rows.length,
  };
}
