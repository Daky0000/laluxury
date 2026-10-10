import assert from "node:assert/strict";
import { cartRecoveryBlockReason } from "../src/lib/notification-policy";

const eligible = {
  convertedOrderId: null,
  recoveryEmailSentAt: null,
  user: { isActive: true, acceptsMarketing: true, marketingConsentAt: new Date() },
};
assert.equal(cartRecoveryBlockReason(eligible), null);
assert.match(cartRecoveryBlockReason({ ...eligible, convertedOrderId: "paid-order" })!, /converted/);
assert.match(cartRecoveryBlockReason({ ...eligible, recoveryEmailSentAt: new Date() })!, /already/);
assert.match(cartRecoveryBlockReason({ ...eligible, user: null })!, /consent/);
for (const change of [
  { isActive: false },
  { acceptsMarketing: false },
  { marketingConsentAt: null },
]) {
  assert.match(cartRecoveryBlockReason({ ...eligible, user: { ...eligible.user, ...change } })!, /consent/);
}
// Revocation must take effect on the next send, rather than at cart creation.
eligible.user.acceptsMarketing = false;
assert.match(cartRecoveryBlockReason(eligible)!, /consent/);
console.log("Notification recovery policy checks passed.");
