let contentTypeId: number | null = null;
export function setContentTypeScope(id: number | null) {
  contentTypeId = id;
}
export async function api(
  url: string,
  method = "GET",
  body?: unknown,
  scope: number | null = contentTypeId,
) {
  const response = await fetch("/api" + url, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(scope ? { "X-Content-Type-Id": String(scope) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Operasi gagal");
  return data;
}
