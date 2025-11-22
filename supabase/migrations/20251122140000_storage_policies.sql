
insert into storage.buckets (id, name, public)
values ('internal', 'internal', false)
on conflict (id) do nothing;

create policy "Authenticated can upload to internal"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'internal' );

create policy "Authenticated can select from internal"
on storage.objects for select
to authenticated
using ( bucket_id = 'internal' );

create policy "Authenticated can delete from internal"
on storage.objects for delete
to authenticated
using ( bucket_id = 'internal' );

create policy "Authenticated can update in internal"
on storage.objects for update
to authenticated
using ( bucket_id = 'internal' );
