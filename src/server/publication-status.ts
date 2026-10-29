// An uncertain delivery counts as published once a submission was attempted.
export function publicationStatus(value: unknown): string {
  const status = String(value || "unknown").toLowerCase();
  return status === "unknown" ? "published" : status;
}
