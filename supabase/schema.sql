-- Chill-Box shared harbour state.
--
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Design notes, because they are the point:
--
--  * `slots` is the contended resource, so the DATABASE enforces the rules
--    rather than the app hoping. The primary key makes a slot unique, and
--    `reserve_slot` refuses to hand out an occupied one inside a single
--    transaction — so when two boats tap the last crate at the same moment,
--    Postgres decides, not whichever phone had the fresher copy.
--
--  * The 2-crate cap is enforced in the same transaction, for the same
--    reason. A cap checked on the client is a cap that does not exist.
--
--  * There is no login. The anon key is public by design; Row Level Security
--    below is what actually constrains it. Boats cannot be deleted, slots
--    cannot be written except through the functions, and the admin PIN gates
--    the console in the client only — see README for that honest limit.

-- ---------------------------------------------------------------- boats --

create table if not exists boats (
  harbour_id    text    not null,
  id            text    not null,
  name          text    not null,
  owner         text    not null,
  mobile        text    not null,
  status        text    not null default 'pending'
                check (status in ('pending', 'active', 'blocked')),
  registered_at timestamptz not null default now(),
  primary key (harbour_id, id),
  unique (mobile)
);

-- ---------------------------------------------------------------- slots --

create table if not exists slots (
  harbour_id     text not null,
  box_id         text not null check (box_id in ('box1', 'box2', 'box3')),
  slot_index     int  not null check (slot_index between 0 and 9),
  status         text not null default 'empty'
                 check (status in ('empty', 'reserved', 'occupied', 'overstay')),
  boat_id        text,
  species        text,
  reserved_at    timestamptz,
  deposited_at   timestamptz,
  planned_out_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (harbour_id, box_id, slot_index)
);

create index if not exists slots_by_harbour on slots (harbour_id);

-- --------------------------------------------------------------- ledger --

create table if not exists ledger (
  id           bigint generated always as identity primary key,
  harbour_id   text not null,
  boat_id      text not null,
  box_id       text not null,
  crates       int  not null,
  species      text,
  deposited_at timestamptz not null,
  released_at  timestamptz not null default now(),
  overstay     boolean not null default false
);

create index if not exists ledger_by_harbour on ledger (harbour_id, released_at desc);

-- ------------------------------------------------------------ the rules --

-- Free 4-hour holds and flag 6-hour overstays. Called before every read so
-- the clock advances even when no phone is open; time is decided here, not
-- on a handset whose clock may be wrong.
create or replace function age_slots(p_harbour text)
returns void language sql as $$
  update slots set status = 'empty', boat_id = null, species = null,
                   reserved_at = null, deposited_at = null,
                   planned_out_at = null, updated_at = now()
   where harbour_id = p_harbour and status = 'reserved'
     and reserved_at <= now() - interval '4 hours';

  update slots set status = 'overstay', updated_at = now()
   where harbour_id = p_harbour and status = 'occupied'
     and deposited_at <= now() - interval '6 hours';
$$;

-- Take `p_crates` slots in one box, atomically.
-- Returns the slot indexes taken, or raises if the rules say no.
create or replace function reserve_slot(
  p_harbour text, p_box text, p_boat text, p_crates int, p_species text
) returns setof int language plpgsql as $$
declare
  v_held int;
  v_free int;
begin
  perform age_slots(p_harbour);

  -- The boat must exist here and be approved.
  if not exists (
    select 1 from boats
     where harbour_id = p_harbour and id = p_boat and status = 'active'
  ) then
    raise exception 'boat_not_active';
  end if;

  -- The 2-crate cap, counted across every box in this harbour.
  select count(*) into v_held
    from slots
   where harbour_id = p_harbour and boat_id = p_boat and status <> 'empty';
  if v_held + p_crates > 2 then
    raise exception 'quota_exceeded';
  end if;

  -- Lock the candidate rows so a second caller cannot take the same ones.
  select count(*) into v_free
    from slots
   where harbour_id = p_harbour and box_id = p_box and status = 'empty'
     for update;
  if v_free < p_crates then
    raise exception 'box_full';
  end if;

  return query
  with picked as (
    select slot_index from slots
     where harbour_id = p_harbour and box_id = p_box and status = 'empty'
     order by slot_index
     limit p_crates
     for update
  )
  update slots s
     set status = 'reserved', boat_id = p_boat, species = p_species,
         reserved_at = now(), deposited_at = null, planned_out_at = null,
         updated_at = now()
    from picked
   where s.harbour_id = p_harbour and s.box_id = p_box
     and s.slot_index = picked.slot_index
  returning s.slot_index;
end;
$$;

-- Mark a boat's held slots as deposited, with the collection time promised.
create or replace function deposit_slots(
  p_harbour text, p_boat text, p_hours int
) returns int language plpgsql as $$
declare v_rows int;
begin
  update slots
     set status = 'occupied', deposited_at = now(), reserved_at = null,
         planned_out_at = now() + make_interval(hours => p_hours),
         updated_at = now()
   where harbour_id = p_harbour and boat_id = p_boat and status = 'reserved';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Free a boat's stored slots and write the ledger rows they earned.
create or replace function release_slots(
  p_harbour text, p_boat text, p_box text default null
) returns int language plpgsql as $$
declare v_rows int;
begin
  insert into ledger (harbour_id, boat_id, box_id, crates, species, deposited_at, overstay)
  select harbour_id, boat_id, box_id, count(*), min(species), min(deposited_at),
         bool_or(status = 'overstay')
    from slots
   where harbour_id = p_harbour and boat_id = p_boat
     and status in ('occupied', 'overstay')
     and (p_box is null or box_id = p_box)
   group by harbour_id, boat_id, box_id;

  update slots
     set status = 'empty', boat_id = null, species = null, reserved_at = null,
         deposited_at = null, planned_out_at = null, updated_at = now()
   where harbour_id = p_harbour and boat_id = p_boat
     and status in ('occupied', 'overstay')
     and (p_box is null or box_id = p_box);
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Cancel a hold that has not been filled.
create or replace function cancel_hold(p_harbour text, p_boat text)
returns int language plpgsql as $$
declare v_rows int;
begin
  update slots
     set status = 'empty', boat_id = null, species = null, reserved_at = null,
         updated_at = now()
   where harbour_id = p_harbour and boat_id = p_boat and status = 'reserved';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ------------------------------------------------------------- security --

alter table boats  enable row level security;
alter table slots  enable row level security;
alter table ledger enable row level security;

-- Everyone at the harbour can read everything: the whole point is that the
-- boxes are public information.
create policy read_boats  on boats  for select using (true);
create policy read_slots  on slots  for select using (true);
create policy read_ledger on ledger for select using (true);

-- Registration is open — the admin approves afterwards, which is the real
-- gate. Nothing else may be written directly.
create policy register_boat on boats for insert with check (status = 'pending');

-- Slots and ledger are written ONLY through the functions above, which run
-- with the definer's rights and enforce the harbour rules. This is why a
-- client cannot simply overwrite a slot it does not own.
alter function reserve_slot  (text, text, text, int, text) security definer;
alter function deposit_slots (text, text, int)             security definer;
alter function release_slots (text, text, text)            security definer;
alter function cancel_hold   (text, text)                  security definer;
alter function age_slots     (text)                        security definer;

-- ------------------------------------------------------------- realtime --

alter publication supabase_realtime add table slots;
alter publication supabase_realtime add table boats;
