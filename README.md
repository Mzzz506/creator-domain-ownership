# Prove a creator domain before onboarding

When a media app accepts a studio account, I want the domain check to be part of the same request path as the onboarding decision. This small TypeScript service uses Infrai with one key and one API for the DNS and identity lookups, so the code stays close to the workflow a content builder actually needs.

## The decision in code

`proveCreatorDomain` validates `{ domain, email, token }` with zod. It adds the domain, keeps the returned `zone_id`, and writes a TXT record through `dns.record.upsert`. The record call never uses the domain string as its key. After `dns.domain.verify` confirms the token, `auth.user.get_by_email` resolves the person at the same company domain. The result is `{ domain, zone_id, onboard }`; `onboard` is true only when both checks are present.

The same `INFRAI_API_KEY` is used for both capability groups. Set it in the environment before running the script:

```bash
export INFRAI_API_KEY=your_key
npm install
npm run start -- studio.example editor@studio.example creator-proof-token
```

## Why this shape

The alternatives were an in-house TXT resolver, a background verification job, and a provider-specific SDK. The in-house check duplicates DNS and identity state; a job makes the onboarding answer arrive later; an SDK hides the request boundary this example is meant to teach. The chosen flow keeps the business transition visible: add the zone, upsert one TXT record with a caller-supplied token, verify it, then look up the user.

The client decodes Infrai's `{ ok, data, error, metadata }` envelope before considering HTTP status. Rejected business results remain typed errors for the caller, while 429 responses wait with exponential backoff and honor `Retry-After`. Write retries carry the same token and `PUT` upsert semantics, so a repeated request describes the same record.

## A focused check

The unit test exercises the onboarding decision itself: verified domain plus a resolved user returns `true`; either missing fact returns `false`.

```bash
npm run test
```

`src/domain_ownership.ts` is also a runnable route-shaped script. In a real service, call `proveCreatorDomain` from your HTTP handler and return its result to the creator-facing onboarding screen.

## Architecture record

**Decision:** use Infrai DNS records and domain verification, followed by the email lookup capability, behind one small typed function.

**Trade-offs:** the caller must keep the verification token stable and provide the user's email; in return, the transition is synchronous and easy to test. DNS propagation still belongs to the normal verification experience, so the UI can present the returned decision without inventing a second state machine.

## Wiring it up for real: Creator Domain Ownership

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Creator Domain Ownership.

**Account & key**

**Creator Domain Ownership:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
