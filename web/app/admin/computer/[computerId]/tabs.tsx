"use client";
import { useState } from "react";
import { Computer } from "../../columns";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

enum Tab {
  OVERVIEW,
}

type Props = {
  computer: Computer;
};

type TableRowProps = {
  name: string;
  value: string;
};

export default function Tabs({ computer }: Props) {
  const [tab, setTab] = useState(Tab.OVERVIEW);
  const supabase = createClient();
  const tasks = supabase
    .from("tasks")
    .select("task, status, created_at, error")
    .eq("computer_id", computer.id);

  function handleChangePassword(password: string) {
    const taskData = { password };
    supabase
      .from("tasks")
      .insert({ task: "SET_PASSWD", status: "PENDING", task_data: taskData });
  }

  return (
    <div className="flex gap-5 w-full">
      <div>
        <ul>
          <li className="cursor-pointer" onClick={() => setTab(Tab.OVERVIEW)}>
            Overview
          </li>
        </ul>
      </div>
      <div className="flex flex-col px-3 w-full gap-3">
        <div className="flex gap-2 mb-2">
          <ChangePasswordDialog />
        </div>
        <hr />
        {tab === Tab.OVERVIEW && (
          <div className="flex flex-col gap-3 w-full">
            <table className="w-full">
              <tbody>
                <TableRow
                  name="RustDesk ID"
                  value={computer.rustdeskID.toString() ?? ""}
                />
                <TableRow name="Computer name" value={computer.name} />
                <TableRow name="Computer IP" value={computer.ip ?? ""} />
                <TableRow name="User" value={computer.loginUser ?? ""} />
                {computer.lastConnection && (
                  <TableRow
                    name="Last check-in time"
                    value={new Date(computer.lastConnection).toLocaleString(
                      "cs"
                    )}
                  />
                )}
                <TableRow name="Windows type" value={computer.os ?? ""} />
                <TableRow
                  name="Windows version"
                  value={computer.osVersion ?? ""}
                />
              </tbody>
            </table>
            <hr className="w-full" />
            <div>
              <h2>Device actions</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-5 py-2 text-left">Action</th>
                    <th className="px-5 py-2 text-left">Status</th>
                    <th className="px-5 py-2 text-left">Date/Time</th>
                    <th className="px-5 py-2 text-left">Error</th>
                  </tr>
                </thead>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TableRow({ name, value }: TableRowProps) {
  return (
    <tr>
      <td className="py-1 pr-2 whitespace-nowrap">{name}</td>
      <td className="py-1">
        <span className="px-2">:</span>
        <span>{value}</span>
      </td>
    </tr>
  );
}

function ChangePasswordDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={"secondary"}>Change password</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set new RustDesk password</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
