"use server";

import { requirePermission } from "@/lib/auth";
import {
  checkMomoPin,
  initiateMomoPinPush,
  submitMomoPushOtp,
  type MomoPushResult,
} from "@/lib/momo-push";
import type { MomoProvider } from "@/lib/paystack";

// The actor always comes from the session here. These are callable from any
// browser, so nothing identity-related is accepted as an argument.

export async function initiateMomoPinPushAction(args: {
  orderId: string;
  phone: string;
  provider?: "auto" | MomoProvider;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
}): Promise<MomoPushResult> {
  const actor = await requirePermission("orders:write");
  return initiateMomoPinPush({ ...args, actor, allowDepositChange: true });
}

export async function submitMomoPushOtpAction(args: {
  orderId: string;
  reference: string;
  otp: string;
}): Promise<MomoPushResult> {
  await requirePermission("orders:write");
  return submitMomoPushOtp(args);
}

export async function checkOrConfirmMomoPinAction(args: {
  orderId: string;
  reference: string;
  chargeScope?: "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE";
}): Promise<{ ok: boolean; paid: boolean; message: string }> {
  const actor = await requirePermission("orders:write");
  return checkMomoPin({ ...args, actor });
}
