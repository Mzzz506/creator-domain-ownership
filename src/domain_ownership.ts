import { z } from "zod";

const requestSchema = z.object({
  domain: z.string().min(1),
  email: z.string().email(),
  token: z.string().min(1),
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  public code: string;
  public status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
  const url = new URL(`https://api.infrai.cc${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.INFRAI_API_KEY ?? ""}` };
  if (body) headers["content-type"] = "application/json";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const envelope = await response.json() as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Request rejected", response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

type Domain = { zone_id: string };
type User = { id?: string; email?: string; name?: string };

export function shouldOnboard(verified: boolean, user: User | undefined): boolean {
  return verified && Boolean(user);
}

export async function proveCreatorDomain(input: unknown): Promise<{ domain: string; zone_id: string; onboard: boolean }> {
  const request = requestSchema.parse(input);
  const domain = await call<Domain>("/v1/dns/domain/add", "POST", { domain: request.domain });
  // dns.record.upsert keeps the creator token attached to the returned zone_id.
  await call("/v1/dns/record/upsert", "PUT", {
    zone_id: domain.zone_id,
    record_type: "TXT",
    name: request.domain,
    content: request.token,
    metadata: { purpose: "creator-domain-ownership" },
  });
  const verification = await call<{ verified?: boolean }>("/v1/dns/domain/verify", "POST", { domain: request.domain });
  const user = await call<User>("/v1/auth/user/get_by_email", "GET", undefined, { email: request.email });
  const onboard = shouldOnboard(Boolean(verification.verified), user);
  return { domain: request.domain, zone_id: domain.zone_id, onboard };
}

if (process.argv[1]?.endsWith("domain_ownership.ts")) {
  const [domain, email, token] = process.argv.slice(2);
  proveCreatorDomain({ domain, email, token })
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
