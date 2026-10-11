import type { XummTypes } from "xumm-sdk";

type XummPayload = XummTypes.XummGetPayloadResponse;

export type PayloadStatus = "pending" | "opened" | "signed" | "rejected" | "expired" | "cancelled";

export interface PayloadView {
  uuid: string;
  status: PayloadStatus;
  account?: string;
  hex?: string;
  txid?: string;
  network?: string;
}

export function statusOf(p: XummPayload): PayloadStatus {
  const m = p.meta;
  if (m.signed) return "signed";
  if (m.cancelled) return "cancelled";
  if (m.expired) return "expired";
  // Resolved without a signature and not cancelled/expired: the user declined.
  if (m.resolved) return "rejected";
  if (m.app_opened) return "opened";
  return "pending";
}

// Allow-list what leaves the server. Never forward request_json, app info or raw upstream bodies.
export function toView(uuid: string, p: XummPayload): PayloadView {
  const status = statusOf(p);
  const view: PayloadView = { uuid, status };
  if (status === "signed") {
    const r = p.response;
    if (r.account) view.account = r.account;
    if (r.hex) view.hex = r.hex;
    if (r.txid) view.txid = r.txid;
    const net = r.environment_nodetype ?? p.meta.force_network;
    if (net) view.network = net.toLowerCase();
  }
  return view;
}
