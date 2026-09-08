-- الدلاء الأربعة. كلها خاصة ما عدا الميديا التسويقية.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',      'avatars',      false, 5242880,  array['image/jpeg','image/png','image/webp']),
  ('sbota-photos', 'sbota-photos', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('receipts',     'receipts',     false, 5242880,  array['image/jpeg','image/png','image/webp','application/pdf']),
  ('public-media', 'public-media', true,  10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ===== avatars: كل واحد يرفع ويقرأ صورته هو بس =====
-- المسار: <profile_id>/<filename> — أول جزء لازم يكون معرّف المستخدم
create policy avatars_own_read on storage.objects for select
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_own_write on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_own_update on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_own_delete on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- الكابتن بيقرأ صور مجموعته بعد الكشف
create policy avatars_captain_read on storage.objects for select
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from bookings b
      where b.profile_id::text = (storage.foldername(name))[1]
        and b.status in ('paid','attended')
        and fn_is_my_sbota_revealed(b.sbota_id)
    )
  );

-- والمتبادلين بيشوفوا صور بعض
create policy avatars_mutual_read on storage.objects for select
  using (
    bucket_id = 'avatars'
    and fn_is_mutual(((storage.foldername(name))[1])::uuid)
  );

-- ===== sbota-photos: الكابتن بيرفع، والأعضاء بيقروا بعد النشر =====
create policy photos_captain_write on storage.objects for insert
  with check (
    bucket_id = 'sbota-photos'
    and exists (
      select 1 from sbotat s
      where s.id::text = (storage.foldername(name))[1]
        and s.captain_id = fn_my_captain_id()
    )
  );

create policy photos_member_read on storage.objects for select
  using (
    bucket_id = 'sbota-photos'
    and exists (
      select 1 from sbota_photos sp
      join bookings b on b.sbota_id = sp.sbota_id
      where sp.path = name
        and sp.published_to_members_at is not null
        and b.profile_id = auth.uid()
        and b.status in ('paid','attended')
    )
  );

create policy photos_captain_read on storage.objects for select
  using (
    bucket_id = 'sbota-photos'
    and exists (
      select 1 from sbotat s
      where s.id::text = (storage.foldername(name))[1]
        and s.captain_id = fn_my_captain_id()
    )
  );

-- ===== receipts: صاحب الحجز يرفع، والإدارة بس اللي بتقرأ =====
create policy receipts_own_write on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from bookings b
      where b.id::text = (storage.foldername(name))[1] and b.profile_id = auth.uid()
    )
  );

create policy receipts_admin_read on storage.objects for select
  using (bucket_id = 'receipts' and fn_is_admin());

-- ===== public-media: قراءة للكل، والكتابة للإدارة =====
create policy media_read on storage.objects for select
  using (bucket_id = 'public-media');

create policy media_admin_write on storage.objects for insert
  with check (bucket_id = 'public-media' and fn_is_admin());;
