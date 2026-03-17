# Migration 071: Event Players First-Class

## Summary

Joint events are now first-class. Single and joint events use the same model.

## Schema

- **events** — Canonical event record (unchanged)
- **event_societies** — Participating societies (1 row = single, N rows = joint)
- **event_players** — Selected players (members + guests). Single source of truth.

## Rules

- Single-society event = 1 event + 1 event_societies row
- Joint event = 1 event + multiple event_societies rows
- Players always in event_players (members via member_id, guests via event_guest_id)
- Eligible members = all members whose society_id exists in event_societies for that event

## Migration Steps

1. Run `071_event_players_first_class.sql`
2. Backfill: events.player_ids → event_players (member rows)
3. Backfill: event_guests → event_players (guest rows)
4. Backfill: events without event_societies get host society row

## Repo Changes

- **eventPlayerRepo** (new): getEventPlayers, getEventMemberIds, setEventPlayers, setEventPlayersFromIds, addEventPlayerGuest, removeEventPlayerGuest
- **eventRepo**: getEvent uses getEventMemberIds (event_players); updateEvent writes to event_players via setEventPlayersFromIds
- **eventGuestRepo**: addEventGuest also calls addEventPlayerGuest; deleteEventGuest also calls removeEventPlayerGuest

## Players Screen

- Unified load: event → participatingSocietyIds → getMembersBySocietyIds → members
- selectedPlayerIds from event.playerIds (backed by event_players)
- No separate path for joint vs single; same component structure

## Rollback

If needed, events.player_ids can be repopulated from event_players for backward compatibility. The migration does not drop events.player_ids.
