# Frontend Migration Guide: tRPC → Convex

## Quick Reference

### Import Changes
```tsx
// OLD (tRPC)
import { api } from "@/trpc/react";

// NEW (Convex)
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
```

### Query Pattern
```tsx
// OLD (tRPC)
const { data, isLoading, refetch } = api.computer.getAll.useQuery();

// NEW (Convex) - automatically reactive!
const data = useQuery(api.computers.list);
const isLoading = data === undefined;
// No refetch needed - Convex updates automatically on data changes
```

### Mutation Pattern
```tsx
// OLD (tRPC)
const mutation = api.group.create.useMutation({
  onSuccess: () => refetch(),
});
mutation.mutate({ name: "Test" });

// NEW (Convex)
const createGroup = useMutation(api.groups.create);
await createGroup({ name: "Test" });
// No refetch needed - queries update automatically
```

### Pagination Pattern
```tsx
// OLD (tRPC): Manual pagination with refetch
const { data, refetch } = api.rustdesk.get.useQuery({
  range: { skip, limit },
  sort: sorting,
});

// NEW (Convex): Use query args
const data = useQuery(api.computers.list, { 
  skip, 
  limit, 
  sort: sorting 
});
```

### Realtime Pattern
```tsx
// OLD (Supabase Realtime)
useEffect(() => {
  const channel = supabase
    .channel("changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "computers" }, () => {
      refetch();
    });
  channel.subscribe();
  return () => channel.unsubscribe();
}, []);

// NEW (Convex): AUTOMATIC! 
// useQuery is automatically reactive - no subscription needed
const computers = useQuery(api.computers.list);
// This updates in real-time when data changes
```

## Router Mapping

| tRPC Router | Convex Module | Status |
|-------------|---------------|--------|
| `rustdesk` | `computers` | ✅ Created |
| `computer` | `computers` | ✅ Created |
| `group` | `staticGroups` | ⏳ TODO |
| `dynamicGroup` | `groups` | ✅ Created |
| `app` | `apps` + `releases` | ✅ Created |
| `client` | `client` | ✅ Created |
| `key` | `enrollmentTokens` | ⏳ TODO |
| `account` | `users` (Clerk) | ⏳ TODO |

## File-by-File Migration Checklist

### High Priority (Core Features)
- [ ] `app/admin/rustdesk/data-table.tsx`
- [ ] `app/admin/rustdesk/rowOptions.tsx`
- [ ] `app/admin/groups/dynamic/data-table.tsx`
- [ ] `app/admin/groups/static/data-table.tsx`
- [ ] `app/admin/groups/static/rowOptions.tsx`

### Medium Priority (Apps)
- [ ] `app/admin/apps/data-table.tsx`
- [ ] `app/admin/apps/rowOptions.tsx`
- [ ] `app/admin/apps/create/create-form.tsx`
- [ ] `app/admin/apps/[id]/page.tsx`
- [ ] `app/admin/apps/[id]/releases-table.tsx`
- [ ] `app/admin/apps/[id]/edit-app-sheet.tsx`
- [ ] `app/admin/apps/[id]/release-sheet.tsx`

### Lower Priority (Admin)
- [ ] `app/admin/client/data-table.tsx`
- [ ] `app/admin/client/row-options.tsx`
- [ ] `app/admin/keys/data-table.tsx`
- [ ] `app/admin/keys/rowOptions.tsx`
- [ ] `app/admin/keys/createNewKeyDialog.tsx`
- [ ] `app/admin/account/profile-form.tsx`
- [ ] `app/admin/account/password-form.tsx`
