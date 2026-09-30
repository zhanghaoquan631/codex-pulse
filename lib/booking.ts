import { database } from '@/db/raw';
import { currentRelay, relayKey } from '@/lib/local-apps-api';

export type Booking = { id: string; fingerprint: string; date: string; time: string; name: string; email: string; notes: string; starts: number; ends: number; notification: string; created: number };
export const bookingHeaders = { 'Cache-Control': 'no-store, private', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
export const bookingReply = (body: unknown, status = 200) => Response.json(body, { status, headers: bookingHeaders });
export const bookingFields = 'id,fingerprint,date,time,name,email,notes,starts,ends,notification,created';

// The existing loopback gateway keeps a durable receipt for this UUID before sending mail.
// A lost response is reconciled through that receipt; it never creates another send.
export async function notifyBooking(booking: Booking, start = false) {
  if (booking.notification === 'sent' || booking.notification === 'failed') return booking.notification;
  let relay;
  try { relay = await currentRelay(); } catch { return booking.notification; }
  if (!relay) return booking.notification;
  const key = await relayKey();
  let status = booking.notification;
  try {
    if (start && (status === 'pending' || status === 'sending' && Date.now() - booking.created < 6 * 86400000)) {
      if (status === 'pending') {
        const claim = await database().prepare("UPDATE booking_requests SET notification='sending' WHERE id=? AND notification='pending'").bind(booking.id).run();
        if (!claim.meta.changes) return status;
      }
      status = 'sending';
      const response = await fetch(relay.relay_url + '/relay/booking/book', {
        method: 'POST', headers: { 'X-Pulse-Relay-Key': key, 'X-Pulse-Operation-Id': booking.id, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: booking.date, time: booking.time, name: booking.name, email: booking.email, notes: booking.notes }),
        redirect: 'manual', signal: AbortSignal.timeout(25000),
      });
      const body = await response.json() as { ok?: boolean; relayPending?: boolean; uncertain?: boolean };
      if (response.ok && body.ok) status = 'sent';
      else if (!body.relayPending && !body.uncertain && response.status !== 409) status = 'failed';
    } else if (status === 'sending') {
      const response = await fetch(relay.relay_url + '/operations/' + booking.id, { headers: { 'X-Pulse-Relay-Key': key }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const receipt = await response.json() as { state: string; status?: number; body?: { ok?: boolean } };
        if (receipt.state === 'done') status = receipt.status === 200 && receipt.body?.ok ? 'sent' : 'failed';
      }
    }
    if (status !== 'pending') await database().prepare("UPDATE booking_requests SET notification=? WHERE id=? AND notification NOT IN ('sent','failed')").bind(status, booking.id).run();
  } catch { /* The booking is durable; keep the receipt pending when delivery is uncertain. */ }
  return status;
}
