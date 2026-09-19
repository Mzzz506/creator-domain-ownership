import { shouldOnboard } from "./domain_ownership.js";

const checks: Array<[boolean, object | undefined, boolean]> = [
  [true, { email: "editor@studio.example" }, true],
  [false, { email: "editor@studio.example" }, false],
  [true, undefined, false],
];

for (const [verified, user, expected] of checks) {
  if (shouldOnboard(verified, user) !== expected) throw new Error("onboarding decision mismatch");
}
console.log("domain ownership decision checks passed");
