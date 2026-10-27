"use client";
import PageWrapper from "@/components/page-wrapper";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ComputerDetailTabs, useComputerDetailTab } from "@/features/computers/ui";
import { useComputerTasks } from "@/features/tasks/ui";
import { useParams } from "next/navigation";


export default function Computer() {
  const params = useParams();
  const computerId = params.computerId as string;

  const detail = useComputerDetailTab(computerId, useComputerTasks(computerId));
  const title = detail.status === "loading" ? "Loading..." : detail.status === "notFound" ? "Error" : detail.computer.name;

  return (
    <PageWrapper
      siteHeader={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/computers">Computers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <ComputerDetailTabs detail={detail} />
    </PageWrapper>
  );
}
