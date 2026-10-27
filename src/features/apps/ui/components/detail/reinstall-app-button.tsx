"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { useRequestReinstallForApp } from "../../api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ReinstallAppButton({ appId }: { appId: string }) {
  const [open, setOpen] = useState(false);
  const requestReinstallForApp = useRequestReinstallForApp();

  async function handleConfirm() {
    try {
      const { requested } = await requestReinstallForApp({ appId });
      toast.success(requested === 0 ? "No devices to reinstall" : `Reinstall requested on ${requested} device(s)`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to request reinstall");
    }
    setOpen(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reinstall
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reinstall on all devices?</AlertDialogTitle>
          <AlertDialogDescription>
            Every device where this app is installed or failed to install will uninstall it and run the
            install script again during its next application sync. To reinstall on a single device, use
            Device install status.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Reinstall</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
