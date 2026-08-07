-- ============================================================================
-- seed.sql — demo data so a freshly-pushed database isn't an empty screen.
--
-- HOW TO RUN: sign up at least one account in the app first, then paste this
-- into the Supabase dashboard -> SQL Editor -> Run. It attaches everything to
-- the oldest existing profile and is safe to run more than once.
-- ============================================================================

do $$
declare
  v_user  uuid;
  v_house uuid;
begin
  select id into v_user from public.profiles order by created_at limit 1;

  if v_user is null then
    raise notice 'No profiles yet — sign up in the app first, then re-run this seed.';
    return;
  end if;

  -- Make the first account a landlord so listing/maintenance screens are usable.
  update public.profiles
  set role = 'LANDLORD',
      full_name = coalesce(nullif(full_name, ''), 'Demo Landlord')
  where id = v_user;

  -- A house, with the seed user as resident AND house admin.
  insert into public.houses (name, address, area, latitude, longitude, landlord_id)
  values ('Demo Mess — Bashundhara', 'House 12, Road 5, Block B', 'Bashundhara', 23.8103, 90.4125, v_user)
  on conflict do nothing
  returning id into v_house;

  if v_house is null then
    select id into v_house from public.houses where landlord_id = v_user order by created_at limit 1;
  end if;

  insert into public.house_members (house_id, user_id, role, is_house_admin, status)
  values (v_house, v_user, 'LANDLORD', true, 'ACTIVE')
  on conflict (house_id, user_id) do nothing;

  -- Listings across a price/lifestyle spread so the matching engine has
  -- something interesting to rank.
  insert into public.listings
    (landlord_id, house_id, title, description, rent, area, room_type, capacity,
     amenities, latitude, longitude, sleep_schedule, cleanliness, allows_smoking, allows_pets)
  values
    (v_user, v_house, 'Single room near BRACU', 'Furnished single with attached bath.',
     9000, 'Bashundhara', 'SINGLE', 1, '{wifi,attached bath,generator}',
     23.8103, 90.4125, 'EARLY_BIRD', 'VERY_TIDY', false, false),
    (v_user, v_house, 'Shared seat in 4-seater', 'Budget seat, meals included.',
     5500, 'Merul Badda', 'SEAT', 4, '{wifi,meals,fridge}',
     23.7806, 90.4258, 'NIGHT_OWL', 'MODERATE', true, false),
    (v_user, null, 'Master bedroom, Banani', 'Spacious master with balcony.',
     18000, 'Banani', 'MASTER', 2, '{wifi,balcony,lift,parking}',
     23.7936, 90.4043, 'FLEXIBLE', 'VERY_TIDY', false, true),
    (v_user, null, 'Entire 2-bed flat, Mohakhali', 'Whole flat, good for a small mess.',
     26000, 'Mohakhali', 'ENTIRE_FLAT', 4, '{wifi,lift,security}',
     23.7783, 90.4048, 'FLEXIBLE', 'MODERATE', false, false)
  on conflict do nothing;

  raise notice 'Seeded house % for user %', v_house, v_user;
end $$;
