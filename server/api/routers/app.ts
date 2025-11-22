import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { createAppSchema } from "@/lib/schemas/create-app";
import {
  buildReleaseAssetPath,
  deleteStoredFile,
  moveStoredFileWithinBucket,
} from "@/lib/storage/temp-storage";

export const appRouter = createTRPCRouter({
  getTableData: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.from("apps").select(`
      id,
      display_name,
      description,
      created_at,
      updated_at,
      computer_group_apps(
        computer_groups(id, display_name)
      )
    `);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to get apps",
        cause: (error as any)?.cause ?? error.message,
      });
    }

    const toArray = (v: unknown) =>
      Array.isArray(v)
        ? v
        : v && typeof v === "object"
          ? Object.values(v as Record<string, unknown>)
          : [];

    const outData = (data ?? []).map((app: any) => {
      const groups = toArray(app?.computer_group_apps)
        .map((gm: any) => {
          const compObj = Array.isArray(gm?.computer_groups)
            ? gm.computer_groups[0]
            : gm?.computer_groups;
          if (!compObj || typeof compObj !== "object") return null;

          const id = String((compObj as any)?.id ?? "");
          const name = String((compObj as any)?.display_name ?? "");
          if (!id) return null;

          return { id, name };
        })
        .filter(Boolean) as { id: string; name: string }[];

      return {
        id: String(app.id),
        displayName: String(app.display_name ?? ""),
        createdAt: app.created_at ?? null,
        updatedAt: app.updated_at ?? null,
        groups: groups,
        groupsCount: groups.length,
      };
    });

    return outData;
  }),
  create: protectedProcedure.input(createAppSchema).mutation(async ({ ctx, input }) => {
    return await ctx.db.begin(async (sql) => {
      // create app
      const appInfo = input.appInfo;
      const [app] = await sql`
        insert into apps ${sql({
        display_name: appInfo.name,
        description: appInfo.description,
        publisher: appInfo.publisher,
      })}
        returning id
      `;

      if (!app) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create app",
        });
      }
      const appId = app.id;

      // Release
      const release = input.release;

      const insertRelese = {
        installer_type: release.type,
        app_id: appId,
        version: release.version,
      };

      const [releaseData] = await sql`
        insert into releases ${sql(insertRelese)}
        returning id
      `;

      if (!releaseData) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to create release",
        });
      }
      const releaseId = releaseData.id;

      if (release.type === "winget") {
        const wingetReleaseInsert = {
          release_id: releaseId,
          winget_id: release.wingetId,
        };
        await sql`
          insert into winget_releases ${sql(wingetReleaseInsert)}
        `;
      } else if (release.type === "win32") {
        const installBinary = release.installBinary;

        if (
          !installBinary ||
          !release.installScript ||
          !release.uninstallScript
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Missing required win32 release data",
          });
        }

        const destinationPath = buildReleaseAssetPath({
          appId,
          releaseId,
          filename: installBinary.name,
          category: "installers",
        });

        console.log("destinationPath", destinationPath);

        const movedBinary = await moveStoredFileWithinBucket({
          supabase: ctx.supabase,
          file: installBinary,
          destinationPath,
        }).catch((moveError) => {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to move installer binary",
            cause: moveError,
          });
        });

        const win32ReleaseInsert = {
          release_id: releaseId,
          install_script: release.installScript,
          uninstall_script: release.uninstallScript,
          install_binary_bucket: movedBinary.bucket,
          install_binary_path: movedBinary.path,
          install_binary_size: movedBinary.size,
        };

        try {
          await sql`
            insert into win32_releases ${sql(win32ReleaseInsert)}
          `;
        } catch (err) {
          // If the DB insert fails, we must cleanup the moved file
          await deleteStoredFile({
            file: movedBinary,
          }).catch(() => undefined);
          throw err;
        }
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No correct release provided",
        });
      }
    });
  }),
});
